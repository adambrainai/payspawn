/**
 * PaySpawn SDK v4
 * 
 * Financial infrastructure for AI agents.
 * Supports both EOA wallets (standard wallets like MetaMask, Phantom)
 * and Smart Wallets (Coinbase Smart Wallet).
 * 
 * @example
 * ```typescript
 * import { PaySpawn } from '@payspawn/sdk';
 * 
 * const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL);
 * 
 * // Pay someone
 * await ps.pay('alice.pay', 10.00);
 * 
 * // Check balance
 * const balance = await ps.balance();
 * 
 * // Check remaining allowance
 * const remaining = await ps.remaining();
 * 
 * // Get address for receiving
 * console.log(ps.address);
 * 
 * // Wallet type detection
 * console.log(ps.walletType); // "EOA" or "SmartWallet"
 * 
 * // Pay for x402 content automatically
 * const data = await ps.fetch('https://api.example.com/premium');
 * ```
 */

// ============ Types ============

export interface SpendPermission {
  account: string;
  spender: string;
  token: string;
  allowance: string;
  period: number;
  start: number;
  end: number;
  salt: string;
  extraData: string;
}

export interface Credential {
  signature: string;
  permission: SpendPermission;
}

export interface PaymentResult {
  success: boolean;
  txHash: string;
  from: string;
  to: string;
  toName?: string;
  amount: number;
  fee: number;
  total: number;
  blockNumber: string;
  explorer: string;
}

export interface FetchResult {
  success: boolean;
  status: number;
  paid: boolean;
  payment?: {
    recipientReceives: number;
    fee: number;
    totalCharged: number;
    recipient: string;
    txHash: string;
    explorer: string;
  };
  remaining?: string;
  data: any;
}

export interface CheckResult {
  walletType: "EOA" | "SmartWallet";
  status: "active" | "pending" | "revoked" | "expired" | "not_started";
  account: string;
  spender: string;
  isApproved: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  canSpend: boolean;
  balance: {
    usdc: string;
    raw: string;
  };
  limits: {
    dailyAllowance: string;
    remaining: string;
    periodSpent: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  };
  validity: {
    start: string;
    end: string;
    periodSeconds: number;
  };
}

export interface PaySpawnConfig {
  /** Base URL for PaySpawn API (default: https://payspawn.ai) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

// ============ Constants ============

const DEFAULT_BASE_URL = 'https://payspawn.ai';
const DEFAULT_TIMEOUT = 30000;

// ============ Helpers ============

function decodeCredential(credentialString: string): Credential {
  try {
    // Handle both base64 and raw JSON
    let decoded: string;
    try {
      decoded = Buffer.from(credentialString, 'base64').toString('utf-8');
    } catch {
      decoded = credentialString;
    }
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error('Invalid credential format. Expected base64-encoded JSON.');
  }
}

// ============ Main Class ============

/**
 * PaySpawn client for AI agents.
 * 
 * Create an instance with your credential from payspawn.ai/dashboard
 */
export class PaySpawn {
  private credential: Credential;
  private credentialString: string;
  private baseUrl: string;
  private timeout: number;

  /**
   * Create a PaySpawn client.
   * 
   * @param credential - Your PaySpawn credential (base64 string from dashboard)
   * @param config - Optional configuration
   */
  constructor(credential: string, config?: PaySpawnConfig) {
    if (!credential) {
      throw new Error('Credential is required. Get one at https://payspawn.ai/dashboard');
    }
    
    this.credentialString = credential;
    this.credential = decodeCredential(credential);
    this.baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.timeout = config?.timeout || DEFAULT_TIMEOUT;
    
    // Validate credential
    this.validateCredential();
  }

  private validateCredential(): void {
    const { permission } = this.credential;
    const now = Math.floor(Date.now() / 1000);
    
    if (now > permission.end) {
      throw new Error('Credential expired. Create a new one at https://payspawn.ai/dashboard');
    }
    
    if (now < permission.start) {
      throw new Error('Credential not yet valid.');
    }
  }

  /**
   * The wallet address associated with this credential.
   * Share this address to receive payments.
   */
  get address(): string {
    return this.credential.permission.account;
  }

  /**
   * Daily spending limit in USD.
   */
  get dailyLimit(): number {
    return Number(this.credential.permission.allowance) / 1e6;
  }

  /**
   * Credential expiration date.
   */
  get expiresAt(): Date {
    return new Date(this.credential.permission.end * 1000);
  }

  /**
   * Check if credential is still valid.
   */
  get isValid(): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now >= this.credential.permission.start && now <= this.credential.permission.end;
  }

  /**
   * Wallet type: "EOA" for standard wallets (MetaMask, Phantom, etc.)
   * or "SmartWallet" for Coinbase Smart Wallet.
   *
   * EOA credentials use direct USDC.transferFrom (no SpendPermissionManager).
   * SmartWallet credentials use off-chain EIP-712 signatures via Coinbase SPM.
   */
  get walletType(): "EOA" | "SmartWallet" {
    const sig = this.credential.signature;
    return sig === "EOA" || sig === "0x" ? "EOA" : "SmartWallet";
  }

  /**
   * Whether this is an EOA (standard wallet) credential.
   */
  get isEOA(): boolean {
    return this.walletType === "EOA";
  }

  /**
   * Make a payment.
   * 
   * @param to - Recipient address, ENS name, or PaySpawn name (e.g., 'alice.pay')
   * @param amount - Amount in USD (e.g., 5.00)
   * @returns Payment result with transaction hash
   * 
   * @example
   * ```typescript
   * // Pay by address
   * await ps.pay('0x1234...', 10.00);
   * 
   * // Pay by ENS
   * await ps.pay('vitalik.eth', 5.00);
   * 
   * // Pay by PaySpawn name
   * await ps.pay('alice.pay', 25.00);
   * ```
   */
  async pay(to: string, amount: number): Promise<PaymentResult> {
    if (!to) throw new Error('Recipient (to) is required');
    if (amount <= 0) throw new Error('Amount must be greater than 0');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: this.credentialString,
          to,
          amount,
        }),
        signal: controller.signal,
      });
      
      const result = await response.json() as PaymentResult & { error?: string };
      
      if (!response.ok) {
        throw new Error(result.error || `Payment failed with status ${response.status}`);
      }
      
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get current USDC balance.
   * 
   * @returns Balance in USD as a string (e.g., "142.50")
   * 
   * @example
   * ```typescript
   * const balance = await ps.balance();
   * console.log(`Balance: $${balance}`);
   * ```
   */
  async balance(): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(
        `${this.baseUrl}/api/check?address=${this.address}`,
        { signal: controller.signal }
      );
      
      const result = await response.json() as { balance?: string; remaining?: string; error?: string };
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch balance');
      }
      
      return result.balance || '0.00';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get remaining spending allowance.
   *
   * For EOA wallets: returns remaining USDC allowance approved to PaySpawn (decreases with each payment).
   * For Smart Wallets: returns remaining allowance in the current period via SpendPermissionManager.
   *
   * @returns Remaining allowance in USD as a string (e.g., "95.50")
   *
   * @example
   * ```typescript
   * const remaining = await ps.remaining();
   * console.log(`Can still spend: $${remaining}`);
   * ```
   */
  async remaining(): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: this.credentialString }),
        signal: controller.signal,
      });

      const result = await response.json() as {
        limits?: { remaining?: string };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch remaining allowance');
      }

      return result.limits?.remaining || this.dailyLimit.toString();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Full credential status check.
   * Returns wallet type, status, balance, and remaining allowance.
   *
   * @returns Full status object
   *
   * @example
   * ```typescript
   * const status = await ps.check();
   * console.log(status.walletType); // "EOA" or "SmartWallet"
   * console.log(status.canSpend);   // true/false
   * console.log(status.limits.remaining); // "95.50"
   * ```
   */
  async check(): Promise<CheckResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: this.credentialString }),
        signal: controller.signal,
      });

      const result = await response.json() as CheckResult & { error?: string };

      if (!response.ok) {
        throw new Error(result.error || 'Failed to check credential status');
      }

      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch a URL with automatic x402 payment handling.
   * 
   * If the URL returns 402 Payment Required, PaySpawn will
   * automatically pay (within your limits) and retry.
   * 
   * @param url - The URL to fetch
   * @param options - Optional fetch options (method, headers, body)
   * @returns Fetch result with data and payment info
   * 
   * @example
   * ```typescript
   * // Simple GET
   * const result = await ps.fetch('https://api.example.com/premium-data');
   * console.log(result.data);
   * 
   * // POST with body
   * const result = await ps.fetch('https://api.example.com/generate', {
   *   method: 'POST',
   *   body: { prompt: 'Hello' }
   * });
   * ```
   */
  async fetch(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<FetchResult> {
    if (!url) throw new Error('URL is required');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/x402`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: this.credentialString,
          url,
          method: options?.method || 'GET',
          headers: options?.headers,
          body: options?.body,
        }),
        signal: controller.signal,
      });
      
      const result = await response.json() as FetchResult & { error?: string };
      
      if (!response.ok && !result.paid) {
        throw new Error(result.error || `Request failed with status ${response.status}`);
      }
      
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============ Exports ============

export default PaySpawn;
