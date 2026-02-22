/**
 * x402 Client - HTTP-native payments
 * 
 * Automatically handles 402 Payment Required responses
 */

import type { Address } from 'viem';
import type { X402PaymentRequirements, SpendPermission } from '../core/types';
import { calculateFee, getCurrentPeriod } from '../wallets/smart-wallet';
import { PaySpawnError, InsufficientFundsError } from '../core/types';

// ============ Types ============

export interface X402ClientConfig {
  /** The spend permission for payments */
  permission: SpendPermission;
  
  /** Function to execute payments */
  executePayment: (to: Address, amount: number) => Promise<string>;
  
  /** Maximum amount to auto-pay (default: perTx limit) */
  maxAutoPay?: number;
  
  /** Custom RPC URL */
  rpcUrl?: string;
}

export interface X402FetchOptions extends RequestInit {
  /** Skip automatic payment (will throw on 402) */
  skipPayment?: boolean;
  
  /** Maximum amount willing to pay for this request */
  maxPayment?: number;
}

// ============ x402 Client ============

export class X402Client {
  private config: X402ClientConfig;
  
  constructor(config: X402ClientConfig) {
    this.config = config;
  }
  
  /**
   * Make an x402-aware fetch request
   * Automatically handles 402 Payment Required
   */
  async fetch(url: string, options: X402FetchOptions = {}): Promise<Response> {
    const { skipPayment, maxPayment, ...fetchOptions } = options;
    
    // Make initial request
    const response = await fetch(url, fetchOptions);
    
    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }
    
    // If skipping payment, throw
    if (skipPayment) {
      throw new PaySpawnError(
        'Payment required but skipPayment is true',
        'PAYMENT_REQUIRED',
        { url }
      );
    }
    
    // Parse payment requirements
    const requirements = await this.parsePaymentRequirements(response);
    
    if (!requirements) {
      throw new PaySpawnError(
        'Could not parse payment requirements from 402 response',
        'INVALID_402_RESPONSE',
        { url }
      );
    }
    
    // Check amount limits
    const amount = this.parseAmount(requirements.maxAmountRequired);
    const effectiveMax = maxPayment ?? this.config.maxAutoPay ?? 10;
    
    if (amount > effectiveMax) {
      throw new PaySpawnError(
        `Payment amount ${amount} exceeds maximum ${effectiveMax}`,
        'PAYMENT_TOO_LARGE',
        { amount, max: effectiveMax }
      );
    }
    
    // Check remaining allowance
    const period = await getCurrentPeriod(this.config.permission, this.config.rpcUrl);
    const { total } = await calculateFee(amount, this.config.rpcUrl);
    
    if (total > period.remaining) {
      throw new InsufficientFundsError(total, period.remaining);
    }
    
    // Execute payment
    const txHash = await this.config.executePayment(
      requirements.payTo as Address,
      amount
    );
    
    // Retry request with payment proof
    const retryResponse = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        'X-PAYMENT': txHash,
        'X-PAYMENT-RESPONSE': JSON.stringify({
          network: 'base',
          txHash,
          amount: amount.toString(),
        }),
      },
    });
    
    return retryResponse;
  }
  
  /**
   * Parse payment requirements from 402 response
   */
  private async parsePaymentRequirements(
    response: Response
  ): Promise<X402PaymentRequirements | null> {
    // Try header first (x402 standard)
    const headerValue = response.headers.get('X-PAYMENT-REQUIRED') 
      || response.headers.get('PAYMENT-REQUIRED');
    
    if (headerValue) {
      try {
        // Header is base64 encoded JSON
        const decoded = atob(headerValue);
        return JSON.parse(decoded);
      } catch {
        // Try direct JSON parse
        try {
          return JSON.parse(headerValue);
        } catch {
          // Continue to body parsing
        }
      }
    }
    
    // Try response body
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const body = await response.json() as Record<string, unknown>;
        
        // Handle different x402 response formats
        if (body.paymentRequirements) {
          return body.paymentRequirements as X402PaymentRequirements;
        }
        
        if (body.accepts && Array.isArray(body.accepts)) {
          // Multiple payment options - pick first USDC on Base
          const accepts = body.accepts as X402PaymentRequirements[];
          const usdcOption = accepts.find(
            (a) => a.network === 'base' && a.scheme === 'exact'
          ) || accepts[0];
          
          return usdcOption;
        }
        
        // Direct requirements in body
        if (body.payTo && body.maxAmountRequired) {
          return body as unknown as X402PaymentRequirements;
        }
      }
    } catch {
      // Ignore body parsing errors
    }
    
    return null;
  }
  
  /**
   * Parse amount from string (handles various formats)
   */
  private parseAmount(amountStr: string): number {
    // Remove any currency symbols or whitespace
    const cleaned = amountStr.replace(/[^0-9.]/g, '');
    const amount = parseFloat(cleaned);
    
    if (isNaN(amount)) {
      throw new PaySpawnError(
        `Invalid amount: ${amountStr}`,
        'INVALID_AMOUNT',
        { amountStr }
      );
    }
    
    return amount;
  }
}

// ============ Standalone Functions ============

/**
 * Check if a response is a 402 Payment Required
 */
export function isPaymentRequired(response: Response): boolean {
  return response.status === 402;
}

/**
 * Extract payment requirements from a 402 response
 */
export async function extractPaymentRequirements(
  response: Response
): Promise<X402PaymentRequirements | null> {
  const client = new X402Client({
    permission: {} as SpendPermission,
    executePayment: async () => '',
  });
  
  // @ts-expect-error - accessing private method for utility
  return client.parsePaymentRequirements(response);
}
