import { NextRequest, NextResponse } from "next/server";
import { writeContractWithRetry } from "@/lib/rpc";

const PAYSPAWN_SPENDER_V5 = (process.env.PAYSPAWN_SPENDER_V5 || "").trim() as `0x${string}`;

const PAUSE_ABI = [
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
] as const;

function decodeCredential(credentialString: string): {
  signature: string;
  permission: Record<string, any>;
} | null {
  try {
    const decoded = Buffer.from(credentialString, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isV5Permission(permission: Record<string, any>): boolean {
  return (
    permission.maxPerTx !== undefined ||
    permission.allowedTo !== undefined ||
    permission.maxTxPerHour !== undefined ||
    permission.parentHash !== undefined
  );
}

/**
 * POST /api/pay/pause
 * Body: { credential: string, action: "pause" | "unpause" }
 *
 * Pauses or unpauses a V5 credential on-chain.
 * Only works for V5 credentials — V4 credentials have no pause mechanism.
 * Only callable by the relayer (server-side, no user auth needed since
 * the credential must be the one being paused).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credential, action } = body;

    if (!credential) {
      return NextResponse.json({ error: "Missing credential" }, { status: 400 });
    }
    if (action !== "pause" && action !== "unpause") {
      return NextResponse.json(
        { error: "action must be 'pause' or 'unpause'" },
        { status: 400 }
      );
    }
    if (!PAYSPAWN_SPENDER_V5) {
      return NextResponse.json(
        { error: "V5 contract not configured (PAYSPAWN_SPENDER_V5 env var missing)" },
        { status: 503 }
      );
    }

    const decoded = decodeCredential(credential);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid credential format" }, { status: 401 });
    }

    const { permission } = decoded;
    if (!isV5Permission(permission)) {
      return NextResponse.json(
        { error: "Pause/unpause requires a V5 credential. V4 credentials cannot be paused." },
        { status: 400 }
      );
    }

    // Format permission for ABI encoding
    const permV5 = {
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

    // Compute credential hash by calling the contract's pure function
    const { publicClient } = await import("@/lib/rpc");
    const credentialHash = await publicClient.readContract({
      address: PAYSPAWN_SPENDER_V5,
      abi: PAUSE_ABI,
      functionName: "computeCredentialHash",
      args: [permV5],
    });

    // Execute pause or unpause
    const txHash = await writeContractWithRetry({
      address: PAYSPAWN_SPENDER_V5,
      abi: PAUSE_ABI,
      functionName: action === "pause" ? "pauseCredential" : "unpauseCredential",
      args: [credentialHash],
    });

    return NextResponse.json({
      success: true,
      action,
      credentialHash,
      txHash,
      explorer: `https://basescan.org/tx/${txHash}`,
    });
  } catch (error: any) {
    console.error("Pause/unpause error:", error);
    return NextResponse.json(
      { error: error.message || "Operation failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/pay/pause",
    description: "Pause or unpause a V5 credential on-chain",
    body: {
      credential: "Your base64-encoded V5 PaySpawn credential",
      action: "'pause' or 'unpause'",
    },
  });
}
