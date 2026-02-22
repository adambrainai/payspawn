/**
 * Coinbase Smart Wallet utilities
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Hash,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

import {
  CONTRACTS,
  CHAIN_CONFIG,
  PERIODS,
  FEES,
  DEFAULT_LIMITS,
  SPEND_PERMISSION_MANAGER_ABI,
  PAYSPAWN_SPENDER_ABI,
  ERC20_ABI,
  SMART_WALLET_FACTORY_ABI,
} from '../core/constants';

import type {
  SpendPermission,
  AgentLimits,
} from '../core/types';

// ============ Public Client ============

export function createBaseClient(rpcUrl?: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl ?? CHAIN_CONFIG.rpcUrl),
  });
}

// ============ Wallet Creation ============

/**
 * Predict the address of a Coinbase Smart Wallet before deployment
 */
export async function predictWalletAddress(
  owner: Address,
  nonce: bigint = 0n,
  rpcUrl?: string
): Promise<Address> {
  const client = createBaseClient(rpcUrl);
  
  // Encode owner as bytes (for Coinbase Smart Wallet)
  const ownerBytes = encodeAbiParameters(
    [{ type: 'address' }],
    [owner]
  );
  
  const address = await client.readContract({
    address: CONTRACTS.SMART_WALLET_FACTORY,
    abi: SMART_WALLET_FACTORY_ABI,
    functionName: 'getAddress',
    args: [[ownerBytes], nonce],
  });
  
  return address;
}

/**
 * Check if a Coinbase Smart Wallet is already deployed
 */
export async function isWalletDeployed(
  address: Address,
  rpcUrl?: string
): Promise<boolean> {
  const client = createBaseClient(rpcUrl);
  const code = await client.getCode({ address });
  return code !== undefined && code !== '0x';
}

// ============ Spend Permission ============

/**
 * Create a spend permission object
 */
export function createSpendPermission(config: {
  account: Address;
  limits: AgentLimits;
  spender?: Address;
}): SpendPermission {
  const now = Math.floor(Date.now() / 1000);
  
  // Use daily limit as the period allowance
  const dailyLimit = config.limits.daily ?? DEFAULT_LIMITS.daily;
  const allowance = parseUnits(dailyLimit.toString(), FEES.USDC_DECIMALS);
  
  // Expiration
  const expiresAt = config.limits.expiresAt
    ? Math.floor(config.limits.expiresAt.getTime() / 1000)
    : now + DEFAULT_LIMITS.expirationDays * PERIODS.DAILY;
  
  return {
    account: config.account,
    spender: config.spender ?? CONTRACTS.PAYSPAWN_SPENDER,
    token: CONTRACTS.USDC,
    allowance,
    period: PERIODS.DAILY,
    start: now,
    end: expiresAt,
    salt: BigInt(Math.floor(Math.random() * 1e18)),
    extraData: '0x' as Hex,
  };
}

/**
 * Hash a spend permission for signing (EIP-712)
 */
export function hashSpendPermission(permission: SpendPermission): Hex {
  const SPEND_PERMISSION_TYPEHASH = keccak256(
    new TextEncoder().encode(
      'SpendPermission(address account,address spender,address token,uint160 allowance,uint48 period,uint48 start,uint48 end,uint256 salt,bytes extraData)'
    )
  );
  
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint160' },
      { type: 'uint48' },
      { type: 'uint48' },
      { type: 'uint48' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      SPEND_PERMISSION_TYPEHASH,
      permission.account,
      permission.spender,
      permission.token,
      permission.allowance,
      permission.period,
      permission.start,
      permission.end,
      permission.salt,
      keccak256(permission.extraData),
    ]
  );
  
  return keccak256(encoded);
}

/**
 * Serialize a permission for storage
 */
export function serializePermission(permission: SpendPermission): string {
  return JSON.stringify({
    ...permission,
    allowance: permission.allowance.toString(),
    salt: permission.salt.toString(),
  });
}

/**
 * Deserialize a permission from storage
 */
export function deserializePermission(json: string): SpendPermission {
  const obj = JSON.parse(json);
  return {
    ...obj,
    allowance: BigInt(obj.allowance),
    salt: BigInt(obj.salt),
  };
}

// ============ Contract Interactions ============

/**
 * Check if a permission is valid
 */
export async function isPermissionValid(
  permission: SpendPermission,
  rpcUrl?: string
): Promise<boolean> {
  const client = createBaseClient(rpcUrl);
  
  return client.readContract({
    address: CONTRACTS.PAYSPAWN_SPENDER,
    abi: PAYSPAWN_SPENDER_ABI,
    functionName: 'isPermissionValid',
    args: [permission],
  });
}

/**
 * Get current period spend info
 */
export async function getCurrentPeriod(
  permission: SpendPermission,
  rpcUrl?: string
): Promise<{
  start: number;
  end: number;
  spent: number;
  remaining: number;
}> {
  const client = createBaseClient(rpcUrl);
  
  const result = await client.readContract({
    address: CONTRACTS.SPEND_PERMISSION_MANAGER,
    abi: SPEND_PERMISSION_MANAGER_ABI,
    functionName: 'getCurrentPeriod',
    args: [permission],
  });
  
  const spent = Number(formatUnits(BigInt(result.spend), FEES.USDC_DECIMALS));
  const allowance = Number(formatUnits(permission.allowance, FEES.USDC_DECIMALS));
  
  return {
    start: Number(result.start),
    end: Number(result.end),
    spent,
    remaining: Math.max(0, allowance - spent),
  };
}

/**
 * Calculate fee for an amount
 */
export async function calculateFee(
  amount: number,
  rpcUrl?: string
): Promise<{ fee: number; total: number }> {
  const client = createBaseClient(rpcUrl);
  const amountWei = parseUnits(amount.toString(), FEES.USDC_DECIMALS);
  
  const [feeWei, totalWei] = await Promise.all([
    client.readContract({
      address: CONTRACTS.PAYSPAWN_SPENDER,
      abi: PAYSPAWN_SPENDER_ABI,
      functionName: 'calculateFee',
      args: [amountWei],
    }),
    client.readContract({
      address: CONTRACTS.PAYSPAWN_SPENDER,
      abi: PAYSPAWN_SPENDER_ABI,
      functionName: 'calculateTotal',
      args: [amountWei],
    }),
  ]);
  
  return {
    fee: Number(formatUnits(feeWei, FEES.USDC_DECIMALS)),
    total: Number(formatUnits(totalWei, FEES.USDC_DECIMALS)),
  };
}

/**
 * Get USDC balance
 */
export async function getBalance(
  address: Address,
  rpcUrl?: string
): Promise<number> {
  const client = createBaseClient(rpcUrl);
  
  const balance = await client.readContract({
    address: CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  
  return Number(formatUnits(balance, FEES.USDC_DECIMALS));
}

/**
 * Execute a payment
 */
export async function executePayment(
  permission: SpendPermission,
  to: Address,
  amount: number,
  executorKey: Hex,
  signature?: Hex,
  rpcUrl?: string
): Promise<Hash> {
  const account = privateKeyToAccount(executorKey);
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl ?? CHAIN_CONFIG.rpcUrl),
  });
  
  const amountWei = parseUnits(amount.toString(), FEES.USDC_DECIMALS);
  
  let data: Hex;
  
  if (signature) {
    // First-time approval + pay
    data = encodeFunctionData({
      abi: PAYSPAWN_SPENDER_ABI,
      functionName: 'approveAndPay',
      args: [permission, signature, to, amountWei],
    });
  } else {
    // Already approved, just pay
    data = encodeFunctionData({
      abi: PAYSPAWN_SPENDER_ABI,
      functionName: 'pay',
      args: [permission, to, amountWei],
    });
  }
  
  const hash = await client.sendTransaction({
    to: CONTRACTS.PAYSPAWN_SPENDER,
    data,
    chain: base,
  });
  
  return hash;
}

/**
 * Revoke a permission
 */
export async function revokePermission(
  permission: SpendPermission,
  ownerKey: Hex,
  rpcUrl?: string
): Promise<Hash> {
  const account = privateKeyToAccount(ownerKey);
  const client = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl ?? CHAIN_CONFIG.rpcUrl),
  });
  
  const data = encodeFunctionData({
    abi: SPEND_PERMISSION_MANAGER_ABI,
    functionName: 'revoke',
    args: [permission],
  });
  
  const hash = await client.sendTransaction({
    to: CONTRACTS.SPEND_PERMISSION_MANAGER,
    data,
    chain: base,
  });
  
  return hash;
}
