import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// In production, use a real database and email service (Resend, SendGrid, etc.)
// For now, we'll store email preferences and log alerts

const API_SECRET = process.env.API_SECRET || "payspawn-default-secret-change-me";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

interface AlertPreferences {
  email: string;
  onEveryPayment: boolean;
  onLargePayment: boolean;
  largePaymentThreshold: number;
  onDailyLimitReached: boolean;
}

// Simple in-memory store (use database in production)
const alertPrefs: Map<string, AlertPreferences> = new Map();

function generateApiKey(walletAddress: string): string {
  const hash = createHash("sha256")
    .update(`${walletAddress.toLowerCase()}-${API_SECRET}`)
    .digest("hex");
  return `ps_${hash.slice(0, 32)}`;
}

function validateApiKeyForWallet(apiKey: string, walletAddress: string): boolean {
  const expectedKey = generateApiKey(walletAddress);
  return apiKey === expectedKey;
}

// Save alert preferences
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("X-API-Key");
    const body = await request.json();
    const { walletAddress, email, onEveryPayment, onLargePayment, largePaymentThreshold, onDailyLimitReached } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // If API key provided, validate it matches the wallet
    if (apiKey && !validateApiKeyForWallet(apiKey, walletAddress)) {
      return NextResponse.json({ error: "Invalid API key for this wallet" }, { status: 401 });
    }

    alertPrefs.set(walletAddress.toLowerCase(), {
      email: email || "",
      onEveryPayment: onEveryPayment ?? true,
      onLargePayment: onLargePayment ?? true,
      largePaymentThreshold: largePaymentThreshold ?? 50,
      onDailyLimitReached: onDailyLimitReached ?? true,
    });

    return NextResponse.json({ success: true, message: "Alert preferences saved" });
  } catch (error) {
    console.error("Error saving alert preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}

// Get alert preferences
export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get("wallet");
  
  if (!walletAddress) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  const prefs = alertPrefs.get(walletAddress.toLowerCase());
  
  return NextResponse.json({
    preferences: prefs || {
      email: "",
      onEveryPayment: true,
      onLargePayment: true,
      largePaymentThreshold: 50,
      onDailyLimitReached: true,
    },
  });
}

// Send alert (called internally by /api/pay)
export async function sendPaymentAlert(
  walletAddress: string,
  payment: { to: string; amount: number; txHash: string }
) {
  const prefs = alertPrefs.get(walletAddress.toLowerCase());
  if (!prefs || !prefs.email) return;

  const shouldAlert = 
    prefs.onEveryPayment || 
    (prefs.onLargePayment && payment.amount >= prefs.largePaymentThreshold);

  if (!shouldAlert) return;

  // Log the alert (replace with actual email sending in production)
  console.log(`[ALERT] Payment from ${walletAddress}: $${payment.amount} to ${payment.to} (tx: ${payment.txHash})`);

  // If Resend API key is configured, send email
  if (RESEND_API_KEY && prefs.email) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "PaySpawn <alerts@payspawn.ai>",
          to: prefs.email,
          subject: `💸 Payment Alert: $${payment.amount} sent`,
          html: `
            <h2>PaySpawn Payment Alert</h2>
            <p>A payment was made from your wallet:</p>
            <ul>
              <li><strong>Amount:</strong> $${payment.amount} USDC</li>
              <li><strong>To:</strong> ${payment.to}</li>
              <li><strong>Transaction:</strong> <a href="https://basescan.org/tx/${payment.txHash}">${payment.txHash.slice(0, 10)}...</a></li>
            </ul>
            <p>If you didn't authorize this, <a href="https://payspawn.ai/dashboard">pause your agent immediately</a>.</p>
          `,
        }),
      });
    } catch (error) {
      console.error("Failed to send email alert:", error);
    }
  }
}
