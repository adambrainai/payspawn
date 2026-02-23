import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const FACTORY_ADDRESS = (process.env.BUDGET_POOL_FACTORY_ADDRESS || "").trim() as `0x${string}`;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const FACTORY_ABI = parseAbi([
  "function createPool(uint256 perAgentDailyLimit) returns (address pool)",
  "function createPoolForAgent(address ownerWallet, uint256 perAgentDailyLimit) returns (address pool)",
  "event PoolCreated(address indexed pool, address indexed owner, uint256 perAgentDailyLimit, bool autonomous)",
]);

/** Parse pool address from PoolCreated event logs */
function parsePoolAddress(
  receipt: { logs: Array<{ address: string; topics: string[] }> },
  fallback: `0x${string}`
): `0x${string}` {
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase() &&
      log.topics.length >= 2 &&
      log.topics[1]
    ) {
      // PoolCreated(address indexed pool, ...) — pool is topics[1]
      return ("0x" + log.topics[1].slice(26)) as `0x${string}`;
    }
  }
  return fallback;
}

/**
 * POST /api/pool/create
 *
 * Level 1 (human/dashboard):
 *   { perAgentDailyLimit: "10000000", ownerWallet: "0x..." }
 *   → relayer calls factory.createPoolForAgent(ownerWallet, limit)
 *     → pool owned by human wallet
 *
 * Level 2 (orchestrator agent):
 *   { credential: "base64...", perAgentDailyLimit: "10000000" }
 *   → relayer validates credential, calls factory.createPoolForAgent(account, limit)
 */
export async function POST(req: NextRequest) {
  try {
    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json({ error: "Relayer not configured" }, { status: 500 });
    }
    if (!FACTORY_ADDRESS || !isAddress(FACTORY_ADDRESS)) {
      return NextResponse.json({ error: "Factory not deployed yet — set BUDGET_POOL_FACTORY_ADDRESS" }, { status: 500 });
    }

    const body = await req.json();
    const { perAgentDailyLimit, ownerWallet, credential } = body;

    if (!perAgentDailyLimit) {
      return NextResponse.json({ error: "perAgentDailyLimit required" }, { status: 400 });
    }

    const limitBigInt = BigInt(perAgentDailyLimit);
    const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);

    const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });
    const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

    // Resolve owner wallet — from request param OR from credential
    let resolvedOwner: `0x${string}` | undefined;
    if (ownerWallet && isAddress(ownerWallet)) {
      resolvedOwner = ownerWallet as `0x${string}`;
    } else if (credential) {
      try {
        const parsed = JSON.parse(Buffer.from(credential, "base64").toString("utf-8"));
        const acct = parsed?.permission?.account;
        if (acct && isAddress(acct)) {
          resolvedOwner = acct as `0x${string}`;
        }
        // Validate not expired
        const now = Math.floor(Date.now() / 1000);
        if (parsed?.permission?.end && parsed.permission.end < now) {
          return NextResponse.json({ error: "Credential expired" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid credential" }, { status: 400 });
      }
    }

    if (!resolvedOwner || !isAddress(resolvedOwner)) {
      return NextResponse.json({ error: "ownerWallet or valid credential required" }, { status: 400 });
    }

    const isAutonomous = !ownerWallet || !isAddress(ownerWallet);

    // Simulate to get the pool address before submitting the real tx
    const { result: predictedPoolAddress } = await publicClient.simulateContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createPoolForAgent",
      args: [resolvedOwner, limitBigInt],
      account,
    });

    // Submit real tx — relayer calls createPoolForAgent which sets resolvedOwner as pool owner
    const hash = await walletClient.writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createPoolForAgent",
      args: [resolvedOwner, limitBigInt],
    });

    let poolAddress: `0x${string}` = predictedPoolAddress as `0x${string}`;
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000 });
      poolAddress = parsePoolAddress(receipt, poolAddress);
    } catch {
      // Timeout — tx submitted, use predicted address
    }

    return NextResponse.json({
      success: true,
      poolAddress,
      owner: resolvedOwner,
      perAgentDailyLimit: perAgentDailyLimit.toString(),
      perAgentDailyLimitUSD: (Number(perAgentDailyLimit) / 1e6).toFixed(2),
      txHash: hash,
      autonomous: isAutonomous,
      nextSteps: isAutonomous
        ? ["Fund the pool via USDC.approve(poolAddress, amount) + pool.deposit(amount)"]
        : [
            `Call USDC.approve(${poolAddress}, amount) from your wallet (${resolvedOwner})`,
            `Then call pool.deposit(amount) to fund it`,
            `Or use the dashboard at payspawn.ai/dashboard`,
          ],
      explorerUrl: `https://basescan.org/tx/${hash}`,
    });
  } catch (err: any) {
    console.error("Pool create error:", err);
    return NextResponse.json({ error: err.message || "Pool creation failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/pool/create",
    description: "Create a PaySpawn Budget Pool for agent fleet spending",
    body: {
      perAgentDailyLimit: "Daily limit per agent in USDC (6 decimals, e.g. 10000000 = $10)",
      ownerWallet: "Your wallet address (Level 1 / human)",
      credential: "Agent credential (Level 2 / autonomous pool creation)",
    },
  });
}
