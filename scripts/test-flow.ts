/**
 * PaySpawn E2E Test Script
 * 
 * Tests the full flow:
 * 1. Sign a spend permission (simulating human approval)
 * 2. Call the pay API
 * 3. Verify the payment
 * 
 * Usage:
 *   PRIVATE_KEY=0x... npx ts-node scripts/test-flow.ts
 * 
 * Requirements:
 *   - Wallet with USDC on Base
 *   - Private key for that wallet
 */

import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract addresses
const CONTRACTS = {
  PAYSPAWN_SPENDER: '0x52b5192712527B3EEaA85e77b7Aef092833C0f08',
  SPEND_PERMISSION_MANAGER: '0xf85210B21cC50302F477BA56686d2019dC9b67Ad',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

// EIP-712 domain for Coinbase SpendPermissionManager
const DOMAIN = {
  name: 'Spend Permission Manager',
  version: '1',
  chainId: base.id,
  verifyingContract: CONTRACTS.SPEND_PERMISSION_MANAGER as `0x${string}`,
};

// EIP-712 types
const SPEND_PERMISSION_TYPES = {
  SpendPermission: [
    { name: 'account', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'allowance', type: 'uint160' },
    { name: 'period', type: 'uint48' },
    { name: 'start', type: 'uint48' },
    { name: 'end', type: 'uint48' },
    { name: 'salt', type: 'uint256' },
    { name: 'extraData', type: 'bytes' },
  ],
} as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Missing PRIVATE_KEY environment variable');
    console.log('\nUsage: PRIVATE_KEY=0x... npx ts-node scripts/test-flow.ts');
    process.exit(1);
  }

  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`\n🔑 Wallet: ${account.address}`);

  // Create clients
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
    address: CONTRACTS.USDC as `0x${string}`,
    abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`💰 USDC Balance: $${formatUnits(balance, 6)}`);

  if (balance < parseUnits('0.15', 6)) {
    console.error('❌ Insufficient USDC balance. Need at least $0.15 for test ($0.10 + $0.05 fee)');
    process.exit(1);
  }

  // Create spend permission
  const now = Math.floor(Date.now() / 1000);
  const oneYear = 365 * 24 * 60 * 60;
  const salt = BigInt(Math.floor(Math.random() * 1e18));

  const permission = {
    account: account.address,
    spender: CONTRACTS.PAYSPAWN_SPENDER as `0x${string}`,
    token: CONTRACTS.USDC as `0x${string}`,
    allowance: parseUnits('100', 6), // $100/day limit
    period: 86400, // Daily
    start: now,
    end: now + oneYear,
    salt,
    extraData: '0x' as `0x${string}`,
  };

  console.log('\n📝 Signing spend permission...');
  console.log(`   Daily limit: $${formatUnits(permission.allowance, 6)}`);
  console.log(`   Expires: ${new Date(permission.end * 1000).toLocaleDateString()}`);

  // Sign the permission
  const signature = await walletClient.signTypedData({
    domain: DOMAIN,
    types: SPEND_PERMISSION_TYPES,
    primaryType: 'SpendPermission',
    message: permission,
  });

  console.log('✅ Permission signed!');

  // Prepare credentials for API
  const credentials = {
    permission: {
      account: permission.account,
      spender: permission.spender,
      token: permission.token,
      allowance: permission.allowance.toString(),
      period: permission.period,
      start: permission.start,
      end: permission.end,
      salt: permission.salt.toString(),
      extraData: permission.extraData,
    },
    signature,
  };

  console.log('\n📋 Agent Credentials (save these):');
  console.log(JSON.stringify(credentials, null, 2));

  // Test payment
  const testRecipient = '0xd983B335e8590e31b460e25c4530219fE085Fa76'; // PaySpawn treasury
  const testAmount = 0.10;

  console.log(`\n💸 Testing payment: $${testAmount} to ${testRecipient}`);

  const response = await fetch('https://payspawn.ai/api/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: testRecipient,
      amount: testAmount,
      ...credentials,
    }),
  });

  const result = await response.json();

  if (result.success) {
    console.log('\n✅ Payment successful!');
    console.log(`   Recipient received: $${result.recipientReceives}`);
    console.log(`   Fee: $${result.fee}`);
    console.log(`   Total charged: $${result.totalCharged}`);
    console.log(`   TX: ${result.explorer}`);
  } else {
    console.log('\n❌ Payment failed:', result.error);
  }

  // Check remaining allowance
  console.log('\n📊 Checking permission status...');
  const checkResponse = await fetch('https://payspawn.ai/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission: credentials.permission }),
  });

  const status = await checkResponse.json();
  console.log(`   Status: ${status.status}`);
  console.log(`   Remaining: $${status.limits?.remaining || 'N/A'}`);
  console.log(`   Can spend: ${status.canSpend}`);
}

main().catch(console.error);
