import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, parseUnits, formatUnits, isAddress, http } from "viem";

import { publicClient, writeContractWithRetry } from "@/lib/rpc";

// Contract addresses
const CONTRACTS = {
  PAYSPAWN_SPENDER_V4: "0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" as `0x${string}`, // V4 - dual path (smart wallet + EOA direct)
  PAYSPAWN_SPENDER_V3: "0x0B31146b3d8F17af874dfF03E783336b20577E04" as `0x${string}`, // V3 - legacy
  SPEND_PERMISSION_MANAGER: "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
};

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

// ABIs for PaySpawnSpenderV2
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
  permission: {
    account: string;
    spender: string;
    token: string;
    allowance: string;
    period: number;
    start: number;
    end: number;
    salt: string;
    extraData: string;
  };
} | null {
  try {
    const decoded = Buffer.from(credentialString, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function formatPermissionForContract(permission: any) {
  return {
    account: permission.account as `0x${string}`,
    spender: permission.spender as `0x${string}`,
    token: permission.token as `0x${string}`,
    allowance: BigInt(permission.allowance),
    period: Number(permission.period),
    start: Number(permission.start),
    end: Number(permission.end),
    salt: BigInt(permission.salt),
    extraData: (permission.extraData || "0x") as `0x${string}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credential, to, amount } = body;

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
    
    // Use the spender from the credential — do NOT override it
    // The credential already has the correct spender address embedded
    const permissionForContract = formatPermissionForContract(permission);
    
    // Resolve which spender contract to call based on the spender address in the credential
    const spenderAddress = permission.spender as `0x${string}`;

    // Determine which contract handles this payment
    const isEOACredential = signature === "EOA" || signature === "0x";
    const paymentContract = isEOACredential ? CONTRACTS.PAYSPAWN_SPENDER_V4 : spenderAddress;

    // Calculate fee
    const fee = await publicClient.readContract({
      address: paymentContract,
      abi: PAYSPAWN_SPENDER_ABI,
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

    // Check if permission is already approved on-chain
    const isApproved = await publicClient.readContract({
      address: CONTRACTS.SPEND_PERMISSION_MANAGER,
      abi: SPEND_PERMISSION_MANAGER_ABI,
      functionName: "isApproved",
      args: [permissionForContract],
    });

    let txHash: `0x${string}`;

    if (isEOACredential) {
      // EOA path: use V4's payEOA() — direct USDC.transferFrom, no SpendPermissionManager
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
    } else if (isApproved) {
      // Smart Wallet: permission already approved on-chain
      txHash = await writeContractWithRetry({
        address: spenderAddress,
        abi: PAYSPAWN_SPENDER_ABI,
        functionName: "payWithApprovedPermission",
        args: [permissionForContract, recipient.address as `0x${string}`, amountWei],
      });
    } else {
      // Smart Wallet: first-time, approve via off-chain signature
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
