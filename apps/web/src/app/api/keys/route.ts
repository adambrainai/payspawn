import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const API_SECRET = process.env.API_SECRET || "payspawn-default-secret-change-me";

/**
 * Generate a deterministic API key for a wallet address.
 * The key is a HMAC signature - validates the wallet owns this key.
 */
export function generateApiKey(walletAddress: string): string {
  const signature = createHmac("sha256", API_SECRET)
    .update(walletAddress.toLowerCase())
    .digest("hex")
    .slice(0, 32);
  return `ps_${signature}`;
}

/**
 * Validate that an API key matches a wallet address.
 */
export function validateApiKey(apiKey: string, walletAddress: string): boolean {
  const expected = generateApiKey(walletAddress);
  return apiKey === expected;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress || !walletAddress.startsWith("0x")) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const apiKey = generateApiKey(walletAddress);

    return NextResponse.json({
      success: true,
      apiKey,
      walletAddress: walletAddress.toLowerCase(),
    });
  } catch (error) {
    console.error("Error generating API key:", error);
    return NextResponse.json(
      { error: "Failed to generate API key" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/keys",
    description: "Generate an API key for your wallet",
    body: { walletAddress: "0x..." },
  });
}
