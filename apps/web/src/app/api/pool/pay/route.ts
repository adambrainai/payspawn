import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi, isAddress, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const POOL_ABI = parseAbi([
  "function pay(bytes32 credentialHash, address to, uint256 amount) external",
  "function canSpend(bytes32 credentialHash, uint256 amount) view returns (bool)",
  "function agentDailyRemaining(bytes32 credentialHash) view returns (uint256)",
  "function balance() view returns (uint256)",
  "function active() view returns (bool)",
  "function perAgentDailyLimit() view returns (uint256)",
]);

function decodeCredential(credential: string) {
  try {
    return JSON.parse(Buffer.from(credential, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

function computeCredentialHash(permission: any): `0x${string}` {
  // keccak256(abi.encode(permission struct fields))
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
 * POST /api/pool/pay
 *
 * Agent calls this instead of /api/pay when spending from a budget pool.
 *
 * Body:
 *   {
 *     credential: "base64...",   // pool agent credential (has poolId field)
 *     to: "0x...",               // USDC recipient or .pay name
 *     amount: "1000000",         // USDC amount (6 decimals)
 *   }
 *
 * The credential must contain a `poolId` field pointing to the pool contract.
 * Pool agent credentials look like:
 *   {
 *     signature: "POOL",
 *     poolId: "0xPOOL_ADDRESS",
 *     permission: { account: "0xOWNER", ... }
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    if (!RELAYER_PRIVATE_KEY) {
      return NextResponse.json({ error: "Relayer not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { credential, to, amount } = body;

    if (!credential || !to || !amount) {
      return NextResponse.json({ error: "credential, to, and amount required" }, { status: 400 });
    }

    // Resolve .pay names
    let recipient = to as `0x${string}`;
    if (!isAddress(to)) {
      // Try .pay name resolution via existing /api/names logic
      const namesRes = await fetch(`${process.env.NEXTAUTH_URL || "https://payspawn.ai"}/api/names?name=${to}`);
      if (namesRes.ok) {
        const namesData = await namesRes.json();
        if (namesData.address && isAddress(namesData.address)) {
          recipient = namesData.address as `0x${string}`;
        }
      }
      if (!isAddress(recipient)) {
        return NextResponse.json({ error: `Could not resolve address: ${to}` }, { status: 400 });
      }
    }

    // Decode credential
    const parsed = decodeCredential(credential);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid credential" }, { status: 400 });
    }

    // Must be a pool credential
    const poolId = parsed.poolId as `0x${string}`;
    if (!poolId || !isAddress(poolId)) {
      return NextResponse.json(
        { error: "Not a pool credential. Use /api/pay for regular credentials." },
        { status: 400 }
      );
    }

    // Validate expiry
    const now = Math.floor(Date.now() / 1000);
    if (parsed.permission?.end && Number(parsed.permission.end) < now) {
      return NextResponse.json({ error: "Credential expired" }, { status: 400 });
    }

    // Compute credentialHash
    const credentialHash = computeCredentialHash(parsed.permission);
    const amountBigInt = BigInt(amount);

    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    // Check pool can spend before submitting tx
    const canSpend = await publicClient.readContract({
      address: poolId,
      abi: POOL_ABI,
      functionName: "canSpend",
      args: [credentialHash, amountBigInt],
    });

    if (!canSpend) {
      // Get detailed reason
      const [poolBalance, remaining, isActive] = await Promise.all([
        publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "balance" }),
        publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "agentDailyRemaining", args: [credentialHash] }),
        publicClient.readContract({ address: poolId, abi: POOL_ABI, functionName: "active" }),
      ]);

      let reason = "Cannot spend";
      if (!isActive) reason = "Pool is inactive";
      else if ((poolBalance as bigint) < amountBigInt) reason = `Insufficient pool balance: $${Number(poolBalance) / 1e6} USDC remaining`;
      else if ((remaining as bigint) < amountBigInt) reason = `Agent daily limit reached: $${Number(remaining) / 1e6} USDC remaining today`;

      return NextResponse.json({ error: reason, canSpend: false }, { status: 400 });
    }

    // Execute payment via pool contract
    const relayerAccount = privateKeyToAccount(RELAYER_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account: relayerAccount,
      chain: base,
      transport: http(BASE_RPC_URL),
    });

    const hash = await walletClient.writeContract({
      address: poolId,
      abi: POOL_ABI,
      functionName: "pay",
      args: [credentialHash, recipient, amountBigInt],
    });

    // Wait with timeout
    let txHash = hash;
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 8_000 });
      txHash = receipt.transactionHash;
    } catch {
      // Timeout — tx is submitted, will confirm
    }

    return NextResponse.json({
      success: true,
      txHash,
      poolId,
      credentialHash,
      from: parsed.permission?.account,
      to: recipient,
      amount: amount.toString(),
      amountUSD: (Number(amount) / 1e6).toFixed(2),
      explorerUrl: `https://basescan.org/tx/${txHash}`,
    });
  } catch (err: any) {
    console.error("Pool pay error:", err);
    return NextResponse.json({ error: err.message || "Pool payment failed" }, { status: 500 });
  }
}
