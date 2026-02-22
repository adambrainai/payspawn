# PaySpawn - Product Specification

**Domain:** payspawn.ai  
**Twitter:** @payspawn  
**Tagline:** "Agent payments in one line"  
**Treasury:** `0x17E4f8FB5937f4Fd556d35b0064Cc2A01cdB96db`

## Deployed Contracts (Base Mainnet V2)
| Contract | Address |
|----------|---------|
| PaySpawnPolicy | `0xbD55962D570f4E9843F7300002781aB68F51a09B` |
| PaySpawnRouter | `0xB3Bd641350010E14Ca2f7139793F19c2A3e26683` |
| PaySpawnNames | `0xc653c91524B5D72Adb767151d30b606A727be2E4` |

---

## Executive Summary

PaySpawn is a product layer that makes AI agent payments stupidly simple. We wrap existing infrastructure (Turnkey for keys, x402 for payments, Base for settlement) into a 3-method SDK that works in 5 minutes.

**Core Value:** On-chain spending policies that are verifiable, non-custodial, and give humans control.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    PaySpawn SDK                          │
│              (TypeScript / Python)                       │
│  create() | pay() | accept() | setPolicy()              │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────┐
│                  PaySpawn API                            │
│              (Next.js API Routes)                        │
│  - Wallet provisioning (via Turnkey)                    │
│  - Transaction routing                                   │
│  - Policy management                                     │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼─────┐ ┌──────▼──────┐ ┌──────▼──────┐
│   Turnkey   │ │    Base     │ │    x402     │
│   (Keys)    │ │  (L2 Chain) │ │ (Payments)  │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## Component Specifications

### 1. Smart Contracts (Solidity/Foundry)

**Location:** `/contracts`

#### PaySpawnPolicy.sol
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PaySpawnPolicy {
    struct Policy {
        address human;           // Owner who controls the agent
        address agent;           // Agent wallet address
        uint256 dailyLimit;      // Max spend per day (in wei)
        uint256 perTxLimit;      // Max spend per transaction
        uint256 dailySpent;      // Spent today
        uint256 lastResetDay;    // Day number of last reset
        bool paused;             // Emergency stop
    }
    
    mapping(address => Policy) public policies;
    
    event PolicyCreated(address indexed agent, address indexed human);
    event PolicyUpdated(address indexed agent);
    event AgentPaused(address indexed agent);
    event AgentUnpaused(address indexed agent);
    event TransactionApproved(address indexed agent, uint256 amount);
    
    modifier onlyHuman(address agent) {
        require(msg.sender == policies[agent].human, "Not authorized");
        _;
    }
    
    function createPolicy(
        address agent,
        uint256 dailyLimit,
        uint256 perTxLimit
    ) external {
        require(policies[agent].human == address(0), "Policy exists");
        policies[agent] = Policy({
            human: msg.sender,
            agent: agent,
            dailyLimit: dailyLimit,
            perTxLimit: perTxLimit,
            dailySpent: 0,
            lastResetDay: block.timestamp / 1 days,
            paused: false
        });
        emit PolicyCreated(agent, msg.sender);
    }
    
    function validateTransaction(address agent, uint256 amount) external returns (bool) {
        Policy storage policy = policies[agent];
        require(!policy.paused, "Agent paused");
        require(amount <= policy.perTxLimit, "Exceeds per-tx limit");
        
        // Reset daily if new day
        uint256 today = block.timestamp / 1 days;
        if (today > policy.lastResetDay) {
            policy.dailySpent = 0;
            policy.lastResetDay = today;
        }
        
        require(policy.dailySpent + amount <= policy.dailyLimit, "Exceeds daily limit");
        policy.dailySpent += amount;
        
        emit TransactionApproved(agent, amount);
        return true;
    }
    
    function pause(address agent) external onlyHuman(agent) {
        policies[agent].paused = true;
        emit AgentPaused(agent);
    }
    
    function unpause(address agent) external onlyHuman(agent) {
        policies[agent].paused = false;
        emit AgentUnpaused(agent);
    }
    
    function updateLimits(
        address agent,
        uint256 newDailyLimit,
        uint256 newPerTxLimit
    ) external onlyHuman(agent) {
        policies[agent].dailyLimit = newDailyLimit;
        policies[agent].perTxLimit = newPerTxLimit;
        emit PolicyUpdated(agent);
    }
    
    function getPolicy(address agent) external view returns (Policy memory) {
        return policies[agent];
    }
}
```

#### PaySpawnRouter.sol
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PaySpawnRouter is Ownable {
    PaySpawnPolicy public policyContract;
    address public treasury;
    uint256 public feeRate = 10; // 0.1% = 10 basis points
    uint256 public constant MAX_FEE_RATE = 50; // 0.5% max
    
    event Payment(
        address indexed from,
        address indexed to,
        address token,
        uint256 amount,
        uint256 fee
    );
    
    constructor(address _policy, address _treasury) Ownable(msg.sender) {
        policyContract = PaySpawnPolicy(_policy);
        treasury = _treasury;
    }
    
    function pay(
        address token,
        address to,
        uint256 amount
    ) external {
        // Validate against policy
        require(policyContract.validateTransaction(msg.sender, amount), "Policy rejected");
        
        // Calculate fee (0.1%)
        uint256 fee = (amount * feeRate) / 10000;
        uint256 netAmount = amount - fee;
        
        // Transfer
        IERC20(token).transferFrom(msg.sender, to, netAmount);
        if (fee > 0) {
            IERC20(token).transferFrom(msg.sender, treasury, fee);
        }
        
        emit Payment(msg.sender, to, token, amount, fee);
    }
    
    function setFeeRate(uint256 newRate) external onlyOwner {
        require(newRate <= MAX_FEE_RATE, "Fee too high");
        feeRate = newRate;
    }
    
    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
    }
}
```

---

### 2. TypeScript SDK

**Location:** `/sdk/typescript`  
**Package:** `@payspawn/sdk` (npm)

#### Core API

```typescript
// src/index.ts
import { TurnkeyClient } from "@turnkey/sdk-server";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";

export interface PaySpawnConfig {
  turnkeyApiKey: string;
  turnkeyOrganizationId: string;
  rpcUrl?: string;
}

export interface AgentConfig {
  owner: `0x${string}`;        // Human owner address
  limits?: {
    daily?: number;            // Daily limit in USD
    perTx?: number;            // Per-transaction limit in USD
  };
  name?: string;               // Agent name for dashboard
}

export interface Agent {
  address: `0x${string}`;
  owner: `0x${string}`;
  limits: { daily: number; perTx: number };
  
  // Methods
  pay: (to: string, amount: number, token?: string) => Promise<string>;
  accept: (price: number) => X402Middleware;
  setPolicy: (limits: { daily?: number; perTx?: number }) => Promise<void>;
  pause: () => Promise<void>;
  unpause: () => Promise<void>;
  getBalance: (token?: string) => Promise<number>;
}

export class PaySpawn {
  private turnkey: TurnkeyClient;
  private config: PaySpawnConfig;
  
  constructor(config: PaySpawnConfig) {
    this.config = config;
    this.turnkey = new TurnkeyClient({
      apiKey: config.turnkeyApiKey,
      organizationId: config.turnkeyOrganizationId,
    });
  }
  
  /**
   * Create a new agent wallet with on-chain spending policies
   */
  async create(agentConfig: AgentConfig): Promise<Agent> {
    // 1. Create wallet via Turnkey
    const wallet = await this.turnkey.createWallet({
      walletName: agentConfig.name || `agent-${Date.now()}`,
    });
    
    // 2. Register on-chain policy
    // ... contract interaction
    
    // 3. Return agent interface
    return this.buildAgent(wallet.address, agentConfig);
  }
  
  /**
   * Load an existing agent wallet
   */
  async load(address: `0x${string}`): Promise<Agent> {
    // Fetch policy from chain and return agent interface
  }
  
  private buildAgent(address: string, config: AgentConfig): Agent {
    // Implementation
  }
}

// Export factory function for simple usage
export async function createAgent(config: AgentConfig): Promise<Agent> {
  const payspawn = new PaySpawn({
    turnkeyApiKey: process.env.PAYSPAWN_API_KEY!,
    turnkeyOrganizationId: process.env.PAYSPAWN_ORG_ID!,
  });
  return payspawn.create(config);
}

// x402 middleware for Express/Fastify
export function x402Middleware(agent: Agent, price: number) {
  return async (req: any, res: any, next: any) => {
    // Check for x402 payment header
    // Validate payment
    // Continue or return 402
  };
}
```

#### Usage Example

```typescript
import { createAgent } from '@payspawn/sdk';

// Create agent with wallet and spending limits
const agent = await createAgent({
  owner: '0x1234...', // Your wallet address
  limits: {
    daily: 100,      // $100/day max
    perTx: 10        // $10/transaction max
  }
});

// Accept payments (x402)
app.get('/api/data', agent.accept(0.05), (req, res) => {
  res.json({ data: 'premium content' });
});

// Send payments
await agent.pay('0x5678...', 5, 'USDC');

// Update limits
await agent.setPolicy({ daily: 200 });

// Emergency stop
await agent.pause();
```

---

### 3. Python SDK

**Location:** `/sdk/python`  
**Package:** `payspawn` (pip)

```python
# payspawn/__init__.py
from typing import Optional
import os

class Agent:
    def __init__(self, address: str, owner: str, limits: dict):
        self.address = address
        self.owner = owner
        self.limits = limits
    
    async def pay(self, to: str, amount: float, token: str = "USDC") -> str:
        """Send payment from agent wallet"""
        pass
    
    def accept(self, price: float):
        """Return x402 middleware decorator"""
        pass
    
    async def set_policy(self, daily: Optional[float] = None, per_tx: Optional[float] = None):
        """Update spending limits"""
        pass
    
    async def pause(self):
        """Emergency stop"""
        pass
    
    async def unpause(self):
        """Resume agent"""
        pass
    
    async def get_balance(self, token: str = "USDC") -> float:
        """Get token balance"""
        pass


async def create_agent(
    owner: str,
    limits: dict = None,
    name: str = None
) -> Agent:
    """Create a new agent wallet with on-chain spending policies"""
    limits = limits or {"daily": 100, "per_tx": 10}
    # Implementation
    pass


# Usage:
# from payspawn import create_agent
# agent = await create_agent(owner="0x...", limits={"daily": 100})
# await agent.pay("0x...", 5)
```

---

### 4. Web Application (Next.js 14)

**Location:** `/apps/web`

#### Pages

1. **Landing Page** (`/`)
   - Hero: "Agent payments in one line"
   - Code snippet demo
   - Features: On-chain policies, x402 native, Human control
   - Pricing: Free tier (100 tx/mo), Growth (0.1% fee)
   - CTA: Get Started / View Docs

2. **Dashboard** (`/dashboard`)
   - List of agents
   - Per-agent: balance, transactions, limits, pause button
   - Create new agent
   - API keys management

3. **Docs** (`/docs`)
   - Getting started
   - SDK reference
   - Smart contract reference
   - x402 integration guide

4. **Pricing** (`/pricing`)
   - Free: 100 tx/month
   - Growth: 0.1% per transaction (no monthly fee)
   - Enterprise: Custom

#### Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Shadcn/ui components
- Wagmi + Viem for wallet connection
- Prisma + PostgreSQL for dashboard data

---

### 5. API Backend

**Location:** `/apps/api` (or Next.js API routes in `/apps/web`)

#### Endpoints

```
POST /api/agents
  - Create new agent wallet
  - Body: { owner, limits, name }
  - Returns: { address, txHash }

GET /api/agents/:address
  - Get agent details
  - Returns: { address, owner, limits, balance, transactions }

PATCH /api/agents/:address/policy
  - Update spending limits
  - Body: { daily?, perTx? }

POST /api/agents/:address/pause
  - Emergency stop

POST /api/agents/:address/unpause
  - Resume agent

GET /api/agents/:address/transactions
  - Transaction history
  - Query: ?limit=50&offset=0

POST /api/x402/verify
  - Verify x402 payment for middleware
  - Body: { paymentHeader, expectedAmount }
```

---

### 6. Documentation Site

**Location:** `/docs` (can be in `/apps/web/docs` or separate)

#### Content Structure

```
docs/
├── getting-started.md
│   ├── Installation
│   ├── Quick Start (5 min tutorial)
│   └── Core Concepts
├── sdk/
│   ├── typescript.md
│   └── python.md
├── api/
│   └── reference.md
├── contracts/
│   ├── policy.md
│   └── router.md
├── guides/
│   ├── x402-integration.md
│   ├── spending-limits.md
│   └── emergency-controls.md
└── whitepaper.md
```

---

## Whitepaper / Explainer

### PaySpawn: Agent Payments in One Line

**Problem:** AI agents need wallets, but setting one up takes weeks of infrastructure work.

**Solution:** PaySpawn wraps existing infrastructure (Turnkey, x402, Base) into a 3-method SDK.

**Differentiation:** On-chain spending policies that are verifiable, non-custodial, and always under human control.

**Business Model:** 0.1% protocol fee collected on-chain via smart contract.

**Technical Architecture:**
- Keys: Turnkey (TEE-based, non-custodial)
- Payments: x402 protocol (HTTP-native)
- Settlement: Base L2 (fast, cheap)
- Policies: PaySpawnPolicy.sol (on-chain, verifiable)

**The Three Methods:**
```javascript
await createAgent({ owner, limits })  // Create wallet with policies
await agent.pay(to, amount)           // Send payment
agent.accept(price)                   // Accept x402 payment
```

---

## Environment Variables

```bash
# Turnkey
TURNKEY_API_KEY=
TURNKEY_ORGANIZATION_ID=
TURNKEY_PRIVATE_KEY=

# Blockchain
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453

# Contracts (deployed addresses)
POLICY_CONTRACT_ADDRESS=
ROUTER_CONTRACT_ADDRESS=

# API
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=

# PaySpawn
PAYSPAWN_TREASURY_ADDRESS=
```

---

## Deployment Checklist

### Phase 1: Contracts
- [ ] Deploy PaySpawnPolicy to Base Sepolia
- [ ] Deploy PaySpawnRouter to Base Sepolia
- [ ] Test with testnet USDC
- [ ] Audit contracts (self-audit + community review)
- [ ] Deploy to Base Mainnet

### Phase 2: SDK
- [ ] Build TypeScript SDK
- [ ] Build Python SDK
- [ ] Publish to npm (@payspawn/sdk)
- [ ] Publish to PyPI (payspawn)
- [ ] Write SDK tests

### Phase 3: Web
- [ ] Build landing page
- [ ] Build dashboard
- [ ] Build docs site
- [ ] Deploy to Vercel
- [ ] Connect to payspawn.ai domain

### Phase 4: Launch
- [ ] Demo video (60 seconds)
- [ ] Twitter thread announcing launch
- [ ] Product Hunt submission
- [ ] Hacker News Show HN

---

## Success Metrics

**Week 1:** 100 SDK downloads
**Month 1:** 50 agents created, 1,000 transactions
**Month 3:** 500 agents, 50,000 transactions, $50k volume
**Month 6:** 5,000 agents, 1M transactions, $1M volume

---

*Let's build this.*
