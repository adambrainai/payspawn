# PaySpawn

**Financial infrastructure for AI agents.** Give your agent a wallet, spending limits, and let it transact autonomously.

## What is PaySpawn?

PaySpawn is "Venmo for AI agents." It's an npm package that lets AI agents:
- **Spend** USDC (up to human-set daily limits)
- **Receive** payments from other agents or users
- **Transact** via address, ENS name, or PaySpawn username
- **Pay for x402 content** automatically

## How It Works

1. **Human** creates a wallet on [payspawn.ai](https://payspawn.ai) and sets spending limits
2. **Human** gets a credential string and gives it to their agent
3. **Agent** uses the credential to transact autonomously

```typescript
import { PaySpawn } from '@payspawn/sdk'

const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL)

// Pay someone
await ps.pay("alice.pay", 10.00)

// Check balance
const balance = await ps.balance() // "142.50"

// Get your address (to receive payments)
const myAddress = ps.address // "0x..."

// Pay for web content (x402)
const data = await ps.fetch("https://api.example.com/premium")
```

## Security Model

**Non-custodial. We store nothing sensitive.**

- Your wallet keys stay with you (or in Coinbase's secure infrastructure)
- The credential is a signed "spend permission" - it authorizes spending up to your limits
- We never see your private keys
- You can revoke the credential anytime from the dashboard
- If our servers are compromised, your funds are safe

## For Normies

Don't have a crypto wallet? No problem.

1. Visit [payspawn.ai](https://payspawn.ai)
2. Create a wallet with Face ID / fingerprint (no seed phrase!)
3. Fund it with a credit card
4. Generate a credential for your agent
5. Done

## For Developers

### Installation

```bash
npm install @payspawn/sdk
```

### Quick Start

```typescript
import { PaySpawn } from '@payspawn/sdk'

// Initialize with your credential
const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL)

// Make payments
await ps.pay("0x1234...", 5.00)        // By address
await ps.pay("vitalik.eth", 5.00)       // By ENS
await ps.pay("bob.pay", 5.00)      // By PaySpawn name

// Check your wallet
console.log(ps.address)                 // Your wallet address
console.log(await ps.balance())         // Your USDC balance

// Pay for HTTP resources (x402 protocol)
const response = await ps.fetch("https://api.example.com/paid-endpoint")
```

### Credential Format

The credential is a base64-encoded spend permission. Your agent stores it like any other secret (environment variable, secrets manager, etc.).

```bash
# In your agent's environment
PAYSPAWN_CREDENTIAL=eyJzaWduYXR1cmUiOiIweC4uLiIsImFjY291bnQiOi...
```

The credential:
- Has a daily spending limit (set by you)
- Expires after a set time (set by you)
- Can be revoked anytime
- Resets its allowance each day

## Technical Details

- **Chain:** Base (Ethereum L2)
- **Token:** USDC
- **Wallet:** Coinbase Smart Wallet (with spend permissions)
- **Protocol:** EIP-712 signed spend permissions

## Fees

- Zero protocol fees
- We cover gas — agents just need USDC
- Whichever is higher

## Links

- **Dashboard:** [payspawn.ai](https://payspawn.ai)
- **Docs:** [payspawn.ai/docs](https://payspawn.ai/docs)
- **x402 Protocol:** [x402.org](https://x402.org)

## License

MIT
