import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi, isAddress, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
const RELAYER_ADDRESS      = "0xd983B335e8590e31b460e25c4530219fE085Fa76" as `0x${string}`;
const BASE_RPC_URL         = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const USDC_ADDRESS         = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
const SPENDER_V4           = "0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" as `0x${string}`;

const POOL_ABI = parseAbi([
  "function addAgent(bytes32 credentialHash) external",
  "function addAgentsBatch(bytes32[] calldata credentialHashes) external",
  "function registeredAgents(bytes32) view returns (bool)",
]);

function computeCredentialHash(permission: any): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address,address,address,uint160,uint48,uint48,uint48,uint256,bytes"),
      [
        permission.account as `0x${string}`,
        permission.spender as `0x${string}`,
        permission.token   as `0x${string}`,
        BigInt(permission.allowance),
        Number(permission.period),
        Number(permission.start),
        Number(permission.end),
        BigInt(permission.salt),
        permission.extraData as `0x${string}`,
      ]
    )
  );
}

function makePoolCredential(opts: {
  poolAddress: `0x${string}`;
  ownerWallet: `0x${string}`;
  dailyLimitUsdc: number;
  durationDays?: number;
  salt?: bigint;
}): { credential: string; credentialHash: `0x${string}` } {
  const now   = Math.floor(Date.now() / 1000);
  const end   = now + (opts.durationDays ?? 365) * 86400;
  const salt  = opts.salt ?? BigInt(Math.floor(Math.random() * 1e18));

  const permission = {
    account:   opts.ownerWallet,           // pool owner wallet (for context)
    spender:   RELAYER_ADDRESS,
    token:     USDC_ADDRESS,
    allowance: String(opts.dailyLimitUsdc), // per-agent daily limit in USDC (6 dec)
    period:    "86400",
    start:     String(now),
    end:       String(end),
    salt:      salt.toString(),
    extraData: "0x",
  };

  const credentialHash = computeCredentialHash(permission);

  const credentialObj = {
    signature: "POOL",
    poolId:    opts.poolAddress,           // signals pool-based payment to /api/pool/pay
    permission,
  };

  return {
    credential: Buffer.from(JSON.stringify(credentialObj)).toString("base64"),
    credentialHash,
  };
}

/**
 * POST /api/fleet/provision
 *
 * Provision one or more agent credentials scoped to a budget pool.
 * The relayer registers each credential hash on-chain in the pool contract.
 *
 * Body:
 * {
 *   poolId: "0x...",              // deployed PaySpawnBudgetPool address
 *   ownerCredential: "base64...", // credential that proves you own this pool (or just ownerWallet)
 *   ownerWallet: "0x...",         // alternative to ownerCredential for Level 1 (dashboard)
 *   count: 5,                     // number of agent credentials to create (default: 1)
 *   dailyLimitUsdc: 10000000,     // per-agent daily limit in USDC (6 dec) = $10.00
 *   durationDays: 365,            // credential validity (default: 365 days)
 *   labels: ["agent-1", ...]      // optional labels for each agent
 * }
 *
 * Returns:
 * {
 *   agents: [{ label, credential, credentialHash, dailyLimitUSD, expiresAt }],
 *   poolId,
 *   txHash,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json({ error: "Relayer not configured" }, { status: 500 });
    }

    const body = await req.json();
    const {
      poolId,
      ownerWallet,
      ownerCredential,
      count = 1,
      agentCount: agentCountAlias = undefined,
      dailyLimitUsdc,
      durationDays = 365,
      labels = [],
      agentNames = [],
    } = body;

    // Validate pool address
    if (!poolId || !isAddress(poolId)) {
      return NextResponse.json({ error: "Valid poolId required" }, { status: 400 });
    }

    if (!dailyLimitUsdc || Number(dailyLimitUsdc) <= 0) {
      return NextResponse.json({ error: "dailyLimitUsdc required (e.g. 10000000 = $10)" }, { status: 400 });
    }

    // Derive owner wallet
    let resolvedOwner: `0x${string}` | undefined;
    if (ownerWallet && isAddress(ownerWallet)) {
      resolvedOwner = ownerWallet as `0x${string}`;
    } else if (ownerCredential) {
      try {
        const parsed = JSON.parse(Buffer.from(ownerCredential, "base64").toString("utf-8"));
        resolvedOwner = parsed?.permission?.account as `0x${string}`;
      } catch {
        return NextResponse.json({ error: "Invalid ownerCredential" }, { status: 400 });
      }
    }

    if (!resolvedOwner || !isAddress(resolvedOwner)) {
      return NextResponse.json({ error: "ownerWallet or ownerCredential required" }, { status: 400 });
    }

    const agentCount = Math.min(Number(agentCountAlias ?? count), 100); // max 100 agents per call

    // Generate credentials
    const agents: Array<{
      label: string;
      credential: string;
      credentialHash: `0x${string}`;
      dailyLimitUSD: string;
      expiresAt: number;
    }> = [];
    const credentialHashes: `0x${string}`[] = [];

    for (let i = 0; i < agentCount; i++) {
      const { credential, credentialHash } = makePoolCredential({
        poolAddress:    poolId as `0x${string}`,
        ownerWallet:    resolvedOwner,
        dailyLimitUsdc: Number(dailyLimitUsdc),
        durationDays,
        salt:           BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
      });

      const now = Math.floor(Date.now() / 1000);
      agents.push({
        label:          labels[i] || agentNames[i] || `agent-${i + 1}`,
        credential,
        credentialHash,
        dailyLimitUSD:  (Number(dailyLimitUsdc) / 1e6).toFixed(2),
        expiresAt:      now + durationDays * 86400,
      });
      credentialHashes.push(credentialHash);
    }

    // Register all credential hashes on-chain in one batch tx
    const relayerAccount = privateKeyToAccount(RELAYER_PRIVATE_KEY);
    const walletClient   = createWalletClient({ account: relayerAccount, chain: base, transport: http(BASE_RPC_URL) });
    const publicClient   = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

    const hash = await walletClient.writeContract({
      address: poolId as `0x${string}`,
      abi:     POOL_ABI,
      functionName: credentialHashes.length === 1 ? "addAgent" : "addAgentsBatch",
      args:    credentialHashes.length === 1 ? [credentialHashes[0]] : [credentialHashes],
    });

    // Wait with timeout
    try {
      await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000 });
    } catch {
      // Timeout — tx submitted, will confirm on-chain
    }

    return NextResponse.json({
      success:   true,
      poolId,
      owner:     resolvedOwner,
      agentCount,
      agents,
      txHash:    hash,
      explorerUrl: `https://basescan.org/tx/${hash}`,
      usage: {
        sdk: `const ps = new PaySpawn({ credential: agents[0].credential });\nawait ps.pool.pay({ to: recipient, amount: 1_000_000 });`,
        curl: `curl -X POST https://payspawn.ai/api/pool/pay \\\n  -H 'Content-Type: application/json' \\\n  -d '{"credential":"<agent_credential>","to":"0x...","amount":"1000000"}'`,
      },
    });
  } catch (err: any) {
    console.error("Fleet provision error:", err);
    return NextResponse.json({ error: err.message || "Fleet provisioning failed" }, { status: 500 });
  }
}
