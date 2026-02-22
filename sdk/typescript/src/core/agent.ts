/**
 * Agent - The main interface developers work with
 */

import type { Address, Hash, Hex } from 'viem';

import type {
  Agent,
  AgentLimits,
  AgentInfo,
  AgentCredentials,
  CanSpendResult,
  Transaction,
  SpendPermission,
  CreateAgentConfig,
  FundingInfo,
  OnrampConfig,
  AllFundingOptions,
} from './types';

import {
  PaySpawnError,
  AgentPausedError,
} from './types';

import { DEFAULT_LIMITS } from './constants';

import {
  isPermissionValid,
  getCurrentPeriod,
  calculateFee,
  getBalance,
  executePayment,
  deserializePermission,
} from '../wallets/smart-wallet';

import { X402Client, type X402FetchOptions } from '../x402/client';
import {
  getFundingInfo,
  getFundingQR,
  getFundingQRText,
  getCoinbaseLink,
  getMetaMaskLink,
  getWalletLink,
  getOnrampUrl,
  getAllFundingOptions,
} from '../utils/funding';

// ============ Agent Implementation ============

export class PaySpawnAgent implements Agent {
  readonly address: Address;
  readonly owner: Address;
  readonly limits: AgentLimits;
  readonly name?: string;
  readonly identityId?: bigint;
  
  private permission: SpendPermission;
  private sessionKey?: Hex;
  private rpcUrl?: string;
  private x402Client: X402Client;
  private paused: boolean = false;
  
  constructor(config: {
    address: Address;
    owner: Address;
    permission: SpendPermission;
    limits: AgentLimits;
    sessionKey?: Hex;
    name?: string;
    identityId?: bigint;
    rpcUrl?: string;
  }) {
    this.address = config.address;
    this.owner = config.owner;
    this.permission = config.permission;
    this.limits = config.limits;
    this.sessionKey = config.sessionKey;
    this.name = config.name;
    this.identityId = config.identityId;
    this.rpcUrl = config.rpcUrl;
    
    // Initialize x402 client
    this.x402Client = new X402Client({
      permission: this.permission,
      executePayment: async (to, amount) => {
        const hash = await this.pay(to, amount);
        return hash;
      },
      maxAutoPay: config.limits.perTx ?? DEFAULT_LIMITS.perTx,
      rpcUrl: config.rpcUrl,
    });
  }
  
  // ============ Payments ============
  
  async pay(to: string, amount: number): Promise<Hash> {
    // Check if paused
    if (this.paused) {
      throw new AgentPausedError();
    }
    
    // Resolve address (could be ENS, .pay name, or raw address)
    const toAddress = await this.resolveAddress(to);
    
    // Check limits
    const canSpendResult = await this.canSpend(amount);
    if (!canSpendResult.canSpend) {
      throw new PaySpawnError(
        canSpendResult.reason ?? 'Cannot spend this amount',
        'CANNOT_SPEND',
        canSpendResult
      );
    }
    
    // Execute payment
    if (!this.sessionKey) {
      throw new PaySpawnError(
        'No session key available for payment execution',
        'NO_SESSION_KEY'
      );
    }
    
    const hash = await executePayment(
      this.permission,
      toAddress,
      amount,
      this.sessionKey,
      undefined, // signature not needed after first approval
      this.rpcUrl
    );
    
    return hash;
  }
  
  async fetch(url: string, options?: X402FetchOptions): Promise<Response> {
    if (this.paused) {
      throw new AgentPausedError();
    }
    
    return this.x402Client.fetch(url, options);
  }
  
  async canSpend(amount: number): Promise<CanSpendResult> {
    // Check permission is valid
    const valid = await isPermissionValid(this.permission, this.rpcUrl);
    if (!valid) {
      return {
        canSpend: false,
        reason: 'Permission is not valid or has been revoked',
        remaining: 0,
        fee: 0,
        total: amount,
      };
    }
    
    // Check per-tx limit
    if (this.limits.perTx && amount > this.limits.perTx) {
      return {
        canSpend: false,
        reason: `Amount ${amount} exceeds per-transaction limit ${this.limits.perTx}`,
        remaining: 0,
        fee: 0,
        total: amount,
      };
    }
    
    // Check remaining daily allowance
    const period = await getCurrentPeriod(this.permission, this.rpcUrl);
    const { fee, total } = await calculateFee(amount, this.rpcUrl);
    
    if (total > period.remaining) {
      return {
        canSpend: false,
        reason: `Total ${total} exceeds remaining daily allowance ${period.remaining}`,
        remaining: period.remaining,
        fee,
        total,
      };
    }
    
    // Check wallet balance
    const balance = await getBalance(this.address, this.rpcUrl);
    if (total > balance) {
      return {
        canSpend: false,
        reason: `Total ${total} exceeds wallet balance ${balance}`,
        remaining: period.remaining,
        fee,
        total,
      };
    }
    
    return {
      canSpend: true,
      remaining: period.remaining,
      fee,
      total,
    };
  }
  
  async getRemainingDaily(): Promise<number> {
    const period = await getCurrentPeriod(this.permission, this.rpcUrl);
    return period.remaining;
  }
  
  async getBalance(): Promise<number> {
    return getBalance(this.address, this.rpcUrl);
  }
  
  // ============ Control ============
  
  async pause(): Promise<Hash> {
    // In a full implementation, this would call a contract method
    // For now, we just set the local flag
    this.paused = true;
    
    // Return a mock hash (would be real tx hash in production)
    return '0x' + '0'.repeat(64) as Hash;
  }
  
  async resume(): Promise<Hash> {
    this.paused = false;
    return '0x' + '0'.repeat(64) as Hash;
  }
  
  async setLimits(limits: Partial<AgentLimits>): Promise<Hash> {
    // In a full implementation, this would create a new permission
    // and atomically revoke the old one
    Object.assign(this.limits, limits);
    return '0x' + '0'.repeat(64) as Hash;
  }
  
  async drain(): Promise<Hash> {
    // Transfer all funds to owner
    const balance = await this.getBalance();
    if (balance > 0) {
      return this.pay(this.owner, balance);
    }
    return '0x' + '0'.repeat(64) as Hash;
  }
  
  async revoke(): Promise<Hash> {
    // Revoke the spend permission
    if (!this.sessionKey) {
      throw new PaySpawnError(
        'No session key available for revocation',
        'NO_SESSION_KEY'
      );
    }
    
    // In production, this would call revokePermission
    // For now, mark as paused
    this.paused = true;
    return '0x' + '0'.repeat(64) as Hash;
  }
  
  // ============ Info ============
  
  async getInfo(): Promise<AgentInfo> {
    const [balance, period] = await Promise.all([
      this.getBalance(),
      getCurrentPeriod(this.permission, this.rpcUrl),
    ]);
    
    return {
      address: this.address,
      owner: this.owner,
      name: this.name,
      balance,
      limits: this.limits,
      spent: {
        today: period.spent,
        thisWeek: period.spent, // Simplified
        total: period.spent, // Simplified
      },
      paused: this.paused,
      identityId: this.identityId,
    };
  }
  
  async getHistory(_options?: { limit?: number }): Promise<Transaction[]> {
    // In production, this would query on-chain events
    // For now, return empty array
    return [];
  }
  
  export(): AgentCredentials {
    return {
      address: this.address,
      owner: this.owner,
      permission: this.permission,
      sessionKey: this.sessionKey,
      name: this.name,
      identityId: this.identityId,
    };
  }
  
  // ============ Funding ============
  
  getFunding(): FundingInfo {
    return getFundingInfo(this.address);
  }
  
  getFundingQR(amount?: number): string {
    return getFundingQR(this.address, { amount });
  }
  
  getFundingText(): string {
    return getFundingQRText(this.address);
  }
  
  getCoinbaseLink(amount?: number): string {
    return getCoinbaseLink(this.address, amount);
  }
  
  getMetaMaskLink(amount?: number): string {
    return getMetaMaskLink(this.address, amount);
  }
  
  getWalletLink(amount?: number): string {
    return getWalletLink(this.address, amount);
  }
  
  getOnrampUrl(config?: OnrampConfig): string {
    return getOnrampUrl(this.address, config);
  }
  
  getAllFundingOptions(amount?: number): AllFundingOptions {
    return getAllFundingOptions(this.address, amount);
  }
  
  // ============ Private ============
  
  private async resolveAddress(addressOrName: string): Promise<Address> {
    // If already an address, return as-is
    if (addressOrName.startsWith('0x') && addressOrName.length === 42) {
      return addressOrName as Address;
    }
    
    // Handle .eth names (would use ENS in production)
    if (addressOrName.endsWith('.eth')) {
      // TODO: Implement ENS resolution
      throw new PaySpawnError(
        'ENS resolution not yet implemented',
        'NOT_IMPLEMENTED',
        { name: addressOrName }
      );
    }
    
    // Handle .pay names (would use PaySpawn names contract)
    if (addressOrName.endsWith('.pay')) {
      // TODO: Implement .pay name resolution
      throw new PaySpawnError(
        '.pay name resolution not yet implemented',
        'NOT_IMPLEMENTED',
        { name: addressOrName }
      );
    }
    
    throw new PaySpawnError(
      `Invalid address or name: ${addressOrName}`,
      'INVALID_ADDRESS',
      { addressOrName }
    );
  }
}

// ============ Factory Functions ============

/**
 * Create a new agent with a wallet and spend permission
 */
export async function createAgent(_config: CreateAgentConfig): Promise<Agent> {
  // For now, we need the human to provide a wallet address
  // In the full implementation, we'd create one via Coinbase Smart Wallet
  throw new PaySpawnError(
    'Agent creation requires wallet setup - use importAgent() for now',
    'NOT_IMPLEMENTED'
  );
}

/**
 * Import an existing agent from credentials
 */
export function importAgent(credentials: AgentCredentials, rpcUrl?: string): Agent {
  return new PaySpawnAgent({
    address: credentials.address,
    owner: credentials.owner,
    permission: credentials.permission,
    limits: {
      daily: Number(credentials.permission.allowance) / 1e6,
    },
    sessionKey: credentials.sessionKey,
    name: credentials.name,
    identityId: credentials.identityId,
    rpcUrl,
  });
}

/**
 * Import an agent from serialized JSON
 */
export function importAgentFromJSON(json: string, sessionKey: Hex, rpcUrl?: string): Agent {
  const data = JSON.parse(json);
  const permission = deserializePermission(data.permission);
  
  return new PaySpawnAgent({
    address: data.address,
    owner: data.owner,
    permission,
    limits: {
      daily: Number(permission.allowance) / 1e6,
    },
    sessionKey,
    name: data.name,
    identityId: data.identityId ? BigInt(data.identityId) : undefined,
    rpcUrl,
  });
}
