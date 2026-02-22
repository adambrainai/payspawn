/**
 * x402 Protocol Utilities
 * Handles parsing x402 payment requirements and building payment proofs
 */

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  mimeType?: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  asset?: string;
  extra?: Record<string, unknown>;
}

export interface X402Response {
  paymentRequirements: PaymentRequirement[];
  error?: string;
}

/**
 * Parse the PAYMENT-REQUIRED header from a 402 response
 * The header contains a base64-encoded JSON object
 */
export function parsePaymentRequired(header: string): X402Response | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    
    // Handle both array and object formats
    if (Array.isArray(parsed)) {
      return { paymentRequirements: parsed };
    }
    
    if (parsed.paymentRequirements) {
      return parsed as X402Response;
    }
    
    // Single requirement
    return { paymentRequirements: [parsed] };
  } catch (e) {
    console.error('Failed to parse PAYMENT-REQUIRED header:', e);
    return null;
  }
}

/**
 * Find a payment requirement we can fulfill
 * Currently supports: exact scheme on base network with USDC
 */
export function findCompatibleRequirement(
  requirements: PaymentRequirement[]
): PaymentRequirement | null {
  // Look for exact scheme on Base with USDC
  const compatible = requirements.find(req => {
    const isExactScheme = req.scheme === 'exact';
    const isBaseNetwork = req.network === 'base' || req.network === 'base-mainnet' || req.network === '8453';
    const isUSDC = !req.asset || 
      req.asset.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ||
      req.asset.toLowerCase() === 'usdc';
    
    return isExactScheme && isBaseNetwork && isUSDC;
  });
  
  return compatible || null;
}

/**
 * Build the PAYMENT-SIGNATURE header for an x402 request
 * This is a simplified version - full x402 uses EIP-712 signatures
 * We use a PaySpawn-specific proof format that includes the tx hash
 */
export function buildPaymentProof(params: {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  network: string;
}): string {
  const proof = {
    scheme: 'exact',
    network: params.network,
    payload: {
      signature: '', // Not used in PaySpawn flow
      authorization: {
        from: params.from,
        to: params.to,
        value: params.amount,
        validAfter: '0',
        validBefore: Math.floor(Date.now() / 1000 + 3600).toString(),
        nonce: '0',
      },
    },
    // PaySpawn extension: include tx hash for direct verification
    x_payspawn: {
      txHash: params.txHash,
      verified: true,
    },
  };
  
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

/**
 * Extract price in USD from payment requirement
 * x402 amounts are typically in wei (for USDC, 6 decimals)
 */
export function extractPriceUSD(requirement: PaymentRequirement): number {
  const amountWei = BigInt(requirement.maxAmountRequired);
  // USDC has 6 decimals
  return Number(amountWei) / 1_000_000;
}

/**
 * Common x402 header names
 */
export const X402_HEADERS = {
  PAYMENT_REQUIRED: 'x-payment-required',
  PAYMENT_REQUIRED_ALT: 'payment-required', 
  PAYMENT: 'x-payment',
  PAYMENT_ALT: 'payment-signature',
  RECEIPT: 'x-payment-receipt',
} as const;

/**
 * PaySpawn Facilitator URL
 */
export const PAYSPAWN_FACILITATOR = 'https://payspawn.ai/api/x402';

/**
 * Generate PaySpawn payment requirements for a 402 response
 * Resource servers can use this to create proper x402 headers
 */
export function generatePaymentRequirements(params: {
  payTo: string;
  amountUSD: number;
  resource: string;
  description?: string;
}): PaymentRequirement {
  // Convert USD to USDC wei (6 decimals)
  const amountWei = BigInt(Math.round(params.amountUSD * 1_000_000));
  
  return {
    scheme: 'payspawn',
    network: 'base',
    maxAmountRequired: amountWei.toString(),
    resource: params.resource,
    description: params.description || `Payment for ${params.resource}`,
    payTo: params.payTo,
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    extra: {
      facilitator: PAYSPAWN_FACILITATOR,
      facilitatorVerify: `${PAYSPAWN_FACILITATOR}/verify`,
      facilitatorSettle: `${PAYSPAWN_FACILITATOR}/settle`,
    },
  };
}

/**
 * Encode payment requirements as a base64 header value
 */
export function encodePaymentRequired(requirements: PaymentRequirement | PaymentRequirement[]): string {
  const data = Array.isArray(requirements) 
    ? { paymentRequirements: requirements }
    : { paymentRequirements: [requirements] };
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Create a 402 response with PaySpawn payment requirements
 * For use in Next.js API routes
 */
export function create402Response(params: {
  payTo: string;
  amountUSD: number;
  resource: string;
  description?: string;
  body?: object;
}): Response {
  const requirements = generatePaymentRequirements(params);
  const encoded = encodePaymentRequired(requirements);
  
  return new Response(
    JSON.stringify({
      error: 'Payment Required',
      price: params.amountUSD,
      currency: 'USD',
      payTo: params.payTo,
      facilitator: PAYSPAWN_FACILITATOR,
      ...params.body,
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        [X402_HEADERS.PAYMENT_REQUIRED]: encoded,
        'X-Facilitator': PAYSPAWN_FACILITATOR,
      },
    }
  );
}
