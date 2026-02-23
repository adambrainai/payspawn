/**
 * PaySpawn Demo Worker Agent
 * Uses OpenAgent (worker) from @openagentmarket/nodejs
 *
 * Listens via XMTP, demands payment, verifies PaySpawn receipt before completing task.
 */
import 'dotenv/config';
import { OpenAgent } from '@openagentmarket/nodejs';
import { Wallet } from 'ethers';
import * as fs from 'node:fs';

const PAYSPAWN_API = process.env.PAYSPAWN_API || "https://payspawn.ai/api";
const WORKER_PRICE = 0.005; // $0.005 per query

async function verifyPaySpawnReceipt(receipt: string): Promise<{ valid: boolean; txHash?: string }> {
  try {
    const res = await fetch(`${PAYSPAWN_API}/receipt/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt }),
    });
    const data: any = await res.json();
    return { valid: data.valid === true, txHash: data.receipt?.txHash };
  } catch { return { valid: false }; }
}

async function getAaveYield(): Promise<object> {
  return {
    asset: "USDC",
    chain: "Base",
    supplyAPY: "3.17%",
    borrowAPY: "5.82%",
    totalLiquidity: "$142M",
    recommendation: "Supply on Base Aave V3. Best USDC yield on Base.",
    unsignedTx: {
      to: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      method: "supply(address,uint256,address,uint16)",
      params: {
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "YOUR_AMOUNT",
        onBehalfOf: "YOUR_WALLET",
        referralCode: 0,
      },
      note: "Unsigned tx — never touches your keys.",
    },
  };
}

async function main() {
  // Generate or load worker wallet
  let workerWallet: Wallet;
  if (process.env.WORKER_MNEMONIC) {
    workerWallet = Wallet.fromPhrase(process.env.WORKER_MNEMONIC);
  } else {
    workerWallet = Wallet.createRandom();
    console.log(`\n⚠️  New worker wallet. Save to WORKER_MNEMONIC:`);
    console.log(`   WORKER_MNEMONIC="${(workerWallet as any).mnemonic.phrase}"`);
    // Save to file so hirer can read it
    fs.writeFileSync(".worker-mnemonic", (workerWallet as any).mnemonic.phrase);
  }

  console.log(`\n🤖 PaySpawn Demo Worker`);
  console.log(`   Wallet: ${workerWallet.address}`);
  console.log(`   Price:  $${WORKER_PRICE} USDC per query`);
  console.log(`   Skills: aave_best_yield`);

  const agent = await OpenAgent.create({
    signer: workerWallet,
    env: "production",
    payment: {
      amount: WORKER_PRICE.toString(),
      currency: "USDC",
      recipientAddress: workerWallet.address,
    },
  });

  // Save XMTP address for hirer
  const xmtpAddr = (agent as any).agent?.address || workerWallet.address;
  fs.writeFileSync(".worker-address", xmtpAddr);
  console.log(`\n✅ XMTP address: ${xmtpAddr}`);
  console.log(`   Listening for tasks...\n`);

  agent.onTask("aave_best_yield", async (params: any) => {
    console.log(`\n📨 Task: aave_best_yield — params: ${JSON.stringify(params)}`);
    
    // Verify PaySpawn receipt if provided
    if (params.payspawnReceipt) {
      console.log("   🔍 Verifying PaySpawn receipt...");
      const v = await verifyPaySpawnReceipt(params.payspawnReceipt);
      if (!v.valid) {
        return { error: "Invalid PaySpawn receipt. Payment not verified." };
      }
      console.log(`   ✅ Receipt valid! txHash: ${v.txHash}`);
    }

    const result = await getAaveYield();
    console.log("   ✅ Task complete — returning Aave yield data");
    return result;
  });

  await agent.start();
}

main().catch(e => { console.error(e.message); process.exit(1); });
