import { NextRequest, NextResponse } from "next/server";
import { parseUnits, formatUnits, keccak256, encodePacked } from "viem";
import { publicClient, buildWalletClient } from "@/lib/rpc";


/**
 * x402 Facilitator - Settle Endpoint
 * 
 * Executes the on-chain payment after verification. Part of the x402 facilitator protocol.
 * 
 * PaySpawn settlement uses the PaySpawnRouter contract to transfer USDC
 * from the payer's wallet to the recipient, within the payer's approved limits.
 */

const ROUTER_CONTRACT = "0x0977EA4af7E4e3282cf03Bb0cCae02624ABb6fdC";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

const ROUTER_ABI = [
  {
    name: "payFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
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

interface SettleRequest {
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
    resource?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: SettleRequest = await request.json();
    const { paymentPayload, paymentRequirements } = body;

    // Validate scheme
    if (paymentPayload.scheme !== "payspawn" && paymentPayload.scheme !== "exact") {
      return NextResponse.json({
        success: false,
        error: "Unsupported scheme. PaySpawn facilitator supports 'payspawn' and 'exact' schemes.",
      }, { status: 400 });
    }

    // Validate network
    if (paymentRequirements.network !== "base" && paymentRequirements.network !== "base-mainnet" && paymentRequirements.network !== "8453") {
      return NextResponse.json({
        success: false,
        error: "Unsupported network. PaySpawn facilitator only supports Base.",
      }, { status: 400 });
    }

    const { from, apiKey } = paymentPayload.payload;
    const to = paymentRequirements.payTo;
    const amount = BigInt(paymentRequirements.maxAmountRequired);

    // Validate API key matches wallet
    const { validateApiKey } = await import("../../keys/route");
    if (!validateApiKey(apiKey, from)) {
      return NextResponse.json({
        success: false,
        error: "Invalid API key for this wallet address.",
      }, { status: 401 });
    }

    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json({
        success: false,
        error: "Relayer not configured.",
      }, { status: 500 });
    }

    // Final balance check
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [from as `0x${string}`],
    });

    if (balance < amount) {
      return NextResponse.json({
        success: false,
        error: `Insufficient balance. Have: $${formatUnits(balance, 6)}, Need: $${formatUnits(amount, 6)}`,
      }, { status: 400 });
    }

    // Final allowance check
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "allowance",
      args: [from as `0x${string}`, ROUTER_CONTRACT],
    });

    if (allowance < amount) {
      return NextResponse.json({
        success: false,
        error: "Insufficient router allowance.",
      }, { status: 400 });
    }

    // Execute payment via router
    const walletClient = buildWalletClient();

    const txHash = await walletClient.writeContract({
      address: ROUTER_CONTRACT,
      abi: ROUTER_ABI,
      functionName: "payFrom",
      args: [from as `0x${string}`, USDC_ADDRESS, to as `0x${string}`, amount],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Calculate fee
    const amountUSD = Number(formatUnits(amount, 6));
    const percentageFee = amountUSD * 0.001;
    const fee = Math.max(percentageFee, 0.05);

    // Return x402 settlement response
    return NextResponse.json({
      success: true,
      network: "base",
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      payer: from,
      recipient: to,
      amount: formatUnits(amount, 6),
      fee: fee.toFixed(4),
      asset: "USDC",
      explorer: `https://basescan.org/tx/${txHash}`,
      // x402 standard fields
      settlementId: txHash,
      settledAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("x402 settle error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Settlement failed",
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/x402/settle",
    description: "x402 Facilitator - Execute payment settlement",
    facilitator: "PaySpawn",
    supportedSchemes: ["payspawn", "exact"],
    supportedNetworks: ["base"],
    supportedAssets: ["USDC"],
    fees: {
      percentage: "0%",
      minimum: "$0.00",
    },
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
