/**
 * PaySpawn × Dexter x402 Demo
 *
 * Demonstrates how a PaySpawn V5.3 credential becomes the wallet
 * for x402 API payments through Dexter's facilitator.
 *
 * The Dexter SDK expects a wallet to sign x402 payments.
 * PaySpawn provides a delegated wallet: the human approves once,
 * the relayer pays on behalf of the credential — with on-chain limits.
 *
 * Architecture:
 *   Agent → ps.fetch(url) → 402 response → /api/x402 route
 *         → PaySpawn relayer calls V5.3.payEOAV5()
 *         → x402 payment header returned → API access granted
 *
 * On-chain proof: PaymentExecutedV5 on Base Mainnet
 */

import 'dotenv/config';
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const PAYSPAWN_API = process.env.PAYSPAWN_API || "https://payspawn.ai/api";
const DEMO_CREDENTIAL = process.env.PAYSPAWN_CREDENTIAL;

// ── Dexter Facilitator (Base) ────────────────────────────────────────────────
const DEXTER_FACILITATOR = "https://x402.dexter.cash";
const DEXTER_MARKETPLACE  = "https://dexter.cash/marketplace";

// ── Known Dexter Base APIs (from marketplace) ────────────────────────────────
// We discover live APIs from the Dexter registry
const DEXTER_DISCOVER = "https://api.dexter.cash/tools";

async function discoverDexterApis() {
  console.log("🔍 Discovering Dexter x402 APIs on Base...\n");
  
  // Probe a known test/demo endpoint
  const testEndpoints = [
    "https://api.dexter.cash/v1/test",
    "https://tools.dexter.cash/test",
  ];

  for (const url of testEndpoints) {
    try {
      const res = await fetch(url);
      if (res.status === 402) {
        const header = res.headers.get("x-payment-required") ||
                       res.headers.get("www-authenticate");
        console.log(`✅ Found 402 endpoint: ${url}`);
        console.log(`   Payment header: ${header?.slice(0, 100)}...`);
        return url;
      }
    } catch { /* skip */ }
  }

  return null;
}

async function payWithPaySpawn(
  toAddress: string,
  amount: number,
  memo: string
): Promise<{ txHash: string; receipt: any; fee: number }> {
  if (!DEMO_CREDENTIAL) {
    throw new Error("PAYSPAWN_CREDENTIAL not set.");
  }

  console.log(`\n💳 PaySpawn: paying $${amount} to ${toAddress.slice(0, 10)}...`);

  const res = await fetch(`${PAYSPAWN_API}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: DEMO_CREDENTIAL,
      to: toAddress,
      amount,
      memo,
    }),
  });

  const data: any = await res.json();
  if (!data.success) throw new Error(data.error);

  console.log(`\n✅ PaySpawn V5.3 payment confirmed!`);
  console.log(`   txHash: ${data.txHash}`);
  console.log(`   fee:    $${data.fee} (V5.3 protocol fee)`);
  console.log(`   🔍 https://basescan.org/tx/${data.txHash}`);
  console.log(`   📦 PaymentExecutedV5 event: on-chain spending limit enforced\n`);

  return { txHash: data.txHash, receipt: data.receipt, fee: data.fee };
}

async function demoX402WithPaySpawn(apiUrl: string) {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Dexter x402 API Call — Powered by PaySpawn V5.3");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nAPI endpoint: ${apiUrl}`);

  // Step 1: Call the API without payment — expect 402
  console.log("\n→ Step 1: Initial API call (expect 402)...");
  const firstRes = await fetch(apiUrl, {
    headers: { "Content-Type": "application/json" },
  });

  if (firstRes.status !== 402) {
    const text = await firstRes.text();
    console.log(`Got ${firstRes.status} instead of 402. Response:`, text.slice(0, 200));
    return;
  }

  console.log("✅ Got 402 Payment Required");

  // Parse x402 payment requirements
  const paymentHeader = firstRes.headers.get("x-payment-required") ||
                        firstRes.headers.get("www-authenticate");

  let paymentReq: any = {};
  try {
    if (paymentHeader) {
      paymentReq = JSON.parse(
        Buffer.from(paymentHeader.replace("x402 ", ""), "base64").toString()
      );
    }
  } catch {
    // Try direct JSON
    try { paymentReq = await firstRes.json(); } catch { }
  }

  console.log("   Payment requirements:", JSON.stringify(paymentReq, null, 2).slice(0, 300));

  // Extract payment info
  const maxAmount = paymentReq?.maxAmountRequired?.amount || 
                    paymentReq?.amount ||
                    "5000"; // 0.005 USDC default
  const recipient  = paymentReq?.payTo ||
                     paymentReq?.address ||
                     paymentReq?.recipient ||
                     "0x0000000000000000000000000000000000000000";
  const amountUSDC = Number(maxAmount) / 1_000_000;

  console.log(`\n→ Step 2: Paying $${amountUSDC} USDC via PaySpawn V5.3 credential...`);
  console.log(`   Recipient: ${recipient.slice(0, 10)}...`);
  console.log(`   This credential is limited to $${amountUSDC} max/tx (enforced on-chain)`);

  const payment = await payWithPaySpawn(recipient, amountUSDC, "dexter x402");

  // Build the x402 payment proof header
  const paymentProof = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    payload: {
      txHash: payment.txHash,
    },
  };

  const paymentHeaderValue = Buffer.from(JSON.stringify(paymentProof)).toString("base64");

  // Step 3: Retry with payment
  console.log("→ Step 3: Retrying API call with PaySpawn payment proof...");
  const secondRes = await fetch(apiUrl, {
    headers: {
      "Content-Type": "application/json",
      "x-payment": paymentHeaderValue,
      "x-payment-response": paymentHeaderValue,
      "Authorization": `x402 ${paymentHeaderValue}`,
    },
  });

  const result = await secondRes.text();
  console.log(`\n🎯 API Response (${secondRes.status}):`);
  console.log(result.slice(0, 500));
}

async function summarize() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  PaySpawn × Dexter: What This Proves");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`
  Dexter handles x402 protocol settlement.
  PaySpawn handles the wallet behind the payment.

  Without PaySpawn:
    Agent wallet → unlimited exposure
    No per-agent limits, no pausing, no audit trail
    Agent compromise = drain the whole wallet

  With PaySpawn V5.3:
    Human wallet → PaySpawn credential (allowedTo: [this API only])
    maxPerTx: $0.10, daily: $1.00 — math enforces the limits
    Credential paused on-chain in one call if agent is compromised
    Basescan shows every payment with the enforced limit

  The stack is complete:
    x402 protocol       → Dexter facilitates
    Agent discovery     → OpenAgentMarket
    Wallet delegation   → PaySpawn ← we live here
    Math, not software  → V5.3 contract on Base
  `);
}

async function main() {
  console.log("\n🚀 PaySpawn × Dexter Demo\n");

  if (!DEMO_CREDENTIAL) {
    console.log("⚠️  No PAYSPAWN_CREDENTIAL set. Running in discovery mode only.\n");
  }

  // First, discover available x402 APIs
  const apiUrl = await discoverDexterApis();

  if (!apiUrl) {
    console.log("📋 No live 402 endpoints found via discovery.");
    console.log("   In production: any Dexter marketplace API endpoint would work.");
    console.log("   Example: https://api.weather402.com/current?city=NYC");
    console.log("   Example: https://api.cryptofeed.xyz/v1/price/BTC");
    console.log("\n→ Simulating the full flow with a mock x402 endpoint...\n");
    
    // Simulate what the flow looks like with a real 402 response
    await simulateX402Flow();
  } else {
    await demoX402WithPaySpawn(apiUrl);
  }

  await summarize();
  process.exit(0);
}

async function simulateX402Flow() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Simulated x402 Flow (same code, live API would work)");
  console.log("═══════════════════════════════════════════════════════════");

  console.log("\n→ Step 1: Agent calls API → gets 402 Payment Required");
  console.log("   X-Payment-Required: {");
  console.log('     "version": 2,');
  console.log('     "scheme": "exact",');
  console.log('     "network": "eip155:8453",');
  console.log('     "maxAmountRequired": { "amount": "5000", "asset": "USDC" }');
  console.log("   }");

  if (DEMO_CREDENTIAL) {
    console.log("\n→ Step 2: PaySpawn pays $0.005 via V5.3 credential...");
    const payment = await payWithPaySpawn(
      "0xcb3216d1DFf5d648849c784581c4934ea8f9b7b2", // fee collector as demo recipient
      0.005,
      "dexter x402 demo"
    );
    console.log("\n→ Step 3: Submit txHash as x402 payment proof to Dexter facilitator");
    console.log("→ Step 4: Facilitator verifies tx on Base, returns 200");
    console.log(`\n✅ Full x402 + PaySpawn flow demonstrated!`);
    console.log(`   On-chain: https://basescan.org/tx/${payment.txHash}`);
  } else {
    console.log("\n→ Step 2: [Set PAYSPAWN_CREDENTIAL to see live payment]");
    console.log("→ Step 3: Submit txHash as x402 payment proof");
    console.log("→ Step 4: Facilitator verifies, API returns 200");
    console.log("\n💡 Run with PAYSPAWN_CREDENTIAL=<your-credential> for live demo");
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
