/**
 * Funding utilities for agent wallets
 * 
 * Includes QR codes, deep links, and fiat onramps
 */

import type { Address } from 'viem';
import { CONTRACTS, CHAIN_CONFIG } from '../core/constants';

// ============ Types ============

export interface FundingInfo {
  /** Agent wallet address */
  address: Address;
  /** Network name */
  network: string;
  /** Chain ID */
  chainId: number;
  /** Token symbol */
  token: string;
  /** Token contract address */
  tokenAddress: Address;
  /** Recommended minimum balance */
  recommendedMinimum: number;
  /** Block explorer link */
  explorerUrl: string;
}

export interface OnrampConfig {
  /** Amount in USD */
  amount?: number;
  /** Onramp provider */
  provider?: 'coinbase' | 'moonpay' | 'transak' | 'ramp';
  /** Redirect URL after completion */
  redirectUrl?: string;
  /** User's email (pre-fill) */
  email?: string;
  /** MoonPay API key (get from moonpay.com/dashboard) */
  moonpayApiKey?: string;
  /** Transak API key (get from transak.com/dashboard) */
  transakApiKey?: string;
}

export interface QRCodeOptions {
  /** Size in pixels */
  size?: number;
  /** Error correction level */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Include amount in QR */
  amount?: number;
}

// ============ Funding Info ============

/**
 * Get funding info for a wallet
 */
export function getFundingInfo(address: Address): FundingInfo {
  return {
    address,
    network: CHAIN_CONFIG.name,
    chainId: CHAIN_CONFIG.chainId,
    token: 'USDC',
    tokenAddress: CONTRACTS.USDC,
    recommendedMinimum: 10, // $10 to start
    explorerUrl: `${CHAIN_CONFIG.blockExplorer}/address/${address}`,
  };
}

// ============ QR Code ============

/**
 * Generate a QR code URL for funding
 * Returns a URL to a QR code image (use in img src)
 */
export function getFundingQR(
  address: Address,
  options: QRCodeOptions = {}
): string {
  const { size = 256, amount } = options;
  
  // Create the payment URI
  let uri = `ethereum:${address}@${CHAIN_CONFIG.chainId}`;
  
  // If amount specified, add USDC transfer data
  if (amount) {
    const amountWei = Math.floor(amount * 1e6); // USDC has 6 decimals
    uri = `ethereum:${CONTRACTS.USDC}@${CHAIN_CONFIG.chainId}/transfer?address=${address}&uint256=${amountWei}`;
  }
  
  // Use a public QR code API (simple, no deps)
  // In production, use a library like 'qrcode' for offline generation
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(uri)}`;
}

/**
 * Get the payment URI for QR code generation
 * Use this with a QR library like 'qrcode' for offline generation
 */
export function getFundingURI(
  address: Address,
  amount?: number
): string {
  if (amount) {
    const amountWei = Math.floor(amount * 1e6);
    return `ethereum:${CONTRACTS.USDC}@${CHAIN_CONFIG.chainId}/transfer?address=${address}&uint256=${amountWei}`;
  }
  return `ethereum:${address}@${CHAIN_CONFIG.chainId}`;
}

/**
 * Get a simple text-based QR representation (for CLI)
 */
export function getFundingQRText(address: Address): string {
  return `
┌─────────────────────────────────────┐
│                                     │
│   Fund your agent with USDC (Base)  │
│                                     │
│   Address:                          │
│   ${address.slice(0, 21)}           │
│   ${address.slice(21)}              │
│                                     │
│   Network: Base (Chain ID: 8453)    │
│   Token: USDC                       │
│                                     │
└─────────────────────────────────────┘

Scan in Coinbase, MetaMask, or any wallet app.
`;
}

// ============ Deep Links ============

/**
 * Get Coinbase app deep link
 */
export function getCoinbaseLink(address: Address, amount?: number): string {
  const params = new URLSearchParams({
    address,
    chainId: CHAIN_CONFIG.chainId.toString(),
    asset: 'USDC',
  });
  
  if (amount) {
    params.set('amount', amount.toString());
  }
  
  return `https://go.cb-w.com/send?${params.toString()}`;
}

/**
 * Get MetaMask deep link (EIP-681)
 */
export function getMetaMaskLink(address: Address, amount?: number): string {
  if (amount) {
    const amountWei = Math.floor(amount * 1e6);
    return `https://metamask.app.link/send/${CONTRACTS.USDC}@${CHAIN_CONFIG.chainId}/transfer?address=${address}&uint256=${amountWei}`;
  }
  
  return `https://metamask.app.link/send/${address}@${CHAIN_CONFIG.chainId}`;
}

/**
 * Get generic wallet deep link (EIP-681)
 */
export function getWalletLink(address: Address, amount?: number): string {
  if (amount) {
    const amountWei = Math.floor(amount * 1e6);
    return `ethereum:${CONTRACTS.USDC}@${CHAIN_CONFIG.chainId}/transfer?address=${address}&uint256=${amountWei}`;
  }
  
  return `ethereum:${address}@${CHAIN_CONFIG.chainId}`;
}

// ============ Fiat Onramps ============

/**
 * Get Coinbase Onramp URL (buy crypto with card)
 * 
 * @see https://docs.cdp.coinbase.com/onramp/docs/getting-started
 */
export function getCoinbaseOnrampUrl(
  address: Address,
  config: OnrampConfig = {}
): string {
  const { amount, redirectUrl, email } = config;
  
  const params = new URLSearchParams({
    appId: 'payspawn', // Register at Coinbase Developer Platform
    destinationWallets: JSON.stringify([{
      address,
      assets: ['USDC'],
      supportedNetworks: ['base'],
    }]),
  });
  
  if (amount) {
    params.set('presetFiatAmount', amount.toString());
    params.set('fiatCurrency', 'USD');
  }
  
  if (redirectUrl) {
    params.set('redirectUrl', redirectUrl);
  }
  
  if (email) {
    params.set('defaultExperience', 'buy');
  }
  
  return `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
}

/**
 * Get MoonPay onramp URL
 * 
 * @see https://docs.moonpay.com/
 */
export function getMoonPayUrl(
  address: Address,
  config: OnrampConfig = {}
): string {
  const { amount, redirectUrl, email } = config;
  
  const params = new URLSearchParams({
    apiKey: config.moonpayApiKey || 'YOUR_MOONPAY_API_KEY', // Get from moonpay.com/dashboard
    currencyCode: 'usdc_base',
    walletAddress: address,
  });
  
  if (amount) {
    params.set('baseCurrencyAmount', amount.toString());
    params.set('baseCurrencyCode', 'usd');
  }
  
  if (redirectUrl) {
    params.set('redirectURL', redirectUrl);
  }
  
  if (email) {
    params.set('email', email);
  }
  
  return `https://buy.moonpay.com?${params.toString()}`;
}

/**
 * Get Transak onramp URL
 * 
 * @see https://docs.transak.com/
 */
export function getTransakUrl(
  address: Address,
  config: OnrampConfig = {}
): string {
  const { amount, redirectUrl, email } = config;
  
  const params = new URLSearchParams({
    apiKey: config.transakApiKey || 'YOUR_TRANSAK_API_KEY', // Get from transak.com/dashboard
    cryptoCurrencyCode: 'USDC',
    network: 'base',
    walletAddress: address,
    disableWalletAddressForm: 'true',
  });
  
  if (amount) {
    params.set('fiatAmount', amount.toString());
    params.set('fiatCurrency', 'USD');
  }
  
  if (redirectUrl) {
    params.set('redirectURL', redirectUrl);
  }
  
  if (email) {
    params.set('email', email);
  }
  
  return `https://global.transak.com?${params.toString()}`;
}

/**
 * Get onramp URL for specified provider
 */
export function getOnrampUrl(
  address: Address,
  config: OnrampConfig = {}
): string {
  const provider = config.provider ?? 'coinbase';
  
  switch (provider) {
    case 'coinbase':
      return getCoinbaseOnrampUrl(address, config);
    case 'moonpay':
      return getMoonPayUrl(address, config);
    case 'transak':
      return getTransakUrl(address, config);
    case 'ramp':
      // Ramp Network
      const params = new URLSearchParams({
        hostAppName: 'PaySpawn',
        hostLogoUrl: 'https://payspawn.ai/logo.png',
        swapAsset: 'BASE_USDC',
        userAddress: address,
      });
      if (config.amount) {
        params.set('fiatValue', config.amount.toString());
        params.set('fiatCurrency', 'USD');
      }
      return `https://app.ramp.network?${params.toString()}`;
    default:
      return getCoinbaseOnrampUrl(address, config);
  }
}

// ============ All Funding Options ============

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
 * Get all funding options for a wallet
 */
export function getAllFundingOptions(
  address: Address,
  amount?: number
): AllFundingOptions {
  return {
    info: getFundingInfo(address),
    qrCodeUrl: getFundingQR(address, { amount }),
    links: {
      coinbase: getCoinbaseLink(address, amount),
      metamask: getMetaMaskLink(address, amount),
      generic: getWalletLink(address, amount),
    },
    onramps: {
      coinbase: getOnrampUrl(address, { amount, provider: 'coinbase' }),
      moonpay: getOnrampUrl(address, { amount, provider: 'moonpay' }),
      transak: getOnrampUrl(address, { amount, provider: 'transak' }),
      ramp: getOnrampUrl(address, { amount, provider: 'ramp' }),
    },
  };
}
