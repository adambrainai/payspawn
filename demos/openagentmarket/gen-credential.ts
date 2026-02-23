/**
 * Generate a PaySpawn V5.3 demo credential locked to OpenAgentMarket's agent payment wallet.
 * 
 * This credential:
 *   - Can ONLY pay 0x55a75ed44ba37bca4330a382229d06085267b98a (the agent wallet)
 *   - maxPerTx: $0.10 (no single payment over $0.10)
 *   - dailyAllowance: $1.00
 *   - Valid 30 days
 * 
 * Prints the base64 credential string + USDC approval instructions.
 */

import 'dotenv/config';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const V5_3_SPENDER  = "0xaa8e6815b0E8a3006DEe0c3171Cf9CA165fd862e" as Hex;
const USDC          = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Hex;
const RPC           = "https://base-mainnet.g.alchemy.com/v2/6VKyL1jVUS-1FHMdZwiem";

// OpenAgentMarket agent payment wallet (all applefather's agents)
const AGENT_WALLET  = "0x55a75ed44ba37bca4330a382229d06085267b98a" as Hex;

// adam.pay test wallet
const ACCOUNT       = "0x4eB1b8Dd6eccBE4fE59c0c25eaAcF6564B5e0482" as Hex;

async function main() {
  const now     = Math.floor(Date.now() / 1000);
  const salt    = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

  const permission = {
    account:      ACCOUNT,
    spender:      V5_3_SPENDER,
    token:        USDC,
    allowance:    parseUnits("1", 6),    // $1.00 daily max
    period:       86400,                  // 1 day rolling window
    start:        now,
    end:          now + 30 * 86400,       // 30 days
    salt,
    maxPerTx:     parseUnits("0.10", 6), // $0.10 max per tx
    allowedTo:    [AGENT_WALLET],         // can ONLY pay this agent
    maxTxPerHour: 10,                     // max 10 tx/hour
    parentHash:   "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
  };

  // Compute the credential hash (keccak256 of abi.encode(PermissionV5))
  const credentialHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address,address,address,uint256,uint48,uint48,uint48,uint256,uint256,address[],uint8,bytes32"
      ),
      [
        permission.account,
        permission.spender,
        permission.token,
        permission.allowance,
        permission.period,
        permission.start,
        permission.end,
        permission.salt,
        permission.maxPerTx,
        permission.allowedTo,
        permission.maxTxPerHour,
        permission.parentHash,
      ]
    )
  );

  // Encode credential
  const credentialPayload = {
    signature: "EOA",
    permission: {
      account:      permission.account,
      spender:      permission.spender,
      token:        permission.token,
      allowance:    permission.allowance.toString(),
      period:       permission.period,
      start:        permission.start,
      end:          permission.end,
      salt:         permission.salt.toString(),
      maxPerTx:     permission.maxPerTx.toString(),
      allowedTo:    permission.allowedTo,
      maxTxPerHour: permission.maxTxPerHour,
      parentHash:   permission.parentHash,
    },
  };

  const credentialB64 = Buffer.from(JSON.stringify(credentialPayload)).toString("base64");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PaySpawn V5.3 Demo Credential — OpenAgentMarket locked");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`
Credential details:
  Account:      ${permission.account} (adam.pay)
  Spender:      ${permission.spender} (V5.3)
  Daily limit:  $1.00 USDC
  Max per tx:   $0.10 USDC
  Max tx/hour:  10
  AllowedTo:    ${AGENT_WALLET}
                (can ONLY pay OpenAgentMarket agent wallet — math enforced)
  Valid until:  ${new Date((permission.end) * 1000).toLocaleDateString()}
  Salt:         ${permission.salt}
  Hash:         ${credentialHash}
`);

  console.log("━━━ STEP 1: Approve USDC to V5.3 spender ━━━");
  console.log(`
Go to:  https://basescan.org/token/${USDC}#writeContract

Call: approve(
  spender: ${V5_3_SPENDER},
  amount:  1000000   <- $1.00 USDC (exact credential allowance)
)

Or via cast:
  cast send ${USDC} \\
    "approve(address,uint256)" ${V5_3_SPENDER} 1000000 \\
    --rpc-url ${RPC} \\
    --private-key YOUR_PRIVATE_KEY
`);

  console.log("━━━ STEP 2: Add to .env ━━━");
  console.log(`\nPAYSPAWN_CREDENTIAL="${credentialB64}"\n`);

  console.log("━━━ STEP 3: Run the demo ━━━");
  console.log("\nnpm run demo\n");

  console.log("━━━ The on-chain guarantees ━━━");
  console.log(`
  ✓ Can ONLY pay ${AGENT_WALLET.slice(0,10)}...
    → Any other payment reverts with RecipientNotWhitelisted
  ✓ Max $0.10 per transaction
    → Larger payments revert with ExceedsPerTxLimit
  ✓ Max $1.00 per day
    → Daily limit reverts with ExceedsDailyLimit
  ✓ Pause instantly: POST /api/pay/pause { credential, pause: true }
    → Immediate on-chain freeze, all future payments fail
  
  This is math. Not software. Not us. The V5.3 contract on Base.
`);
}

main().catch(console.error);
