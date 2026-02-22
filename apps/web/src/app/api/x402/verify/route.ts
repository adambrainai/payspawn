import { NextRequest, NextResponse } from "next/server";
import { parseUnits, formatUnits } from "viem";
import { publicClient, buildWalletClient } from "@/lib/rpc";

/**
 * x402 Facilitator - Verify Endpoint
 * 
 * Verifies that a payment authorization is valid before the resource server
 * fulfills the request. Part of the x402 facilitator protocol.
 * 
 * PaySpawn uses a custom "payspawn" scheme where:
 * - Instead of EIP-712 signatures, we use PaySpawn API key authentication
 * - The payer must have approved the PaySpawn router contract
 * - Spending limits are enforced on-chain via PaySpawnPolicy
 */

const POLICY_CONTRACT = "0xbD55962D570f4E9843F7300002781aB68F51a09B";
const ROUTER_CONTRACT = "0x0977EA4af7E4e3282cf03Bb0cCae02624ABb6fdC";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const POLICY_ABI = [
  {
    name: "policies",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "human", type: "address" },
      { name: "agent", type: "address" },
      { name: "dailyLimit", type: "uint256" },
      { name: "perTxLimit", type: "uint256" },
      { name: "dailySpent", type: "uint256" },
      { name: "lastResetDay", type: "uint256" },
      { name: "paused", type: "bool" },
    ],
  },
] as const;

const USDC_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface VerifyRequest {
  paymentPayload: {
    scheme: string;
    network: string;
    payload: {
      from: string;
      apiKey: string;
    };
  };
  paymentRequirements: {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();
    const { paymentPayload, paymentRequirements } = body;

    // Validate scheme
    if (paymentPayload.scheme !== "payspawn" && paymentPayload.scheme !== "exact") {
      return NextResponse.json({
        valid: false,
        error: "Unsupported scheme. PaySpawn facilitator supports 'payspawn' and 'exact' schemes.",
      }, { status: 400 });
    }

    // Validate network
    if (paymentRequirements.network !== "base" && paymentRequirements.network !== "base-mainnet" && paymentRequirements.network !== "8453") {
      return NextResponse.json({
        valid: false,
        error: "Unsupported network. PaySpawn facilitator only supports Base.",
      }, { status: 400 });
    }

    const { from, apiKey } = paymentPayload.payload;
    const amount = BigInt(paymentRequirements.maxAmountRequired);

    // Validate API key matches wallet
    const { validateApiKey } = await import("../../keys/route");
    if (!validateApiKey(apiKey, from)) {
      return NextResponse.json({
        valid: false,
        error: "Invalid API key for this wallet address.",
      }, { status: 401 });
    }

    // Check balance
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [from as `0x${string}`],
    });

    if (balance < amount) {
      return NextResponse.json({
        valid: false,
        error: `Insufficient balance. Have: $${formatUnits(balance, 6)}, Need: $${formatUnits(amount, 6)}`,
      }, { status: 400 });
    }

    // Check allowance
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [from as `0x${string}`, ROUTER_CONTRACT],
    });

    if (allowance < amount) {
      return NextResponse.json({
        valid: false,
        error: "Insufficient router allowance. User must approve PaySpawn router first.",
      }, { status: 400 });
    }

    // Check policy limits
    const policy = await publicClient.readContract({
      address: POLICY_CONTRACT,
      abi: POLICY_ABI,
      functionName: "policies",
      args: [from as `0x${string}`],
    });

    const [human, , _dailyLimit, _perTxLimit, _dailySpent, _lastResetDay, paused] = policy;
    const dailyLimit = BigInt(_dailyLimit);
    const perTxLimit = BigInt(_perTxLimit);
    const dailySpent = BigInt(_dailySpent);
    const lastResetDay = BigInt(_lastResetDay);

    if (human === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({
        valid: false,
        error: "No spending policy configured for this wallet.",
      }, { status: 400 });
    }

    if (paused) {
      return NextResponse.json({
        valid: false,
        error: "Agent spending is paused.",
      }, { status: 400 });
    }

    if (amount > perTxLimit) {
      return NextResponse.json({
        valid: false,
        error: `Amount exceeds per-transaction limit of $${formatUnits(perTxLimit, 6)}`,
      }, { status: 400 });
    }

    const todayDay = BigInt(Math.floor(Date.now() / 1000 / 86400));
    const effectiveSpent = todayDay > lastResetDay ? BigInt(0) : dailySpent;
    const remaining = dailyLimit - effectiveSpent;

    if (amount > remaining) {
      return NextResponse.json({
        valid: false,
        error: `Amount exceeds remaining daily limit of $${formatUnits(remaining, 6)}`,
      }, { status: 400 });
    }

    // All checks passed
    return NextResponse.json({
      valid: true,
      payer: from,
      recipient: paymentRequirements.payTo,
      amount: formatUnits(amount, 6),
      network: "base",
      scheme: paymentPayload.scheme,
    });

  } catch (error: any) {
    console.error("x402 verify error:", error);
    return NextResponse.json({
      valid: false,
      error: error.message || "Verification failed",
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/x402/verify",
    description: "x402 Facilitator - Verify payment authorization",
    facilitator: "PaySpawn",
    supportedSchemes: ["payspawn", "exact"],
    supportedNetworks: ["base"],
    supportedAssets: ["USDC"],
    body: {
      paymentPayload: {
        scheme: "payspawn",
        network: "base",
        payload: {
          from: "0xPayerWallet",
          apiKey: "ps_...",
        },
      },
      paymentRequirements: {
        scheme: "payspawn",
        network: "base",
        maxAmountRequired: "1000000",
        payTo: "0xRecipient",
      },
    },
  });
}
