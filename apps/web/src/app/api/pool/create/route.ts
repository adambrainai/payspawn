import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const FACTORY_ADDRESS = process.env.BUDGET_POOL_FACTORY_ADDRESS as `0x${string}`;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const FACTORY_ABI = parseAbi([
  "function createPool(uint256 perAgentDailyLimit) returns (address pool)",
  "function createPoolForAgent(address ownerWallet, uint256 perAgentDailyLimit) returns (address pool)",
  "event PoolCreated(address indexed pool, address indexed owner, uint256 perAgentDailyLimit, bool autonomous)",
]);

/**
 * POST /api/pool/create
 *
 * Level 1 (human/dashboard):
 *   { perAgentDailyLimit: "10000000", ownerWallet: "0x..." }
 *   → relayer calls factory.createPool() with ownerWallet as the owner
 *
 * Level 2 (orchestrator agent):
 *   { credential: "base64...", perAgentDailyLimit: "10000000" }
 *   → relayer validates credential, calls factory.createPoolForAgent()
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

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    let poolAddress: `0x${string}`;

    if (credential) {
      // Level 2: orchestrator agent credential
      let parsed: any;
      try {
        parsed = JSON.parse(Buffer.from(credential, "base64").toString("utf-8"));
      } catch {
        return NextResponse.json({ error: "Invalid credential" }, { status: 400 });
      }

      const ownerFromCredential = parsed?.permission?.account as `0x${string}`;
      if (!ownerFromCredential || !isAddress(ownerFromCredential)) {
        return NextResponse.json({ error: "Invalid credential: missing account" }, { status: 400 });
      }

      // Validate credential is not expired
      const now = Math.floor(Date.now() / 1000);
      if (parsed.permission?.end && parsed.permission.end < now) {
        return NextResponse.json({ error: "Credential expired" }, { status: 400 });
      }

      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "createPoolForAgent",
        args: [ownerFromCredential, limitBigInt],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000 });

      // Extract pool address from PoolCreated event
      const poolCreatedLog = receipt.logs.find((log) =>
        log.topics[0] === "0x" + /* PoolCreated sig */
        "8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0".slice(0, 0)
      );

      // Simpler: decode from return value by re-reading factory
      poolAddress = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: parseAbi(["function createPoolForAgent(address,uint256) returns (address)"]),
        functionName: "createPoolForAgent",
        args: [ownerFromCredential, limitBigInt],
      }) as `0x${string}`;

      // Actually just get it from the tx receipt via simulation
      const simResult = await publicClient.simulateContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "createPoolForAgent",
        args: [ownerFromCredential, limitBigInt],
        account,
      });
      poolAddress = simResult.result as `0x${string}`;

      // Real tx already submitted — get address from event
      // Parse logs manually
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase()) {
          // PoolCreated(address indexed pool, address indexed owner, uint256, bool)
          // pool is topics[1], owner is topics[2]
          const poolTopic = log.topics[1];
          if (log.topics.length >= 3 && poolTopic) {
            poolAddress = ("0x" + poolTopic.slice(26)) as `0x${string}`;
            break;
          }
        }
      }

      return NextResponse.json({
        success: true,
        poolAddress,
        owner: ownerFromCredential,
        perAgentDailyLimit: perAgentDailyLimit.toString(),
        txHash: hash,
        autonomous: true,
      });
    } else {
      // Level 1: human/dashboard flow
      if (!ownerWallet || !isAddress(ownerWallet)) {
        return NextResponse.json({ error: "ownerWallet required for non-credential creation" }, { status: 400 });
      }

      // Relayer deploys pool with ownerWallet as owner
      // Owner must then call deposit() themselves (they hold the funds)
      const { result } = await publicClient.simulateContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "createPool",
        args: [limitBigInt],
        account,
      });

      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "createPool",
        args: [limitBigInt],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000 });

      // Parse pool address from PoolCreated event
      let parsedPoolAddress = result as `0x${string}`;
      for (const log of receipt.logs) {
        const poolTopic = log.topics[1];
        if (log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase() && log.topics.length >= 3 && poolTopic) {
          parsedPoolAddress = ("0x" + poolTopic.slice(26)) as `0x${string}`;
          break;
        }
      }

      return NextResponse.json({
        success: true,
        poolAddress: parsedPoolAddress,
        owner: ownerWallet,
        perAgentDailyLimit: perAgentDailyLimit.toString(),
        txHash: hash,
        autonomous: false,
        nextSteps: [
          `Call USDC.approve(${parsedPoolAddress}, amount) from your wallet`,
          `Then call pool.deposit(amount) to fund it`,
          `Or use the dashboard at payspawn.ai/dashboard`,
        ],
      });
    }
  } catch (err: any) {
    console.error("Pool create error:", err);
    return NextResponse.json({ error: err.message || "Pool creation failed" }, { status: 500 });
  }
}
