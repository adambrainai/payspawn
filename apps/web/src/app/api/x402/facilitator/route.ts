import { NextResponse } from "next/server";

/**
 * x402 Facilitator Info Endpoint
 * 
 * Provides information about the PaySpawn x402 facilitator capabilities.
 * Resource servers can use this to discover supported schemes and networks.
 */

export async function GET() {
  return NextResponse.json({
    facilitator: "PaySpawn",
    version: "1.0.0",
    description: "Non-custodial x402 facilitator with on-chain spending limits",
    
    // Supported schemes
    schemes: [
      {
        name: "payspawn",
        description: "PaySpawn API key authentication with router-based settlement",
        payloadFields: ["from", "apiKey"],
      },
      {
        name: "exact",
        description: "Standard x402 exact scheme (via PaySpawn router)",
        payloadFields: ["from", "apiKey"],
      },
    ],
    
    // Supported networks
    networks: [
      {
        name: "base",
        chainId: 8453,
        aliases: ["base-mainnet", "8453"],
      },
    ],
    
    // Supported assets
    assets: [
      {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913",
        decimals: 6,
        network: "base",
      },
    ],
    
    // Facilitator endpoints
    endpoints: {
      verify: "https://payspawn.ai/api/x402/verify",
      settle: "https://payspawn.ai/api/x402/settle",
      info: "https://payspawn.ai/api/x402/facilitator",
    },
    
    // Contracts
    contracts: {
      router: "0x0977EA4af7E4e3282cf03Bb0cCae02624ABb6fdC",
      policy: "0xbD55962D570f4E9843F7300002781aB68F51a09B",
      names: "0xc653c91524B5D72Adb767151d30b606A727be2E4",
    },
    
    // Fees
    fees: {
      percentage: 0.001,
      minimum: 0.05,
      currency: "USD",
      paidBy: "payer",
      gasIncluded: true,
    },
    
    // Features
    features: [
      "non-custodial",
      "on-chain-limits",
      "daily-spending-caps",
      "per-transaction-limits",
      "kill-switch",
      "human-readable-names",
      "ens-support",
      "basename-support",
    ],
    
    // Documentation
    docs: "https://payspawn.ai/docs",
    
    // How to integrate
    integration: {
      forResourceServers: {
        step1: "Return 402 with PaySpawn payment requirements",
        step2: "Client sends payment payload with PaySpawn API key",
        step3: "POST to /api/x402/verify to validate",
        step4: "Fulfill request",
        step5: "POST to /api/x402/settle to execute payment",
        example: {
          paymentRequirements: {
            scheme: "payspawn",
            network: "base",
            maxAmountRequired: "1000000",
            payTo: "0xYourWallet",
            resource: "https://your-api.com/premium",
            description: "Premium API access",
            facilitator: "https://payspawn.ai/api/x402",
          },
        },
      },
      forClients: {
        step1: "Get PaySpawn API key from dashboard",
        step2: "When receiving 402, check if facilitator is PaySpawn",
        step3: "Build payment payload with your API key",
        step4: "Retry request with X-Payment header",
        example: {
          paymentPayload: {
            scheme: "payspawn",
            network: "base",
            payload: {
              from: "0xYourWallet",
              apiKey: "ps_...",
            },
          },
        },
      },
    },
  });
}
