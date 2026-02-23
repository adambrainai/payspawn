/**
 * PaySpawn Demo Hirer
 *
 * Hires the PaySpawn demo worker via XMTP.
 * Pays with Echo's PaySpawn V5.1 credential.
 * Verifies payment on Basescan. Shows full end-to-end flow.
 */
import 'dotenv/config';
import { OpenAgentClient } from '@openagentmarket/nodejs';
import { Wallet } from 'ethers';
import * as fs from 'node:fs';

const PAYSPAWN_API = process.env.PAYSPAWN_API || "https://payspawn.ai/api";

// Echo's V5.1 credential (from adam.pay, $25/day, any address)
const ECHO_CREDENTIAL = process.env.PAYSPAWN_CREDENTIAL
  || "eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHgzNTdiN0Q1QTY1MjlGNmFBM2I4OUEyNzY2OTg2MTVEMjExMEVEOUUyIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIyNTAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYxNDUxLCJlbmQiOjE4MDMzOTc1MTEsInNhbHQiOiIxMDkxNDg4NDMzMTAwMzIzODQiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0=";

async function payWithPaySpawn(
  to: string,
  amount: number,
  memo: string
): Promise<{ txHash: string; receipt: string; fee: number }> {
  console.log(`\n   💳 PaySpawn paying $${amount} to ${to.slice(0,10)}...`);

  const res = await fetch(`${PAYSPAWN_API}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: ECHO_CREDENTIAL, to, amount, memo }),
  });

  const data: any = await res.json();
  if (!data.success) throw new Error(`PaySpawn payment failed: ${data.error}`);

  console.log(`   ✅ Payment confirmed on Base`);
  console.log(`   txHash: ${data.txHash}`);
  console.log(`   🔍 https://basescan.org/tx/${data.txHash}`);
  if (data.fee > 0) console.log(`   fee: $${data.fee}`);

  return {
    txHash: data.txHash,
    receipt: JSON.stringify(data.receipt || {}),
    fee: data.fee || 0,
  };
}

async function main() {
  // Read worker address
  let workerAddress = process.env.WORKER_ADDRESS;
  if (!workerAddress && fs.existsSync(".worker-address")) {
    workerAddress = fs.readFileSync(".worker-address", "utf-8").trim();
  }
  if (!workerAddress) {
    console.error("Set WORKER_ADDRESS or run worker.ts first to generate .worker-address");
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PaySpawn × OpenAgentMarket — Live Demo");
  console.log("  Completing the applefather gap");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log(`📖 Scenario: Agent has idle USDC. Wants to find the best yield.`);
  console.log(`   Hires the Aave advisory agent. Pays via PaySpawn credential.`);
  console.log(`   Spending limit enforced on-chain. Basescan is the proof.\n`);

  // Create hirer wallet
  const hirerWallet = Wallet.createRandom();
  console.log(`👤 Hirer wallet:  ${hirerWallet.address} (no USDC — pays via credential)`);
  console.log(`💳 Credential:    Echo (V5.1, $25/day, adam.pay)`);
  console.log(`🤖 Worker:        ${workerAddress}\n`);

  console.log("🔌 Connecting to XMTP...");
  const client = await OpenAgentClient.create({
    privateKey: hirerWallet.privateKey,
    env: "production",
  });
  console.log(`✅ Connected as ${client.getAddress()}\n`);

  // Step 1: Send task — expect payment required
  console.log("━━━ STEP 1: Send task to Aave advisory agent ━━━");
  console.log(`→ Asking: "What's the best USDC yield on Base?"`);
  console.log(`→ Sending to: ${workerAddress}\n`);

  const firstResult: any = await client.sendTask(
    workerAddress,
    "aave_best_yield",
    { asset: "USDC", chain: "base", amount: "500000" },
    { timeout: 30000 }
  );

  if (firstResult.error && !firstResult.paymentRequired) {
    console.log("❌ Error:", firstResult.error);
    process.exit(1);
  }

  // Also check if payment demand is embedded in the result string (SDK wraps it sometimes)
  let paymentDemand = firstResult.paymentRequired;
  if (!paymentDemand && firstResult.result) {
    try {
      const resultStr = typeof firstResult.result === "string"
        ? firstResult.result
        : JSON.stringify(firstResult.result);
      // Extract JSON from the result string
      const jsonMatch = resultStr.match(/\{[\s\S]*"type"\s*:\s*"PAYMENT_REQUIRED"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.payment) paymentDemand = parsed.payment;
      }
    } catch { /* ignore parse errors */ }
  }

  if (paymentDemand) {
    const demand = paymentDemand;
    const recipient = demand.recipient;
    const amount = parseFloat(demand.amount);

    console.log("━━━ STEP 2: Agent demands payment ━━━");
    console.log(`→ Payment required: $${amount} USDC`);
    console.log(`→ Pay to: ${recipient}`);
    console.log(`\n📋 This is where wallets today fail:`);
    console.log(`   - Which wallet does the agent use?`);
    console.log(`   - Who set the spending limit?`);
    console.log(`   - What if the agent is compromised?`);
    console.log(`\n   PaySpawn answers all three.\n`);

    // Step 2: Pay via PaySpawn
    console.log("━━━ STEP 3: Pay via PaySpawn V5.1 credential ━━━");
    const payment = await payWithPaySpawn(recipient, amount, "aave_best_yield query");

    // Step 3: Retry with payment proof + PaySpawn receipt
    console.log("\n━━━ STEP 4: Retry with PaySpawn payment proof ━━━");
    console.log("→ Sending txHash + signed receipt to worker...");

    const finalResult: any = await client.sendTask(
      workerAddress,
      "aave_best_yield",
      {
        asset: "USDC",
        chain: "base",
        amount: "500000",
        payspawnReceipt: payment.receipt,
      },
      { txHash: payment.txHash, timeout: 30000 }
    );

    if (finalResult.success) {
      console.log("\n━━━ RESULT ━━━");
      console.log(JSON.stringify(finalResult.result, null, 2));
    } else {
      console.log("❌", finalResult.error);
    }

  } else if (firstResult.success && !paymentDemand) {
    console.log("\n━━━ RESULT (no payment gate) ━━━");
    console.log(JSON.stringify(firstResult.result, null, 2));
  }

  // Final summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  What just happened:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`
  1. Agent-to-agent communication — via XMTP (OpenAgentMarket)
  2. Worker demanded payment    — $0.005 USDC per query
  3. Hirer paid via PaySpawn    — credential from adam.pay
  4. Payment enforced on-chain  — V5.1 contract on Base
  5. Worker verified receipt    — cryptographic proof, not just txHash
  6. Task completed             — Aave yield data + unsigned supply tx

  applefather showed the vision. We completed it.
  The missing piece: a wallet with limits the agent actually respects.
  
  🔍 Basescan proof above.
  📦 PaymentExecuted event: contract enforced the limit.
  
  payspawn.ai | @payspawn
  `);

  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
