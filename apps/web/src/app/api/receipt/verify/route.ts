import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { publicClient } from "@/lib/rpc";

const RECEIPT_SIGNING_KEY = process.env.RECEIPT_SIGNING_KEY as string | undefined;

export interface PaySpawnReceipt {
  txHash:    string;
  from:      string;
  to:        string;
  amount:    number;
  memo:      string;
  timestamp: number;
  version:   string;
  signature: string;
}

/**
 * Recompute the HMAC-SHA256 signature for a receipt (matches buildSignedReceipt in /api/pay).
 * Excludes the `signature` field itself when computing.
 */
function computeSignature(receipt: Omit<PaySpawnReceipt, "signature">): string {
  const payload = JSON.stringify({
    txHash:    receipt.txHash,
    from:      receipt.from,
    to:        receipt.to,
    amount:    receipt.amount,
    memo:      receipt.memo,
    timestamp: receipt.timestamp,
    version:   receipt.version,
  });
  return createHmac("sha256", RECEIPT_SIGNING_KEY!).update(payload).digest("hex");
}

/**
 * GET /api/receipt/verify?receipt=<base64-encoded-receipt-json>
 *
 * Verifies a PaySpawn payment receipt signature.
 * Agents can use this to confirm they were actually paid before executing a task.
 *
 * @example
 * GET /api/receipt/verify?receipt=eyJ0eEhhc2giOiIweCIsImZyb20iOiIweCIs...
 *
 * Response:
 *   { valid: true,  receipt: { ... } }  — signature matches, payment is real
 *   { valid: false, receipt: { ... }, reason: "..." }  — tampered or invalid
 */
export async function GET(request: NextRequest) {
  if (!RECEIPT_SIGNING_KEY) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  try {
    const { searchParams } = new URL(request.url);
    const receiptParam = searchParams.get("receipt");

    if (!receiptParam) {
      return NextResponse.json(
        { error: "Missing 'receipt' query parameter. Pass base64-encoded receipt JSON." },
        { status: 400 }
      );
    }

    let receipt: PaySpawnReceipt;
    try {
      const decoded = Buffer.from(receiptParam, "base64").toString("utf-8");
      receipt = JSON.parse(decoded);
    } catch {
      return NextResponse.json(
        { error: "Invalid receipt format. Expected base64-encoded JSON." },
        { status: 400 }
      );
    }

    // Validate required fields
    const requiredFields = ["txHash", "from", "to", "amount", "memo", "timestamp", "version", "signature"];
    for (const field of requiredFields) {
      if (receipt[field as keyof PaySpawnReceipt] === undefined) {
        return NextResponse.json(
          { valid: false, receipt, reason: `Missing required field: ${field}` },
          { status: 200 }
        );
      }
    }

    // Check age — receipts older than 24 hours are rejected to prevent replay
    const ageSeconds = Math.floor(Date.now() / 1000) - receipt.timestamp;
    if (ageSeconds > 86400) {
      return NextResponse.json(
        { valid: false, receipt, reason: "Receipt expired (older than 24 hours)" },
        { status: 200 }
      );
    }

    if (ageSeconds < -300) {
      return NextResponse.json(
        { valid: false, receipt, reason: "Receipt timestamp is in the future" },
        { status: 200 }
      );
    }

    // Recompute signature
    const { signature: providedSig, ...receiptBody } = receipt;
    const expectedSig = computeSignature(receiptBody);

    const valid = providedSig === expectedSig;

    // L-2: Optional on-chain verification — confirm tx exists and block timestamp matches
    let onChainVerified: boolean | null = null;
    if (valid && receipt.txHash && receipt.txHash.startsWith("0x")) {
      try {
        const tx = await publicClient.getTransactionReceipt({
          hash: receipt.txHash as `0x${string}`,
        });
        if (tx) {
          const block = await publicClient.getBlock({ blockNumber: tx.blockNumber });
          const blockTs = Number(block.timestamp);
          // Allow 60s drift between block time and receipt timestamp
          onChainVerified = Math.abs(blockTs - receipt.timestamp) < 60;
        } else {
          onChainVerified = false;
        }
      } catch {
        onChainVerified = null; // RPC error — don't fail the check
      }
    }

    return NextResponse.json({
      valid,
      onChainVerified,
      receipt,
      ...(valid ? {} : { reason: "Signature mismatch — receipt may have been tampered with" }),
      ...(!valid ? {} : onChainVerified === false ? { warning: "TX not found on-chain — treat with caution" } : {}),
    });
  } catch (error: any) {
    console.error("Receipt verify error:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/receipt/verify
 * Body: { receipt: PaySpawnReceipt } (JSON object, not base64)
 *
 * Alternative to GET — accepts the receipt as a JSON body instead of base64 query param.
 * Preferred for agent-to-agent use (no URL encoding issues with large receipts).
 */
export async function POST(request: NextRequest) {
  if (!RECEIPT_SIGNING_KEY) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  try {
    const body = await request.json();
    const { receipt } = body;

    if (!receipt || typeof receipt !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'receipt' in request body" },
        { status: 400 }
      );
    }

    const requiredFields = ["txHash", "from", "to", "amount", "memo", "timestamp", "version", "signature"];
    for (const field of requiredFields) {
      if (receipt[field] === undefined) {
        return NextResponse.json(
          { valid: false, receipt, reason: `Missing required field: ${field}` },
          { status: 200 }
        );
      }
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - receipt.timestamp;
    if (ageSeconds > 86400) {
      return NextResponse.json(
        { valid: false, receipt, reason: "Receipt expired (older than 24 hours)" },
        { status: 200 }
      );
    }

    const { signature: providedSig, ...receiptBody } = receipt;
    const expectedSig = computeSignature(receiptBody);

    const valid = providedSig === expectedSig;

    // L-2: Optional on-chain verification — confirm tx exists and block timestamp matches
    let onChainVerified: boolean | null = null;
    if (valid && receipt.txHash && receipt.txHash.startsWith("0x")) {
      try {
        const tx = await publicClient.getTransactionReceipt({
          hash: receipt.txHash as `0x${string}`,
        });
        if (tx) {
          const block = await publicClient.getBlock({ blockNumber: tx.blockNumber });
          const blockTs = Number(block.timestamp);
          // Allow 60s drift between block time and receipt timestamp
          onChainVerified = Math.abs(blockTs - receipt.timestamp) < 60;
        } else {
          onChainVerified = false;
        }
      } catch {
        onChainVerified = null; // RPC error — don't fail the check
      }
    }

    return NextResponse.json({
      valid,
      onChainVerified,
      receipt,
      ...(valid ? {} : { reason: "Signature mismatch — receipt may have been tampered with" }),
      ...(!valid ? {} : onChainVerified === false ? { warning: "TX not found on-chain — treat with caution" } : {}),
    });
  } catch (error: any) {
    console.error("Receipt verify error:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
