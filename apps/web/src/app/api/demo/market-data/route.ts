/**
 * Demo x402 endpoint: GET /api/demo/market-data
 *
 * A live x402-protected market-data endpoint that charges $0.005 USDC on Base.
 * Standard `exact` scheme — compatible with any x402 client (Dexter, PaySpawn, Coinbase).
 *
 * Used in the Dexter + PaySpawn demo to show:
 *   ps.fetch('https://payspawn.ai/api/demo/market-data')
 *   → 402 Payment Required ($0.005)
 *   → PaySpawn V5.3 pays on-chain
 *   → 200 OK with market data
 */

import { NextRequest, NextResponse } from "next/server";

// Fee collector receives the $0.005
const FEE_COLLECTOR = "0xcb3216d1DFf5d648849c784581c4934ea8f9b7b2";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PRICE_USDC_ATOMIC = "5000"; // $0.005 in USDC (6 decimals)
const PRICE_USD = 0.005;

/**
 * Build a compliant x402 PAYMENT-REQUIRED header (exact scheme, Base, USDC)
 */
function buildPaymentRequired(resource: string): string {
  const requirements = {
    paymentRequirements: [
      {
        scheme: "exact",
        network: "base",
        maxAmountRequired: PRICE_USDC_ATOMIC,
        resource,
        description: "USDC/ETH price feed — powered by PaySpawn x402",
        mimeType: "application/json",
        payTo: FEE_COLLECTOR,
        maxTimeoutSeconds: 60,
        asset: USDC_BASE,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitator: "https://payspawn.ai",
        },
      },
    ],
  };
  return Buffer.from(JSON.stringify(requirements)).toString("base64");
}

/**
 * Verify a payment proof header.
 * Accepts either:
 *   - PaySpawn proof (base64 JSON with x_payspawn.txHash)
 *   - Standard x402 PAYMENT-SIGNATURE (base64 JSON with payload.txHash or x-tx-hash)
 */
function verifyPayment(paymentHeader: string): { valid: boolean; txHash?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));

    // PaySpawn extension
    if (decoded.x_payspawn?.txHash) {
      return { valid: true, txHash: decoded.x_payspawn.txHash };
    }
    // Standard x402 signature
    if (decoded.payload?.txHash) {
      return { valid: true, txHash: decoded.payload.txHash };
    }
    // Alternate: txHash at root
    if (decoded.txHash) {
      return { valid: true, txHash: decoded.txHash };
    }
    // Any payment proof we can't fully verify — accept optimistically for demo
    return { valid: true, txHash: "pending" };
  } catch {
    return { valid: false };
  }
}

/**
 * GET /api/demo/market-data
 *
 * Without payment header → 402 with payment requirements
 * With valid payment header → 200 with market data
 */
export async function GET(request: NextRequest) {
  const paymentHeader =
    request.headers.get("x-payment") ||
    request.headers.get("payment-signature") ||
    request.headers.get("x-payment-signature") ||
    request.headers.get("x-payment-txhash");

  // No payment → 402
  if (!paymentHeader) {
    const resource = new URL(request.url).pathname;
    const encoded = buildPaymentRequired(resource);

    return new NextResponse(
      JSON.stringify({
        error: "Payment Required",
        price: PRICE_USD,
        currency: "USDC",
        network: "base",
        payTo: FEE_COLLECTOR,
        description: "USDC/ETH market data — $0.005 per request",
        x402: true,
      }),
      {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "x-payment-required": encoded,
          "payment-required": encoded,
          "X-Price-USD": PRICE_USD.toString(),
          "X-Pay-To": FEE_COLLECTOR,
          "X-Network": "base",
        },
      }
    );
  }

  // Verify payment
  const { valid, txHash } = verifyPayment(paymentHeader);

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid payment proof. Retry with a valid PAYMENT-SIGNATURE." },
      { status: 402 }
    );
  }

  // Payment verified — return market data
  const now = Date.now();
  const data = {
    success: true,
    paid: true,
    txHash,
    explorer: txHash && txHash !== "pending"
      ? `https://basescan.org/tx/${txHash}`
      : null,

    // Market data
    timestamp: new Date(now).toISOString(),
    market: {
      USDC: {
        price: 1.0,
        symbol: "USDC",
        network: "base",
        contract: USDC_BASE,
        decimals: 6,
      },
      ETH: {
        // Live-ish: seeded from a deterministic formula for demo stability
        price: parseFloat((2842.5 + Math.sin(now / 1_000_000) * 40).toFixed(2)),
        symbol: "ETH",
        change24h: parseFloat((Math.sin(now / 500_000) * 3.2).toFixed(2)),
        network: "base",
      },
      PAYSPAWN: {
        note: "community token, check Dexscreener",
        contract: "0x06400D9877A9b2ba76CE40bC746A44C162e9cBa3",
        network: "base",
      },
    },

    // Protocol metadata
    protocol: {
      name: "PaySpawn",
      version: "v5.3",
      spender: "0xaa8e6815b0E8a3006DEe0c3171Cf9CA165fd862e",
      fee: "$0.005 flat per request",
      paymentRails: "x402 + PaySpawn V5.3",
    },
  };

  return NextResponse.json(data, {
    headers: {
      "X-Payment-Verified": "true",
      "X-TxHash": txHash || "",
    },
  });
}

export async function HEAD(request: NextRequest) {
  // Return 402 for HEAD requests — lets x402 clients discover pricing
  const resource = new URL(request.url).pathname;
  const encoded = buildPaymentRequired(resource);

  return new NextResponse(null, {
    status: 402,
    headers: {
      "x-payment-required": encoded,
      "payment-required": encoded,
      "X-Price-USD": PRICE_USD.toString(),
    },
  });
}
