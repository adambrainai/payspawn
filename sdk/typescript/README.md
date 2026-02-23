# @payspawn/sdk

**Wallet delegation for AI agents.** One human wallet → unlimited agent credentials. Spending limits enforced on-chain by smart contract. Math doesn't negotiate.

[![npm](https://img.shields.io/npm/v/@payspawn/sdk.svg)](https://www.npmjs.com/package/@payspawn/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @payspawn/sdk
```

## Quick Start

```typescript
import PaySpawn from '@payspawn/sdk';

const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL);

// Pay someone
await ps.pay('alice.pay', 10.00);

// Call any x402-protected API — payment handled automatically
const result = await ps.fetch('https://api.example.com/premium');

// Agent-to-agent payment with signed receipt
const payment = await ps.agent.pay('aave-agent.pay', 0.005, {
  memo: 'query:best-usdc-yield',
});

// Check balance and remaining allowance
const balance   = await ps.balance();
const remaining = await ps.remaining();
```

## Get Your Credential

1. Go to [payspawn.ai/dashboard](https://payspawn.ai/dashboard)
2. Connect your wallet
3. Set daily spending limit + optional controls (max per tx, whitelist, velocity)
4. Sign the permission — no gas needed
5. Copy your credential string

```bash
PAYSPAWN_CREDENTIAL=eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7...}
```

## Why PaySpawn

**The problem:** AI agents need wallets. If an agent holds a private key, one prompt injection or leaked env var drains everything — no limits, no stops.

**The fix:** Agents hold credentials, not keys. The V5.3 smart contract enforces spending limits on-chain. A $10/day cap means the *contract* rejects anything over $10 — not your code, not a proxy you have to trust. The math itself.

## API Reference

### `ps.pay(to, amount)`

Send USDC to any address, ENS name, or PaySpawn name.

```typescript
const result = await ps.pay('alice.pay', 10.00);
console.log(result.txHash);    // 0x...
console.log(result.explorer);  // https://basescan.org/tx/0x...
```

### `ps.fetch(url, options?)`

Call any x402-protected API. Handles the full 402 → pay on-chain → retry cycle automatically.

```typescript
const result = await ps.fetch('https://api.example.com/paid-data');

console.log(result.paid);             // true
console.log(result.payment.txHash);   // on-chain proof
console.log(result.data);             // the actual response
```

### `ps.agent.pay(to, amount, opts?)`

Agent-to-agent payment with memo and signed receipt. The receiving agent can verify payment cryptographically before executing a task.

```typescript
// Hiring agent
const payment = await ps.agent.pay('aave-agent.pay', 0.005, {
  memo: 'query:best-yield',
  webhookUrl: 'https://my-agent.com/webhook',
});

// Verify on the receiving side
const { valid } = await ps.agent.verifyReceipt(payment.receipt);
if (!valid) throw new Error('payment not verified');
// ...execute task
```

### `ps.agent.pause()` / `ps.agent.unpause()`

Instantly pause a V5 credential on-chain. All payments rejected until unpaused. V5 credentials only.

```typescript
await ps.agent.pause();    // kill switch — takes effect immediately on Base
await ps.agent.unpause();  // restore
```

### `ps.agent.verifyReceipt(receipt)`

Verify a signed receipt from another PaySpawn payment. Use on the receiving side to confirm you were actually paid.

```typescript
const { valid, reason } = await ps.agent.verifyReceipt(receipt);
```

### `ps.pool.provision(opts)`

Provision multiple agent credentials scoped to a budget pool. Each agent gets its own daily limit, all funded from one pool balance.

```typescript
const fleet = await ps.pool.provision({
  poolId: '0x...',
  count: 10,
  dailyLimitUSD: 5,
});
// fleet.agents — array of credentials, one per agent
```

### `ps.balance()` / `ps.remaining()` / `ps.check()`

```typescript
const balance   = await ps.balance();    // "142.50" USDC
const remaining = await ps.remaining();  // "9.99" remaining today
const status    = await ps.check();      // full status object
```

### Properties

| Property | Type | Description |
|---|---|---|
| `ps.address` | `string` | Wallet address (share to receive payments) |
| `ps.dailyLimit` | `number` | Daily spending limit in USD |
| `ps.walletType` | `"EOA" \| "SmartWallet"` | Credential type |
| `ps.isV5` | `boolean` | V5 credential (supports pause, whitelist, per-tx limits) |
| `ps.expiresAt` | `Date` | Credential expiration |

## V5 Controls

V5 credentials add on-chain enforcement on top of daily limits:

| Control | Description |
|---|---|
| `maxPerTx` | Max USDC per single transaction |
| `allowedTo[]` | Whitelist of allowed recipient addresses |
| `maxTxPerHour` | Velocity cap (transactions per hour) |
| `parentHash` | Delegation chain — track sub-agent hierarchy |

Set these in the [dashboard](https://payspawn.ai/dashboard) when creating a credential.

## Live Contracts (Base Mainnet)

| Contract | Address |
|---|---|
| PaySpawnSpenderV5.3 | `0xaa8e6815b0E8a3006DEe0c3171Cf9CA165fd862e` |
| PaySpawnSpenderV4 | `0x71FF87e48b3A66549FbC6A30214b11C4b4975bda` |
| PaySpawnNames | `0xc653c91524B5D72Adb767151d30b606A727be2E4` |
| BudgetPoolFactory | `0xd4bb25e6bf99f450eb9b7b41f7e158c5a5e42305` |

## x402 Integration

PaySpawn implements the [x402 protocol](https://x402.org) natively. `ps.fetch()` handles the full payment flow:

1. Agent sends request → server returns `402 Payment Required`
2. PaySpawn reads payment requirements from headers
3. V5.3 credential pays on-chain via relayer
4. Request retried with payment proof
5. Server returns protected content

Compatible with any x402-compliant API (Dexter, Coinbase Bazaar, padelmaps, etc.)

## Resources

- **Dashboard:** [payspawn.ai/dashboard](https://payspawn.ai/dashboard)
- **Docs:** [payspawn.ai/why](https://payspawn.ai/why)
- **GitHub:** [github.com/adambrainai/payspawn](https://github.com/adambrainai/payspawn)
- **X:** [@payspawn](https://x.com/payspawn)

## License

MIT
