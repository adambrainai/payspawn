import { NextRequest, NextResponse } from "next/server";

/**
 * Mock x402 Resource Server for Testing
 * 
 * Returns 402 Payment Required with proper x402 headers.
 * After payment, returns the "premium" content.
 */

const MOCK_PAYMENT_REQUIREMENTS = {
  x402Version: 1,
  paymentRequirements: [
    {
      scheme: "exact",
      network: "base",
      maxAmountRequired: "100000", // $0.10 USDC (6 decimals)
      resource: "https://payspawn.ai/api/x402/test-resource",
      description: "Test premium content - $0.10",
      mimeType: "application/json",
      payTo: "0xBb1fF2EEf4617C5e7c625aF697A85F9975A2bb4e", // Test wallet receives payment
      maxTimeoutSeconds: 300,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    },
  ],
};

// Simple in-memory payment tracking (for demo purposes)
const paidTxHashes = new Set<string>();

export async function GET(request: NextRequest) {
  // Check for payment proof in headers
  const paymentHeader = 
    request.headers.get("x-payment") ||
    request.headers.get("X-Payment") ||
    request.headers.get("X-PAYMENT");
  
  const txHashHeader = request.headers.get("X-Payment-TxHash");

  // If we have a tx hash, consider it paid (simplified verification)
  if (txHashHeader && txHashHeader.startsWith("0x")) {
    paidTxHashes.add(txHashHeader);
    
    return NextResponse.json({
      success: true,
      message: "🎉 Premium content unlocked!",
      content: {
        secret: "The cake is a lie.",
        timestamp: new Date().toISOString(),
        paidWith: txHashHeader,
      },
    });
  }

  // If payment header exists, try to parse it
  if (paymentHeader) {
    try {
      const paymentData = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString()
      );
      
      if (paymentData.txHash) {
        paidTxHashes.add(paymentData.txHash);
        
        return NextResponse.json({
          success: true,
          message: "🎉 Premium content unlocked!",
          content: {
            secret: "The cake is a lie.",
            timestamp: new Date().toISOString(),
            paidWith: paymentData.txHash,
          },
        });
      }
    } catch {
      // Invalid payment header
    }
  }

  // No valid payment - return 402
  const response = NextResponse.json(
    {
      error: "Payment Required",
      message: "This is premium content. Payment of $0.10 USDC required.",
      price: "$0.10",
      acceptedPayments: ["USDC on Base"],
    },
    { status: 402 }
  );

  // Add x402 payment requirements header
  const requirementsBase64 = Buffer.from(
    JSON.stringify(MOCK_PAYMENT_REQUIREMENTS)
  ).toString("base64");

  response.headers.set("X-Payment-Required", requirementsBase64);
  response.headers.set("X-PAYMENT", requirementsBase64);

  return response;
}

export async function POST(request: NextRequest) {
  // Same logic as GET
  return GET(request);
}
