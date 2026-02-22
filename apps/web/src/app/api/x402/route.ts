import { NextRequest, NextResponse } from "next/server";
import { parseUnits, formatUnits, keccak256, encodePacked } from "viem";
import { publicClient, buildWalletClient } from "@/lib/rpc";

import {
  parsePaymentRequired,
  findCompatibleRequirement,
  buildPaymentProof,
  extractPriceUSD,
  X402_HEADERS,
} from "@/lib/x402";

// ============ Contract Addresses (Base Mainnet) ============

const CONTRACTS = {
  PAYSPAWN_SPENDER_V4: "0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" as `0x${string}`,
  SPEND_PERMISSION_MANAGER: "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
};

// ============ Types ============

interface SpendPermission {
  account: string;
  spender: string;
  token: string;
  allowance: string;
  period: number;
  start: number;
  end: number;
  salt: string;
  extraData: string;
}

// ============ ABIs ============

const PAYSPAWN_SPENDER_ABI = [
  // Smart Wallet: off-chain signature path
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
  // Smart Wallet: already-approved permission path
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
  // EOA: direct USDC.transferFrom path
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
  {
    name: "getCurrentPeriod",
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
    outputs: [
      { name: "start", type: "uint48" },
      { name: "end", type: "uint48" },
      { name: "spend", type: "uint160" },
    ],
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
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ============ Helpers ============

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

function decodeCredential(credentialString: string): {
  signature: string;
  permission: SpendPermission;
} | null {
  try {
    const decoded = Buffer.from(credentialString, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function formatPermissionForContract(permission: SpendPermission) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkSpendingLimits(
  publicClient: any,
  permission: SpendPermission,
  isEOA: boolean,
  amountUSD: number
): Promise<{ allowed: boolean; reason?: string; remaining?: string; fee?: number; total?: number }> {
  const amountWei = parseUnits(amountUSD.toString(), 6);

  try {
    // Get fee from V4
    const fee = await publicClient.readContract({
      address: CONTRACTS.PAYSPAWN_SPENDER_V4,
      abi: PAYSPAWN_SPENDER_ABI,
      functionName: "calculateFee",
      args: [amountWei],
    });
    const total = amountWei + fee;

    // Check USDC balance
    const balance = await publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [permission.account as `0x${string}`],
    });

    if (balance < total) {
      return {
        allowed: false,
        reason: `Insufficient USDC balance. Have: $${formatUnits(balance, 6)}, Need: $${formatUnits(total, 6)}`,
        fee: Number(formatUnits(fee, 6)),
        total: Number(formatUnits(total, 6)),
      };
    }

    if (isEOA) {
      // EOA: check USDC allowance to V4 (the daily limit is the allowance set at credential creation)
      const usdcAllowance = await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [permission.account as `0x${string}`, CONTRACTS.PAYSPAWN_SPENDER_V4],
      });

      if (usdcAllowance < total) {
        return {
          allowed: false,
          reason: `Insufficient USDC allowance. Allowed: $${formatUnits(usdcAllowance, 6)}, Need: $${formatUnits(total, 6)}. User must re-approve in dashboard.`,
          remaining: formatUnits(usdcAllowance, 6),
          fee: Number(formatUnits(fee, 6)),
          total: Number(formatUnits(total, 6)),
        };
      }

      return {
        allowed: true,
        remaining: formatUnits(usdcAllowance, 6),
        fee: Number(formatUnits(fee, 6)),
        total: Number(formatUnits(total, 6)),
      };
    } else {
      // Smart Wallet: check SPM period spending
      const permissionForContract = formatPermissionForContract(permission);
      const spenderAddress = permission.spender as `0x${string}`;

      try {
        const periodInfo = await publicClient.readContract({
          address: CONTRACTS.SPEND_PERMISSION_MANAGER,
          abi: SPEND_PERMISSION_MANAGER_ABI,
          functionName: "getCurrentPeriod",
          args: [permissionForContract],
        });

        const [, , spent] = periodInfo;
        const allowance = BigInt(permission.allowance);
        const remaining = allowance - spent;

        if (total > remaining) {
          return {
            allowed: false,
            reason: `Daily limit exceeded. Remaining: $${formatUnits(remaining, 6)}, Need: $${formatUnits(total, 6)}`,
            remaining: formatUnits(remaining, 6),
            fee: Number(formatUnits(fee, 6)),
            total: Number(formatUnits(total, 6)),
          };
        }

        return {
          allowed: true,
          remaining: formatUnits(remaining, 6),
          fee: Number(formatUnits(fee, 6)),
          total: Number(formatUnits(total, 6)),
        };
      } catch {
        // Not yet approved — will be approved on first spend
        return {
          allowed: true,
          remaining: formatUnits(BigInt(permission.allowance), 6),
          fee: Number(formatUnits(fee, 6)),
          total: Number(formatUnits(total, 6)),
        };
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { allowed: false, reason: `Failed to check limits: ${msg}` };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executePayment(
  publicClient: any,
  walletClient: any,
  permission: SpendPermission,
  signature: string,
  isEOA: boolean,
  to: string,
  amountUSD: number
): Promise<{ success: boolean; txHash?: string; fee?: number; total?: number; error?: string }> {
  const amountWei = parseUnits(amountUSD.toString(), 6);

  try {
    const fee = await publicClient.readContract({
      address: CONTRACTS.PAYSPAWN_SPENDER_V4,
      abi: PAYSPAWN_SPENDER_ABI,
      functionName: "calculateFee",
      args: [amountWei],
    });
    const total = amountWei + fee;

    let txHash: `0x${string}`;

    if (isEOA) {
      // EOA path: direct USDC.transferFrom via payEOA()
      txHash = await walletClient.writeContract({
        address: CONTRACTS.PAYSPAWN_SPENDER_V4,
        abi: PAYSPAWN_SPENDER_ABI,
        functionName: "payEOA",
        args: [
          permission.account as `0x${string}`,
          to as `0x${string}`,
          amountWei,
        ],
      });
    } else {
      // Smart Wallet path: SpendPermissionManager
      const permissionForContract = formatPermissionForContract(permission);
      const spenderAddress = permission.spender as `0x${string}`;

      const isApproved = await publicClient.readContract({
        address: CONTRACTS.SPEND_PERMISSION_MANAGER,
        abi: SPEND_PERMISSION_MANAGER_ABI,
        functionName: "isApproved",
        args: [permissionForContract],
      });

      if (isApproved) {
        txHash = await walletClient.writeContract({
          address: spenderAddress,
          abi: PAYSPAWN_SPENDER_ABI,
          functionName: "payWithApprovedPermission",
          args: [permissionForContract, to as `0x${string}`, amountWei],
        });
      } else {
        txHash = await walletClient.writeContract({
          address: spenderAddress,
          abi: PAYSPAWN_SPENDER_ABI,
          functionName: "pay",
          args: [
            permissionForContract,
            signature as `0x${string}`,
            to as `0x${string}`,
            amountWei,
          ],
        });
      }
    }

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      success: true,
      txHash,
      fee: Number(formatUnits(fee, 6)),
      total: Number(formatUnits(total, 6)),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

// ============ API Handler ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credential, url, method = "GET", body: requestBody, headers: customHeaders } = body;

    if (!credential) {
      return NextResponse.json(
        { error: "Missing credential. Include your PaySpawn credential in the request body." },
        { status: 401 }
      );
    }

    if (!url) {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400 }
      );
    }

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

    // Detect EOA vs Smart Wallet from credential
    const isEOA = signature === "EOA" || signature === "0x";

    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Relayer not configured" },
        { status: 500 }
      );
    }

    const walletClient = buildWalletClient();

    // Make initial request to the x402 resource
    const initialHeaders: Record<string, string> = {
      "Accept": "application/json",
      ...customHeaders,
    };

    const initialResponse = await fetch(url, {
      method,
      headers: initialHeaders,
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    // If not 402, return the response as-is
    if (initialResponse.status !== 402) {
      const responseBody = await initialResponse.text();
      let parsedBody;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      return NextResponse.json({
        success: true,
        status: initialResponse.status,
        paid: false,
        data: parsedBody,
      });
    }

    // Handle 402 Payment Required
    const paymentHeader =
      initialResponse.headers.get(X402_HEADERS.PAYMENT_REQUIRED) ||
      initialResponse.headers.get(X402_HEADERS.PAYMENT_REQUIRED_ALT) ||
      initialResponse.headers.get("x-payment") ||
      initialResponse.headers.get("payment");

    if (!paymentHeader) {
      return NextResponse.json({
        success: false,
        error: "Received 402 but no payment requirements in response headers",
        status: 402,
      }, { status: 402 });
    }

    const x402Response = parsePaymentRequired(paymentHeader);
    if (!x402Response) {
      return NextResponse.json({
        success: false,
        error: "Failed to parse x402 payment requirements",
        status: 402,
      }, { status: 402 });
    }

    const requirement = findCompatibleRequirement(x402Response.paymentRequirements);
    if (!requirement) {
      return NextResponse.json({
        success: false,
        error: "No compatible payment method found. PaySpawn supports exact scheme on Base with USDC.",
        availableRequirements: x402Response.paymentRequirements,
        status: 402,
      }, { status: 402 });
    }

    const priceUSD = extractPriceUSD(requirement);
    const recipientAddress = requirement.payTo;

    // Check limits
    const limitCheck = await checkSpendingLimits(publicClient, permission, isEOA, priceUSD);
    if (!limitCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: limitCheck.reason,
        x402: {
          price: priceUSD,
          recipient: recipientAddress,
          description: requirement.description,
        },
        remaining: limitCheck.remaining,
        status: 402,
      }, { status: 402 });
    }

    // Execute payment
    const payment = await executePayment(
      publicClient,
      walletClient,
      permission,
      signature,
      isEOA,
      recipientAddress,
      priceUSD
    );

    if (!payment.success) {
      return NextResponse.json({
        success: false,
        error: payment.error,
        x402: { price: priceUSD, recipient: recipientAddress },
      }, { status: 400 });
    }

    // Build payment proof and retry request
    const paymentProof = buildPaymentProof({
      txHash: payment.txHash!,
      from: permission.account,
      to: recipientAddress,
      amount: parseUnits(priceUSD.toString(), 6).toString(),
      network: "base",
    });

    const retryHeaders: Record<string, string> = {
      ...initialHeaders,
      [X402_HEADERS.PAYMENT]: paymentProof,
      [X402_HEADERS.PAYMENT_ALT]: paymentProof,
      "X-Payment-TxHash": payment.txHash!,
    };

    const retryResponse = await fetch(url, {
      method,
      headers: retryHeaders,
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    const retryBody = await retryResponse.text();
    let parsedRetryBody;
    try {
      parsedRetryBody = JSON.parse(retryBody);
    } catch {
      parsedRetryBody = retryBody;
    }

    return NextResponse.json({
      success: retryResponse.ok,
      status: retryResponse.status,
      paid: true,
      payment: {
        recipientReceives: priceUSD,
        fee: payment.fee,
        totalCharged: payment.total,
        recipient: recipientAddress,
        txHash: payment.txHash,
        explorer: `https://basescan.org/tx/${payment.txHash}`,
      },
      remaining: limitCheck.remaining,
      data: parsedRetryBody,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("x402 proxy error:", error);
    return NextResponse.json(
      { error: msg || "x402 request failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/x402",
    description: "Proxy requests to x402-enabled APIs with automatic payment. Supports EOA wallets and Smart Wallets.",
    walletTypes: {
      EOA: "Direct USDC.transferFrom — no SpendPermissionManager. User approves USDC spending once in dashboard.",
      SmartWallet: "Coinbase SpendPermissionManager with off-chain EIP-712 signature. Gas-free for user.",
    },
    body: {
      credential: "Your base64-encoded PaySpawn credential",
      url: "The x402-enabled API URL to call",
      method: "HTTP method (default: GET)",
      body: "Request body (optional, for POST/PUT)",
      headers: "Additional headers to include (optional)",
    },
    example: {
      credential: "eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7Li4ufX0=",
      url: "https://api.example.com/premium-data",
      method: "GET",
    },
    supportedSchemes: ["exact"],
    supportedNetworks: ["base"],
    supportedTokens: ["USDC"],
  });
}
