import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, parseUnits, formatUnits, isAddress, http, encodeAbiParameters, keccak256 } from "viem";
import { createHmac } from "crypto";

import { publicClient, writeContractWithRetry } from "@/lib/rpc";

// Contract addresses
const CONTRACTS = {
  PAYSPAWN_SPENDER_V5: (process.env.PAYSPAWN_SPENDER_V5 || "").trim() as `0x${string}`, // V5.1 - no open payEOA, relayer-only
  PAYSPAWN_SPENDER_V4: "0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" as `0x${string}`, // V4 - dual path (smart wallet + EOA direct)
  PAYSPAWN_SPENDER_V3: "0x0B31146b3d8F17af874dfF03E783336b20577E04" as `0x${string}`, // V3 - legacy
  SPEND_PERMISSION_MANAGER: "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
};

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const RECEIPT_SIGNING_KEY = process.env.RECEIPT_SIGNING_KEY;

// V5 ABI — payEOAV5, batchPayEOAV5, pauseCredential, unpauseCredential
const PAYSPAWN_V5_ABI = [
  {
    name: "payEOAV5",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permission",
        type: "tuple",
        components: [
          { name: "account",      type: "address"   },
          { name: "spender",      type: "address"   },
          { name: "token",        type: "address"   },
          { name: "allowance",    type: "uint256"   },
          { name: "period",       type: "uint48"    },
          { name: "start",        type: "uint48"    },
          { name: "end",          type: "uint48"    },
          { name: "salt",         type: "uint256"   },
          { name: "maxPerTx",     type: "uint256"   },
          { name: "allowedTo",    type: "address[]" },
          { name: "maxTxPerHour", type: "uint8"     },
          { name: "parentHash",   type: "bytes32"   },
        ],
      },
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo",   type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "pauseCredential",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "credentialHash", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "unpauseCredential",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "credentialHash", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "computeCredentialHash",
    type: "function",
    stateMutability: "pure",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "account",      type: "address"   },
          { name: "spender",      type: "address"   },
          { name: "token",        type: "address"   },
          { name: "allowance",    type: "uint256"   },
          { name: "period",       type: "uint48"    },
          { name: "start",        type: "uint48"    },
          { name: "end",          type: "uint48"    },
          { name: "salt",         type: "uint256"   },
          { name: "maxPerTx",     type: "uint256"   },
          { name: "allowedTo",    type: "address[]" },
          { name: "maxTxPerHour", type: "uint8"     },
          { name: "parentHash",   type: "bytes32"   },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    name: "calculateFee",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ABIs for PaySpawnSpenderV4 (legacy + backward compat)
const PAYSPAWN_SPENDER_ABI = [
  {
    name: "pay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
      { name: "signature", type: "bytes" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "payWithApprovedPermission",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "payEOA",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "calculateFee",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const SPEND_PERMISSION_MANAGER_ABI = [
  {
    name: "isApproved",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "spendPermission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ENS resolution
const mainnetClient = createPublicClient({
  chain: { 
    id: 1, 
    name: 'Ethereum', 
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, 
    rpcUrls: { default: { http: ['https://eth.llamarpc.com'] } } 
  },
  transport: http(),
});

// PaySpawn Names contract on Base
const NAMES_CONTRACT = "0xc653c91524B5D72Adb767151d30b606A727be2E4" as `0x${string}`;

const NAMES_ABI = [
  {
    name: "resolve",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "address" }],
  },
] as const;

// PaySpawn name resolution (alice.pay -> 0x...)
async function resolvePaySpawnName(name: string): Promise<string | null> {
  try {
    const resolvedAddress = await publicClient.readContract({
      address: NAMES_CONTRACT,
      abi: NAMES_ABI,
      functionName: "resolve",
      args: [name],
    });
    
    if (resolvedAddress === "0x0000000000000000000000000000000000000000") {
      return null;
    }
    
    return resolvedAddress;
  } catch (error) {
    console.error("PaySpawn name resolution error:", error);
    return null;
  }
}

async function resolveRecipient(toValue: string): Promise<{ address: string; name?: string } | null> {
  // Direct address
  if (isAddress(toValue)) {
    return { address: toValue.toLowerCase() };
  }

  const lowerTo = toValue.toLowerCase();

  // PaySpawn name (alice.pay)
  if (lowerTo.endsWith('.pay')) {
    const address = await resolvePaySpawnName(lowerTo.replace('.pay', ''));
    if (address) return { address: address.toLowerCase(), name: lowerTo };
    return null;
  }

  // ENS name (vitalik.eth)
  if (lowerTo.endsWith('.eth') && !lowerTo.endsWith('.base.eth')) {
    try {
      const ensAddress = await mainnetClient.getEnsAddress({ name: lowerTo });
      if (ensAddress) return { address: ensAddress.toLowerCase(), name: lowerTo };
    } catch {}
    return null;
  }

  // Base ENS name (name.base.eth)
  if (lowerTo.endsWith('.base.eth')) {
    try {
      const baseClient = publicClient;
      const baseAddress = await baseClient.getEnsAddress({ name: lowerTo });
      if (baseAddress) return { address: baseAddress.toLowerCase(), name: lowerTo };
    } catch {}
    return null;
  }

  return null;
}

// Decode credential from base64
function decodeCredential(credentialString: string): {
  signature: string;
  permission: Record<string, any>;
} | null {
  try {
    const decoded = Buffer.from(credentialString, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** True if the credential uses PermissionV5 (has any V5-only fields) */
function isV5Credential(permission: Record<string, any>): boolean {
  return (
    permission.maxPerTx !== undefined ||
    permission.allowedTo !== undefined ||
    permission.maxTxPerHour !== undefined ||
    permission.parentHash !== undefined
  );
}

/** Format a V5 permission for the on-chain call */
function formatPermissionV5ForContract(permission: Record<string, any>) {
  return {
    account:      permission.account      as `0x${string}`,
    spender:      permission.spender      as `0x${string}`,
    token:        permission.token        as `0x${string}`,
    allowance:    BigInt(permission.allowance),
    period:       Number(permission.period),
    start:        Number(permission.start),
    end:          Number(permission.end),
    salt:         BigInt(permission.salt),
    maxPerTx:     BigInt(permission.maxPerTx     ?? 0),
    allowedTo:    (permission.allowedTo    ?? []) as `0x${string}`[],
    maxTxPerHour: Number(permission.maxTxPerHour ?? 0),
    parentHash:   (permission.parentHash   ?? "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
  };
}

/** Format a V4 permission for the on-chain call */
function formatPermissionForContract(permission: Record<string, any>) {
  return {
    account:   permission.account   as `0x${string}`,
    spender:   permission.spender   as `0x${string}`,
    token:     permission.token     as `0x${string}`,
    allowance: BigInt(permission.allowance),
    period:    Number(permission.period),
    start:     Number(permission.start),
    end:       Number(permission.end),
    salt:      BigInt(permission.salt),
    extraData: (permission.extraData || "0x") as `0x${string}`,
  };
}

/** Build and sign a payment receipt for agent-to-agent verification */
function buildSignedReceipt(opts: {
  txHash: string;
  from: string;
  to: string;
  amount: number;
  memo: string;
  version: string;
}) {
  const receipt = {
    txHash:    opts.txHash,
    from:      opts.from,
    to:        opts.to,
    amount:    opts.amount,
    memo:      opts.memo,
    timestamp: Math.floor(Date.now() / 1000),
    version:   opts.version,
    signature: "",
  };
  const payload = JSON.stringify({
    txHash:    receipt.txHash,
    from:      receipt.from,
    to:        receipt.to,
    amount:    receipt.amount,
    memo:      receipt.memo,
    timestamp: receipt.timestamp,
    version:   receipt.version,
  });
  receipt.signature = createHmac("sha256", RECEIPT_SIGNING_KEY).update(payload).digest("hex");
  return receipt;
}

/** Validate webhook URL — block SSRF vectors */
function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const h = parsed.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false;
    if (h.startsWith("169.254.")) return false; // AWS/cloud metadata
    if (h.startsWith("10."))      return false; // RFC-1918 private
    if (h.startsWith("172.16.") || h.startsWith("172.31.")) return false;
    if (h.startsWith("192.168.")) return false;
    if (h.endsWith(".internal") || h.endsWith(".local")) return false;
    return true;
  } catch { return false; }
}

/** Fire a webhook (fire-and-forget — never throws) */
async function fireWebhook(url: string, payload: object): Promise<void> {
  try {
    await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-PaySpawn-Webhook": "1" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(5000),
    });
  } catch {
    // intentionally swallowed — webhook failure never fails the payment
  }
}

export async function POST(request: NextRequest) {
  if (!RECEIPT_SIGNING_KEY) {
    return NextResponse.json(
      { error: "Server configuration error. Contact support." },
      { status: 503 }
    );
  }
  try {
    const body = await request.json();
    const { credential, to, amount, memo, webhookUrl } = body;
    // memo: optional bytes32-compatible string or hex for agent-to-agent receipt matching
    // webhookUrl: optional URL to POST a signed receipt to after successful payment

    // Validate required fields
    if (!credential) {
      return NextResponse.json(
        { error: "Missing credential. Include your PaySpawn credential in the request body." },
        { status: 401 }
      );
    }

    if (!to || amount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: to, amount" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Decode credential
    const decoded = decodeCredential(credential);
    if (!decoded) {
      return NextResponse.json(
        { error: "Invalid credential format" },
        { status: 401 }
      );
    }

    const { signature, permission } = decoded;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > permission.end) {
      return NextResponse.json(
        { error: "Credential expired. Please create a new one in the dashboard." },
        { status: 401 }
      );
    }

    if (now < permission.start) {
      return NextResponse.json(
        { error: "Credential not yet valid." },
        { status: 401 }
      );
    }

    // Resolve recipient
    const recipient = await resolveRecipient(to);
    if (!recipient) {
      return NextResponse.json(
        { error: `Could not resolve recipient: ${to}` },
        { status: 400 }
      );
    }

    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Relayer not configured" },
        { status: 500 }
      );
    }

    const amountWei = parseUnits(amount.toString(), 6);

    // Determine credential version and payment path
    const isV5 = isV5Credential(permission);
    const isEOACredential = signature === "EOA" || signature === "0x";
    const spenderAddress = permission.spender as `0x${string}`;

    // Fee (V5 fees are zero, but still check the contract)
    const feeContractAddr = isV5 && CONTRACTS.PAYSPAWN_SPENDER_V5
      ? CONTRACTS.PAYSPAWN_SPENDER_V5
      : (isEOACredential ? CONTRACTS.PAYSPAWN_SPENDER_V4 : spenderAddress);

    const fee = await publicClient.readContract({
      address: feeContractAddr,
      abi: isV5 ? PAYSPAWN_V5_ABI : PAYSPAWN_SPENDER_ABI,
      functionName: "calculateFee",
      args: [amountWei],
    });

    const total = amountWei + fee;

    // Check balance
    const balance = await publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [permission.account as `0x${string}`],
    });

    if (balance < total) {
      return NextResponse.json(
        {
          error: "Insufficient USDC balance",
          have: formatUnits(balance, 6),
          need: formatUnits(total, 6),
        },
        { status: 400 }
      );
    }

    // ── Normalize memo to bytes32 hex ───────────────────────────────────────
    let memoBytes32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    if (memo) {
      if (typeof memo === "string" && memo.startsWith("0x") && memo.length === 66) {
        memoBytes32 = memo as `0x${string}`;
      } else {
        // Encode string as left-padded bytes32
        const buf = Buffer.from(String(memo).slice(0, 32), "utf-8");
        memoBytes32 = `0x${buf.toString("hex").padEnd(64, "0")}` as `0x${string}`;
      }
    }

    let txHash: `0x${string}`;

    if (isV5 && CONTRACTS.PAYSPAWN_SPENDER_V5) {
      // ── V5 EOA path ────────────────────────────────────────────────────────
      const permV5 = formatPermissionV5ForContract(permission);
      txHash = await writeContractWithRetry({
        address: CONTRACTS.PAYSPAWN_SPENDER_V5,
        abi: PAYSPAWN_V5_ABI,
        functionName: "payEOAV5",
        args: [permV5, recipient.address as `0x${string}`, amountWei, memoBytes32],
      });
    } else if (isEOACredential) {
      // ── V4 EOA path ────────────────────────────────────────────────────────
      txHash = await writeContractWithRetry({
        address: CONTRACTS.PAYSPAWN_SPENDER_V4,
        abi: PAYSPAWN_SPENDER_ABI,
        functionName: "payEOA",
        args: [
          permission.account as `0x${string}`,
          recipient.address as `0x${string}`,
          amountWei,
        ],
      });
    } else {
      // ── Smart Wallet path (V4 SPM) ─────────────────────────────────────────
      const permissionForContract = formatPermissionForContract(permission);

      const isApproved = await publicClient.readContract({
        address: CONTRACTS.SPEND_PERMISSION_MANAGER,
        abi: SPEND_PERMISSION_MANAGER_ABI,
        functionName: "isApproved",
        args: [permissionForContract],
      });

      if (isApproved) {
        txHash = await writeContractWithRetry({
          address: spenderAddress,
          abi: PAYSPAWN_SPENDER_ABI,
          functionName: "payWithApprovedPermission",
          args: [permissionForContract, recipient.address as `0x${string}`, amountWei],
        });
      } else {
        txHash = await writeContractWithRetry({
          address: spenderAddress,
          abi: PAYSPAWN_SPENDER_ABI,
          functionName: "pay",
          args: [
            permissionForContract,
            signature as `0x${string}`,
            recipient.address as `0x${string}`,
            amountWei,
          ],
        });
      }
    }

    // Wait for confirmation — 8s timeout keeps us inside Vercel's function limit.
    // Base blocks are ~2s so this handles normal load. If it times out we still
    // return success with the txHash (tx is submitted and will confirm).
    let blockNumber: string | null = null;
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 8_000,
      });
      blockNumber = receipt.blockNumber.toString();
    } catch {
      // Timeout — tx submitted, just not confirmed yet. Return txHash anyway.
    }

    // Build signed receipt for agent-to-agent verification
    const signedReceipt = buildSignedReceipt({
      txHash,
      from:    permission.account,
      to:      recipient.address,
      amount,
      memo:    memoBytes32,
      version: isV5 ? "v5" : "v4",
    });

    // Fire webhook (fire-and-forget — doesn't block or fail the payment)
    if (webhookUrl && typeof webhookUrl === "string" && isValidWebhookUrl(webhookUrl)) {
      fireWebhook(webhookUrl, { event: "payment.success", receipt: signedReceipt });
    }

    return NextResponse.json({
      success: true,
      txHash,
      from: permission.account,
      to: recipient.address,
      toName: recipient.name || null,
      amount: amount,
      fee: Number(formatUnits(fee, 6)),
      total: Number(formatUnits(total, 6)),
      blockNumber,
      explorer: `https://basescan.org/tx/${txHash}`,
      memo: memoBytes32,
      credentialVersion: isV5 ? "v5" : "v4",
      receipt: signedReceipt,
    });

  } catch (error: any) {
    console.error("Payment error:", error);
    return NextResponse.json(
      { error: error.message || "Payment failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/pay",
    description: "Make a payment using your PaySpawn credential",
    body: {
      credential: "Your base64-encoded PaySpawn credential",
      to: "Recipient address, ENS name, or PaySpawn name (alice.pay)",
      amount: "Amount in USD (e.g., 5.00)",
    },
    example: {
      credential: "eyJzaWduYXR1cmUiOiIweC4uLiIsInBlcm1pc3Npb24iOnsifX0=",
      to: "alice.pay",
      amount: 5.00,
    },
  });
}
