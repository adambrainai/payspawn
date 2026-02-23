/**
 * Quick probe: connect to XMTP and ping the Aave Agent to see its actual response.
 * No payment needed — Aave Agent is free ($0).
 */
import 'dotenv/config';
import { OpenAgentClient } from '@openagentmarket/nodejs';
import { Wallet } from 'ethers';

const AAVE_AGENT   = "0x789217581390b9Fb0480765c1b5Ba7a6C3C34d71";
const NANSEN_AGENT = "0x6f9a991d20b6709Dd2C33907B8908671E2A6A416";

async function main() {
  const wallet = Wallet.createRandom();
  console.log(`\n[probe] Hirer wallet: ${wallet.address}`);
  console.log("[probe] Connecting to XMTP (production)...");

  const client = await OpenAgentClient.create({
    privateKey: wallet.privateKey,
    env: "production",
  });

  console.log(`[probe] Connected! ✅\n`);

  // 1. Try Aave Agent — ask for best yield
  console.log("=== AAVE AGENT ===");
  console.log(`→ Sending 'aave_best_yield' to ${AAVE_AGENT}`);
  try {
    const r: any = await client.sendTask(AAVE_AGENT, "aave_best_yield", {
      asset: "USDC", chain: "base", amount: "500000"
    }, { timeout: 15000 });

    if (r.paymentRequired) {
      console.log("💰 Payment required:", JSON.stringify(r.paymentRequired, null, 2));
    } else if (r.success) {
      console.log("✅ Result:", JSON.stringify(r.result, null, 2));
    } else {
      console.log("❌ Error:", r.error);
    }
  } catch (e: any) {
    console.log("timeout/error:", e.message);
  }

  // 2. Try Nansen Agent
  console.log("\n=== NANSEN AGENT ===");
  console.log(`→ Sending 'query' to ${NANSEN_AGENT}`);
  try {
    const r: any = await client.sendTask(NANSEN_AGENT, "query", {
      query: "USDC yield on Aave Base", tier: "basic"
    }, { timeout: 15000 });

    if (r.paymentRequired) {
      console.log("💰 Payment required:", JSON.stringify(r.paymentRequired, null, 2));
    } else if (r.success) {
      console.log("✅ Result:", JSON.stringify(r.result, null, 2));
    } else {
      console.log("❌ Error:", r.error);
    }
  } catch (e: any) {
    console.log("timeout/error:", e.message);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
