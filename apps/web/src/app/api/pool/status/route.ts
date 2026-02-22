import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, isAddress, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { base } from "viem/chains";

const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const POOL_ABI = parseAbi([
  "function balance() view returns (uint256)",
  "function active() view returns (bool)",
  "function perAgentDailyLimit() view returns (uint256)",
  "function owner() view returns (address)",
  "function relayer() view returns (address)",
  "function agentDailyUsed(bytes32 credentialHash) view returns (uint256)",
  "function agentDailyRemaining(bytes32 credentialHash) view returns (uint256)",
  "function registeredAgents(bytes32 credentialHash) view returns (bool)",
  "function canSpend(bytes32 credentialHash, uint256 amount) view returns (bool)",
]);

function decodeCredential(credential: string) {
  try {
    return JSON.parse(Buffer.from(credential, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

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

/**
 * GET /api/pool/status?poolId=0x...
 * GET /api/pool/status?poolId=0x...&credential=base64...
 *
 * Returns pool status. If credential is provided, also returns agent-specific limits.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const poolId    = searchParams.get("poolId")     as `0x${string}`;
    const credential = searchParams.get("credential");

    if (!poolId || !isAddress(poolId)) {
      return NextResponse.json({ error: "Valid poolId required" }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    const [balance, active, perAgentDailyLimit, owner] = await Promise.all([
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "balance" }),
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "active" }),
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "perAgentDailyLimit" }),
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "owner" }),
    ]);

    const poolStatus = {
      poolId,
      owner,
      active,
      balance:           (balance as bigint).toString(),
      balanceUSD:        (Number(balance as bigint) / 1e6).toFixed(2),
      perAgentDailyLimit: (perAgentDailyLimit as bigint).toString(),
      perAgentDailyLimitUSD: (Number(perAgentDailyLimit as bigint) / 1e6).toFixed(2),
    };

    if (!credential) {
      return NextResponse.json(poolStatus);
    }

    // Agent-specific info
    const parsed = decodeCredential(credential);
    if (!parsed) {
      return NextResponse.json({ ...poolStatus, agentError: "Invalid credential" });
    }

    const credentialHash = computeCredentialHash(parsed.permission);
    const [isRegistered, dailyUsed, dailyRemaining] = await Promise.all([
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "registeredAgents", args: [credentialHash] }),
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "agentDailyUsed",  args: [credentialHash] }),
      publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "agentDailyRemaining", args: [credentialHash] }),
    ]);

    return NextResponse.json({
      ...poolStatus,
      agent: {
        credentialHash,
        isRegistered,
        dailyUsed:      (dailyUsed as bigint).toString(),
        dailyUsedUSD:   (Number(dailyUsed as bigint) / 1e6).toFixed(2),
        dailyRemaining: (dailyRemaining as bigint).toString(),
        dailyRemainingUSD: (Number(dailyRemaining as bigint) / 1e6).toFixed(2),
      },
    });
  } catch (err: any) {
    console.error("Pool status error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch pool status" }, { status: 500 });
  }
}
