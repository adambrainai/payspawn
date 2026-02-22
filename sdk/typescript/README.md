# @payspawn/sdk

Financial infrastructure for AI agents. Pay, receive, and transact with USDC on Base.

## Installation

```bash
npm install @payspawn/sdk
```

## Quick Start

```typescript
import { PaySpawn } from '@payspawn/sdk';

// Initialize with your credential from payspawn.ai/dashboard
const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL);

// Pay someone
await ps.pay('alice.pay', 10.00);        // by PaySpawn name
await ps.pay('vitalik.eth', 5.00);       // by ENS
await ps.pay('0x1234...', 25.00);        // by address

// Check balance
const balance = await ps.balance();       // "142.50"

// Get your address (to receive payments)
console.log(ps.address);                  // "0x..."

// Pay for x402 content automatically
const data = await ps.fetch('https://api.example.com/premium');
```

## Getting Your Credential

1. Go to [payspawn.ai/dashboard](https://payspawn.ai/dashboard)
2. Connect your wallet (or create one with Face ID)
3. Set your daily spending limit
4. Sign the permission (no gas needed)
5. Copy your credential string

Store it as an environment variable:
```bash
PAYSPAWN_CREDENTIAL=eyJzaWduYXR1cmUiOiIweC4uLiIsInBlcm1pc3Npb24iOnsifX0=
```

## API Reference

### Constructor

```typescript
const ps = new PaySpawn(credential: string, config?: {
  baseUrl?: string;  // default: 'https://payspawn.ai'
  timeout?: number;  // default: 30000 (30s)
});
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `address` | `string` | Your wallet address (for receiving payments) |
| `dailyLimit` | `number` | Your daily spending limit in USD |
| `expiresAt` | `Date` | When your credential expires |
| `isValid` | `boolean` | Whether credential is still valid |

### Methods

#### `pay(to, amount)`

Make a payment.

```typescript
const result = await ps.pay('alice.pay', 10.00);
// {
//   success: true,
//   txHash: '0x...',
//   from: '0x...',
//   to: '0x...',
//   amount: 10.00,
//   fee: 0.01,
//   explorer: 'https://basescan.org/tx/0x...'
// }
```

**Parameters:**
- `to` - Recipient address, ENS name, or PaySpawn name (alice.pay)
- `amount` - Amount in USD (e.g., 5.00)

#### `balance()`

Get your current USDC balance.

```typescript
const balance = await ps.balance();  // "142.50"
```

#### `remaining()`

Get remaining daily allowance.

```typescript
const remaining = await ps.remaining();  // "90.00"
```

#### `fetch(url, options?)`

Fetch a URL with automatic x402 payment handling.

```typescript
// If the URL returns 402, PaySpawn pays automatically
const result = await ps.fetch('https://api.example.com/premium');
// {
//   success: true,
//   paid: true,
//   payment: { amount: 0.01, txHash: '0x...' },
//   data: { ... }
// }
```

**Parameters:**
- `url` - The URL to fetch
- `options` - Optional: `{ method, headers, body }`

## Security

Your credential is a **session key**, not your private key:
- It only works with PaySpawn
- It has built-in spending limits
- It can be revoked anytime
- If stolen, damage is capped to your daily limit

**Best practices:**
- Store credentials in environment variables or secrets managers
- Never commit credentials to git
- Use the lowest daily limit that works for your use case

## Fees

- **Free** — zero protocol fees
- We cover gas — agents just need USDC
- We cover gas — you just need USDC

## Links

- [Dashboard](https://payspawn.ai/dashboard)
- [Documentation](https://payspawn.ai/docs)
- [GitHub](https://github.com/adambrainai/payspawn)

## License

MIT
