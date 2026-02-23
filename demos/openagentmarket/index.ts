/**
 * PaySpawn × OpenAgentMarket Demo
 *
 * Demonstrates PaySpawn V5.3 credentials as the missing wallet layer
 * for agent-to-agent payments on OpenAgentMarket.
 *
 * Flow:
 *  1. Hirer agent connects to XMTP
 *  2. Sends task to target agent (Nansen / Aave)
 *  3. Agent demands payment (PAYMENT_REQUIRED)
 *  4. Hirer pays using a PaySpawn V5.3 credential
 *     — credential is locked to ONLY pay this agent's wallet
 *     — spending limit enforced by V5.3 smart contract on Base
 *  5. Hirer retries task with txHash + PaySpawn signed receipt
 *  6. Agent completes the task
 *
 * On-chain proof: PaymentExecutedV5 event on Base Mainnet
 */

import 'dotenv/config';
import { OpenAgentClient } from '@openagentmarket/nodejs';
import { Wallet } from 'ethers';

// ── Agent addresses (from OpenAgentMarket registry) ──────────────────────────
const AGENTS = {
  aave:   "0x789217581390b9Fb0480765c1b5Ba7a6C3C34d71",
  nansen: "0x6f9a991d20b6709Dd2C33907B8908671E2A6A416",
  openrouter: "0xa619Bd3f7ECbCe7418830023E7ef870fC3A622A7",
};

// ── Agent payment wallet (shared across all applefather's agents) ─────────────
const AGENT_PAYMENT_WALLET = "0x55a75ed44ba37bca4330a382229d06085267b98a";

const PAYSPAWN_API = process.env.PAYSPAWN_API || "https://payspawn.ai/api";

// ── PaySpawn V5.3 credential for this demo ────────────────────────────────────
// IMPORTANT: This credential must be pre-generated from the dashboard with:
//   - spender: V5.3 (0xaa8e6815b0E8a3006DEe0c3171Cf9CA165fd862e)
//   - allowedTo: [AGENT_PAYMENT_WALLET]  ← can ONLY pay this agent
//   - maxPerTx: $0.10 (100000 units)
//   - dailyAllowance: $1.00 (1000000 units)
// This is the core PaySpawn pitch: math enforces the limits, not software.
const DEMO_CREDENTIAL = process.env.PAYSPAWN_CREDENTIAL;

async function payWithPaySpawn(
  toAddress: string,
  amount: number,
  memo: string
): Promise<{ txHash: string; receipt: string; fee: number }> {
  if (!DEMO_CREDENTIAL) {
    throw new Error("PAYSPAWN_CREDENTIAL env var not set. Generate a V5.3 credential first.");
  }

  console.log(`\n💳 PaySpawn: paying $${amount} to ${toAddress.slice(0,10)}...`);
  console.log(`   Credential is locked to ONLY pay ${toAddress.slice(0,10)}...`);
  console.log(`   Spending limit enforced by V5.3 smart contract on Base`);

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
  if (!data.success) {
    throw new Error(`PaySpawn payment failed: ${data.error}`);
  }

  console.log(`\n✅ Payment confirmed on Base!`);
  console.log(`   txHash:  ${data.txHash}`);
  console.log(`   fee:     $${data.fee} USDC (V5.3 protocol fee)`);
  console.log(`   🔍 Basescan: https://basescan.org/tx/${data.txHash}`);

  return {
    txHash: data.txHash,
    receipt: data.receipt?.signature || data.txHash,
    fee: data.fee || 0,
  };
}

async function runAaveDemo(client: OpenAgentClient) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEMO 1: Aave Agent — Completing the applefather gap");
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n📖 Context: @applefather_eth showed Grok asking the Aave Agent");
  console.log('   "Best USDC yield?" → agent replies → builds unsigned tx');
  console.log("   Missing: WHO CONTROLS WHAT GROK CAN SPEND?");
  console.log("   Answer: PaySpawn V5.3 credential with on-chain limits\n");

  const aaveAddress = AGENTS.aave;
  console.log(`→ Sending 'aave_best_yield' task to Aave Agent...`);
  console.log(`  Agent: ${aaveAddress}`);

  const result: any = await client.sendTask(aaveAddress, "aave_best_yield", {
    asset: "USDC",
    chain: "base",
    amount: "500000",
  });

  if (result.paymentRequired) {
    console.log("\n💰 Payment required:", result.paymentRequired);

    const demand = result.paymentRequired;
    const recipient = demand.recipient || AGENT_PAYMENT_WALLET;
    const amount = parseFloat(demand.amount) || 0.005;

    const payment = await payWithPaySpawn(recipient, amount, "aave_best_yield query");

    console.log("\n→ Retrying task with PaySpawn payment proof...");
    const final: any = await client.sendTask(aaveAddress, "aave_best_yield", {
      asset: "USDC",
      chain: "base",
      amount: "500000",
    }, { txHash: payment.txHash });

    if (final.success) {
      console.log("\n🎯 AAVE AGENT RESPONSE:");
      console.log(JSON.stringify(final.result, null, 2));
    }
  } else if (result.success) {
    console.log("\n🎯 AAVE AGENT RESPONSE (free query):");
    console.log(JSON.stringify(result.result, null, 2));
    console.log("\n⚠️  NOTE: Aave Agent is currently free ($0). Zero payment enforcement.");
    console.log("   With PaySpawn: even free agents can have on-chain credential tracking.");
    console.log("   When Aave Agent turns on fees → zero code changes. Credential already set.");
  } else {
    console.log("\n❌ Error:", result.error);
  }
}

async function runNansenDemo(client: OpenAgentClient) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DEMO 2: Nansen Agent — Real payment, on-chain proof");
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n📖 Nansen charges $0.011/query. PaySpawn credential enforces:");
  console.log("   - maxPerTx: $0.10 (can't overpay)");
  console.log("   - allowedTo: [agentWallet] (can ONLY pay Nansen, no one else)");
  console.log("   - Math enforces this. Not software. Not us.\n");

  const nansenAddress = AGENTS.nansen;
  console.log(`→ Sending 'query' task to Nansen Agent...`);

  const result: any = await client.sendTask(nansenAddress, "query", {
    query: "What is the current USDC yield on Aave Base?",
    tier: "basic",
  });

  if (result.paymentRequired) {
    const demand = result.paymentRequired;
    const recipient = demand.recipient || AGENT_PAYMENT_WALLET;
    const amount = parseFloat(demand.amount) || 0.011;

    console.log(`\n💰 Nansen demands $${amount} USDC → ${recipient.slice(0,10)}...`);

    const payment = await payWithPaySpawn(recipient, amount, "nansen query");

    console.log("\n→ Retrying task with PaySpawn payment proof + signed receipt...");
    const final: any = await client.sendTask(nansenAddress, "query", {
      query: "What is the current USDC yield on Aave Base?",
      tier: "basic",
    }, { txHash: payment.txHash });

    if (final.success) {
      console.log("\n🎯 NANSEN AGENT RESPONSE:");
      console.log(JSON.stringify(final.result, null, 2));
    } else {
      console.log("\n❌ Error:", final.error);
    }
  } else {
    console.log("\n📊 Nansen response (no payment required):");
    console.log(JSON.stringify(result, null, 2));
  }
}

async function main() {
  console.log("\n🚀 PaySpawn × OpenAgentMarket Demo");
  console.log("   The missing wallet layer for agent-to-agent payments\n");

  // Use or generate a demo wallet
  let wallet: Wallet;
  if (process.env.DEMO_MNEMONIC) {
    wallet = Wallet.fromPhrase(process.env.DEMO_MNEMONIC);
  } else {
    wallet = Wallet.createRandom();
    console.log("⚠️  Generated new demo wallet. Save to DEMO_MNEMONIC:");
    console.log(`   DEMO_MNEMONIC="${(wallet as any).mnemonic.phrase}"\n`);
  }

  console.log(`📱 Hirer wallet: ${wallet.address}`);
  console.log(`   (This wallet has zero USDC — payments come from adam.pay via PaySpawn credential)\n`);

  // Connect to XMTP
  console.log("🔌 Connecting to XMTP...");
  const client = await OpenAgentClient.create({
    privateKey: wallet.privateKey,
    env: "production",
  });
  console.log(`✅ Connected as ${client.getAddress()}\n`);

  const demo = process.argv[2] || "aave";

  if (demo === "nansen") {
    await runNansenDemo(client);
  } else {
    await runAaveDemo(client);
    // Also run Nansen if credential is set
    if (DEMO_CREDENTIAL) {
      await runNansenDemo(client);
    }
  }

  console.log("\n════════════════════════════════════════════════════");
  console.log("  PaySpawn: The wallet layer the agent economy needs");
  console.log("  github.com/adambrainai/payspawn | payspawn.ai");
  console.log("════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
