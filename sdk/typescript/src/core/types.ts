/**
 * Core types for PaySpawn SDK
 */

import type { Address, Hash, Hex } from 'viem';

// ============ Agent Configuration ============

/**
 * Configuration for creating an agent
 */
export interface CreateAgentConfig {
  /** Human owner address - has ultimate control */
  owner: Address;
  
  /** Spending limits */
  limits?: AgentLimits;
  
  /** Optional name for the agent */
  name?: string;
  
  /** Register on ERC-8004 identity registry */
  identity?: boolean | ERC8004Config;
  
  /** Custom RPC URL */
  rpcUrl?: string;
}

/**
 * Agent spending limits
 */
export interface AgentLimits {
  /** Maximum USD per day */
  daily?: number;
  
  /** Maximum USD per transaction */
  perTx?: number;
  
  /** Maximum USD per week */
  weekly?: number;
  
  /** Maximum USD total (lifetime) */
  total?: number;
  
  /** When limits expire (default: 1 year) */
  expiresAt?: Date;
}

/**
 * ERC-8004 identity configuration
 */
export interface ERC8004Config {
  /** Agent name */
  name: string;
  
  /** Agent description */
  description?: string;
  
  /** Agent image URL */
  image?: string;
  
  /** Service endpoints */
  services?: ERC8004Service[];
}

/**
 * ERC-8004 service endpoint
 */
export interface ERC8004Service {
  name: string;
  endpoint: string;
  version?: string;
}

// ============ Agent Interface ============

/**
 * The main Agent interface - what developers work with
 */
export interface Agent {
  /** Agent's wallet address */
  address: Address;
  
  /** Human owner's address */
  owner: Address;
  
  /** Current limits */
  limits: AgentLimits;
  
  /** Agent name (if set) */
  name?: string;
  
  /** ERC-8004 agent ID (if registered) */
  identityId?: bigint;
  
  // ============ Payments ============
  
  /**
   * Pay a recipient
   * @param to - Recipient address or .eth/.pay name
   * @param amount - Amount in USD
   * @returns Transaction hash
   */
  pay(to: string, amount: number): Promise<Hash>;
  
  /**
   * Make an x402 request (auto-handles 402 Payment Required)
   * @param url - API endpoint
   * @param options - Fetch options
   */
  fetch(url: string, options?: RequestInit): Promise<Response>;
  
  /**
   * Check if agent can spend an amount
   */
  canSpend(amount: number): Promise<CanSpendResult>;
  
  /**
   * Get remaining daily allowance
   */
  getRemainingDaily(): Promise<number>;
  
  /**
   * Get USDC balance
   */
  getBalance(): Promise<number>;
  
  // ============ Control ============
  
  /**
   * Pause agent (emergency stop)
   * Only callable by owner
   */
  pause(): Promise<Hash>;
  
  /**
   * Resume agent after pause
   * Only callable by owner
   */
  resume(): Promise<Hash>;
  
  /**
   * Update spending limits
   * Only callable by owner
   */
  setLimits(limits: Partial<AgentLimits>): Promise<Hash>;
  
  /**
   * Drain all funds back to owner
   * Only callable by owner
   */
  drain(): Promise<Hash>;
  
  /**
   * Revoke agent's permission entirely
   * Only callable by owner
   */
  revoke(): Promise<Hash>;
  
  // ============ Info ============
  
  /**
   * Get agent info
   */
  getInfo(): Promise<AgentInfo>;
  
  /**
   * Get transaction history
   */
  getHistory(options?: { limit?: number }): Promise<Transaction[]>;
  
  /**
   * Export agent credentials (for storage)
   */
  export(): AgentCredentials;
  
  // ============ Funding ============
  
  /**
   * Get funding info (address, network, token)
   */
  getFunding(): FundingInfo;
  
  /**
   * Get QR code URL for funding
   * @param amount - Optional amount to encode
   */
  getFundingQR(amount?: number): string;
  
  /**
   * Get text-based funding info (for CLI)
   */
  getFundingText(): string;
  
  /**
   * Get Coinbase app deep link
   */
  getCoinbaseLink(amount?: number): string;
  
  /**
   * Get MetaMask deep link
   */
  getMetaMaskLink(amount?: number): string;
  
  /**
   * Get generic wallet deep link (EIP-681)
   */
  getWalletLink(amount?: number): string;
  
  /**
   * Get fiat onramp URL (buy with credit card)
   * @param config - Onramp configuration
   */
  getOnrampUrl(config?: OnrampConfig): string;
  
  /**
   * Get all funding options
   * @param amount - Optional amount
   */
  getAllFundingOptions(amount?: number): AllFundingOptions;
}

/**
 * Funding info for display
 */
export interface FundingInfo {
  address: Address;
  network: string;
  chainId: number;
  token: string;
  tokenAddress: Address;
  recommendedMinimum: number;
  explorerUrl: string;
}

/**
 * Onramp configuration
 */
export interface OnrampConfig {
  amount?: number;
  provider?: 'coinbase' | 'moonpay' | 'transak' | 'ramp';
  redirectUrl?: string;
  email?: string;
}

/**
 * All funding options
 */
export interface AllFundingOptions {
  info: FundingInfo;
  qrCodeUrl: string;
  links: {
    coinbase: string;
    metamask: string;
    generic: string;
  };
  onramps: {
    coinbase: string;
    moonpay: string;
    transak: string;
    ramp: string;
  };
}

/**
 * Result of canSpend check
 */
export interface CanSpendResult {
  canSpend: boolean;
  reason?: string;
  remaining: number;
  fee: number;
  total: number;
}

/**
 * Agent info
 */
export interface AgentInfo {
  address: Address;
  owner: Address;
  name?: string;
  balance: number;
  limits: AgentLimits;
  spent: {
    today: number;
    thisWeek: number;
    total: number;
  };
  paused: boolean;
  identityId?: bigint;
}

/**
 * Transaction record
 */
export interface Transaction {
  hash: Hash;
  from: Address;
  to: Address;
  amount: number;
  fee: number;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

/**
 * Agent credentials for export/import
 */
export interface AgentCredentials {
  address: Address;
  owner: Address;
  permission: SpendPermission;
  sessionKey?: Hex;
  name?: string;
  identityId?: bigint;
}

// ============ Spend Permission ============

/**
 * Coinbase Spend Permission
 */
export interface SpendPermission {
  account: Address;
  spender: Address;
  token: Address;
  allowance: bigint;
  period: number;
  start: number;
  end: number;
  salt: bigint;
  extraData: Hex;
}

/**
 * Signed spend permission
 */
export interface SignedSpendPermission extends SpendPermission {
  signature: Hex;
}

// ============ x402 ============

/**
 * x402 payment requirements (from 402 response)
 */
export interface X402PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  mimeType?: string;
  outputSchema?: unknown;
  payTo: Address;
  maxTimeSeconds?: number;
  extra?: Record<string, unknown>;
}

/**
 * x402 payment payload (sent with request)
 */
export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
  };
}

// ============ Errors ============

export class PaySpawnError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PaySpawnError';
  }
}

export class InsufficientFundsError extends PaySpawnError {
  constructor(required: number, available: number) {
    super(
      `Insufficient funds: need ${required}, have ${available}`,
      'INSUFFICIENT_FUNDS',
      { required, available }
    );
  }
}

export class LimitExceededError extends PaySpawnError {
  constructor(amount: number, limit: number, limitType: string) {
    super(
      `${limitType} limit exceeded: ${amount} > ${limit}`,
      'LIMIT_EXCEEDED',
      { amount, limit, limitType }
    );
  }
}

export class AgentPausedError extends PaySpawnError {
  constructor() {
    super('Agent is paused', 'AGENT_PAUSED');
  }
}

export class PermissionDeniedError extends PaySpawnError {
  constructor(action: string) {
    super(`Permission denied: ${action}`, 'PERMISSION_DENIED', { action });
  }
}
