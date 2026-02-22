/**
 * Shared Base RPC client with fallback transport.
 * Priority order:
 *   1. BASE_RPC_URL env var (Alchemy/Infura key — set in Vercel for best performance)
 *   2. LlamaRPC (free, no key needed, reliable)
 *   3. PublicNode (free, no key needed)
 *   4. mainnet.base.org (official fallback, rate-limited)
 */

import { createPublicClient, createWalletClient, fallback, http } from "viem";
import type { WriteContractParameters } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.BASE_RPC_URL || "https://base.llamarpc.com";
const transport = fallback([
  http(RPC_URL),
  http("https://base-rpc.publicnode.com"),
  http("https://mainnet.base.org"),
], { rank: false });

/**
 * Shared public client for reading chain state.
 * Use this everywhere instead of creating a new client per-request.
 */
export const publicClient = createPublicClient({
  chain: base,
  transport,
});

/**
 * Build a wallet client for the relayer signer.
 * Creates a new instance per request (private key from env).
 */
export function buildWalletClient() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({
    account,
    chain: base,
    transport,
  });
}

/**
 * writeContract with automatic nonce retry.
 *
 * Problem: concurrent requests all fetch nonce=N at the same time, then
 * two of them try to submit with nonce=N and one fails.
 *
 * Fix: fetch the *pending* nonce (includes mempool txs), pass it explicitly,
 * and on "nonce too low" retry once with a freshly fetched nonce.
 */
export async function writeContractWithRetry(
  params: Omit<WriteContractParameters, "account" | "chain">
): Promise<`0x${string}`> {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport });

  const getNonce = () =>
    publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });

  const attempt = async (nonce: number) =>
    walletClient.writeContract({ ...params, nonce, account, chain: base } as WriteContractParameters);

  // Retry up to 4 times with increasing delay on nonce collisions
  let lastErr: unknown;
  const delays = [0, 200, 500, 1000];
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    try {
      return await attempt(await getNonce());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("nonce") && (msg.includes("low") || msg.includes("too low"))) {
        lastErr = err;
        continue; // retry with fresh nonce
      }
      throw err; // non-nonce error — bail immediately
    }
  }
  throw lastErr;
}
