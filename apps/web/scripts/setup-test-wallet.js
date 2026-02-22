/**
 * Setup script for x402 test wallet
 * 
 * Run with: PRIVATE_KEY=0x... node scripts/setup-test-wallet.js
 */

const { createPublicClient, createWalletClient, http, parseUnits } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// Contract addresses
const ROUTER = '0xB3Bd641350010E14Ca2f7139793F19c2A3e26683';
const POLICY = '0xbD55962D570f4E9843F7300002781aB68F51a09B';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ABIs
const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];

const POLICY_ABI = [
  {
    name: 'setPolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'dailyLimit', type: 'uint256' },
      { name: 'perTxLimit', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'policies',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      { name: 'human', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'dailyLimit', type: 'uint256' },
      { name: 'perTxLimit', type: 'uint256' },
      { name: 'dailySpent', type: 'uint256' },
      { name: 'lastResetDay', type: 'uint256' },
      { name: 'paused', type: 'bool' },
    ],
  },
];

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable required');
    console.log('Usage: PRIVATE_KEY=0x... node scripts/setup-test-wallet.js');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Setting up wallet:', account.address);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // Check USDC balance
  const balance = await publicClient.readContract({
    address: USDC,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  
  console.log('USDC Balance:', Number(balance) / 1e6, 'USDC');

  if (balance === 0n) {
    console.error('Error: No USDC balance. Send USDC to this wallet first.');
    process.exit(1);
  }

  // Check current allowance
  const allowance = await publicClient.readContract({
    address: USDC,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [account.address, ROUTER],
  });
  
  console.log('Current Router Allowance:', Number(allowance) / 1e6, 'USDC');

  // Step 1: Approve router (if needed)
  if (allowance < balance) {
    console.log('\n--- Step 1: Approving Router ---');
    const maxApproval = parseUnits('1000000', 6); // 1M USDC max
    
    const approveTx = await walletClient.writeContract({
      address: USDC,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [ROUTER, maxApproval],
    });
    
    console.log('Approve tx:', approveTx);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log('✅ Router approved!');
  } else {
    console.log('✅ Router already approved');
  }

  // Step 2: Set policy
  console.log('\n--- Step 2: Setting Policy ---');
  
  // Check if policy exists
  const policy = await publicClient.readContract({
    address: POLICY,
    abi: POLICY_ABI,
    functionName: 'policies',
    args: [account.address],
  });
  
  const [human] = policy;
  
  if (human === '0x0000000000000000000000000000000000000000') {
    // Set policy: $10 daily, $1 per tx (for testing)
    const dailyLimit = parseUnits('10', 6);
    const perTxLimit = parseUnits('1', 6);
    
    const policyTx = await walletClient.writeContract({
      address: POLICY,
      abi: POLICY_ABI,
      functionName: 'setPolicy',
      args: [account.address, dailyLimit, perTxLimit],
    });
    
    console.log('Policy tx:', policyTx);
    await publicClient.waitForTransactionReceipt({ hash: policyTx });
    console.log('✅ Policy set! Daily: $10, Per-tx: $1');
  } else {
    console.log('✅ Policy already exists');
    console.log('   Human:', human);
    console.log('   Daily limit:', Number(policy[2]) / 1e6, 'USDC');
    console.log('   Per-tx limit:', Number(policy[3]) / 1e6, 'USDC');
  }

  console.log('\n=== SETUP COMPLETE ===');
  console.log('Wallet:', account.address);
  console.log('');
  console.log('Generate API key:');
  console.log(`curl -X POST https://payspawn.ai/api/keys -H "Content-Type: application/json" -d '{"walletAddress": "${account.address}"}'`);
}

main().catch(console.error);
