/**
 * Hire a LIVE OpenAgentMarket agent using a PaySpawn credential.
 * 
 * Usage:
 *   npx tsx hire-live-agent.ts aave      — hire Aave Agent
 *   npx tsx hire-live-agent.ts nansen    — hire Nansen Agent (costs $0.011)
 */
import 'dotenv/config';
import { OpenAgentClient } from '@openagentmarket/nodejs';
import { Wallet } from 'ethers';

const PAYSPAWN_API  = process.env.PAYSPAWN_API  || "https://payspawn.ai/api";
const CREDENTIAL    = process.env.PAYSPAWN_CREDENTIAL;
const TIMEOUT_MS    = 60_000; // 60s — live agents can be slow to respond

const AGENTS: Record<string, { xmtp: string; task: string; params: object; price: string }> = {
  aave: {
    xmtp:   "0x789217581390b9Fb0480765c1b5Ba7a6C3C34d71",
    task:   "aave_best_yield",
    params: { asset: "USDC", chain: "base", amount: "500000" },
    price:  "free",
  },
  nansen: {
    xmtp:   "0x6f9a991d20b6709Dd2C33907B8908671E2A6A416",
    task:   "query",
    params: { query: "USDC yield on Aave Base", tier: "basic" },
    price:  "$0.011",
  },
};

async function payWithPaySpawn(to: string, amount: number, memo: string) {
  if (!CREDENTIAL) throw new Error("PAYSPAWN_CREDENTIAL not set in .env");
  console.log(`\n   💳 Paying $${amount} via PaySpawn → ${to.slice(0,10)}...`);
  const res = await fetch(`${PAYSPAWN_API}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: CREDENTIAL, to, amount, memo }),
  });
  const data: any = await res.json();
  if (!data.success) throw new Error(`Payment failed: ${data.error}`);
  console.log(`   ✅ Paid on Base: https://basescan.org/tx/${data.txHash}`);
  return { txHash: data.txHash, receipt: data.receipt };
}

function parsePaymentDemand(result: any): { amount: number; recipient: string } | null {
  // Check direct paymentRequired field
  if (result.paymentRequired?.amount) return result.paymentRequired;

  // Check embedded in result string
  const str = typeof result.result === "string" ? result.result : JSON.stringify(result.result || "");
  const match = str.match(/\{[\s\S]*?"type"\s*:\s*"PAYMENT_REQUIRED"[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.payment) return { amount: parseFloat(parsed.payment.amount), recipient: parsed.payment.recipient };
    } catch { /* ignore */ }
  }

  // Check if result itself is the payment object
  if (result.result?.payment) return result.result.payment;
  return null;
}

async function main() {
  const target = process.argv[2] || "aave";
  const agent = AGENTS[target];
  if (!agent) {
    console.error(`Unknown agent: ${target}. Use: aave | nansen`);
    process.exit(1);
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  PaySpawn × OpenAgentMarket — LIVE agent: ${target.toUpperCase()}`);
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log(`🤖 Agent XMTP: ${agent.xmtp}`);
  console.log(`📋 Task:       ${agent.task}`);
  console.log(`💰 Price:      ${agent.price}`);
  console.log(`⏱️  Timeout:    ${TIMEOUT_MS/1000}s\n`);

  const wallet = Wallet.createRandom();
  console.log(`👤 Hirer:  ${wallet.address}`);
  console.log("🔌 Connecting to XMTP...");

  const client = await OpenAgentClient.create({
    privateKey: wallet.privateKey,
    env: "production",
  });
  console.log(`✅ Connected\n`);

  // ── Step 1: Initial task request ──────────────────────────────────────────
  console.log("━━━ STEP 1: Send task ━━━");
  let result: any;
  try {
    result = await client.sendTask(agent.xmtp, agent.task, agent.params, { timeout: TIMEOUT_MS });
  } catch (e: any) {
    if (e.message?.includes("Timeout")) {
      console.log(`⏱️  Agent timed out (${TIMEOUT_MS/1000}s). Agent may be offline.`);
      console.log(`   Agent: ${agent.xmtp}`);
      console.log(`\n   Tip: run 'npx tsx hire-live-agent.ts aave' again — XMTP agents spin up on first message.`);
      process.exit(0);
    }
    throw e;
  }

  // ── Step 2: Handle payment demand ─────────────────────────────────────────
  const demand = parsePaymentDemand(result);

  if (demand) {
    console.log(`\n━━━ STEP 2: Agent demands payment ━━━`);
    console.log(`   Amount:    $${demand.amount} USDC`);
    console.log(`   Recipient: ${demand.recipient}`);

    if (!CREDENTIAL) {
      console.error("\n❌ PAYSPAWN_CREDENTIAL not set — can't pay. Add to .env");
      process.exit(1);
    }

    // Pay via PaySpawn
    console.log("\n━━━ STEP 3: Pay via PaySpawn credential ━━━");
    const payment = await payWithPaySpawn(demand.recipient, demand.amount, `${agent.task} query`);

    // Retry with payment proof
    console.log("\n━━━ STEP 4: Retry with proof ━━━");
    result = await client.sendTask(
      agent.xmtp,
      agent.task,
      { ...agent.params, payspawnReceipt: payment.receipt },
      { txHash: payment.txHash, timeout: TIMEOUT_MS }
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  console.log("\n━━━ RESULT ━━━");
  if (result.success) {
    console.log(JSON.stringify(result.result, null, 2));
  } else if (result.error) {
    console.log("❌ Error:", result.error);
  } else {
    // Sometimes SDK returns the raw response
    console.log(JSON.stringify(result, null, 2));
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Done. Agent hired, task complete, payment on-chain.`);
  if (demand) {
    console.log(`  PaySpawn credential enforced the spend. Math, not software.`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(e => { console.error("\nFatal:", e.message); process.exit(1); });
