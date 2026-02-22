import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, formatUnits } from "viem";
import { base } from "viem/chains";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ROUTER_CONTRACT = "0x0977EA4af7E4e3282cf03Bb0cCae02624ABb6fdC";

// Names contract for reverse lookup
const NAMES_CONTRACT = "0xc653c91524B5D72Adb767151d30b606A727be2E4";
const NAMES_ABI = [
  {
    name: "nameOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ type: "string" }],
  },
] as const;

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const limit = parseInt(searchParams.get("limit") || "10");

  if (!address) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  try {
    // Get current block
    const currentBlock = await client.getBlockNumber();
    
    // Look back ~24 hours (Base has ~2s blocks, so ~43200 blocks per day)
    // But limit to 10000 blocks to avoid timeout
    const fromBlock = currentBlock - BigInt(10000);

    // Query USDC Transfer events FROM this address (outgoing payments)
    const transferEvent = parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    );

    const logs = await client.getLogs({
      address: USDC_ADDRESS,
      event: transferEvent,
      args: {
        from: address as `0x${string}`,
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Filter to only transfers that went to the router (PaySpawn payments)
    // The router then forwards to the recipient, so we need to look at the full tx
    // For simplicity, we'll show all USDC outgoing transfers for now
    // In production, we'd index this properly or check router involvement

    // Get unique recipients and try to resolve names
    const uniqueRecipients = [...new Set(logs.map(log => log.args.to))];
    const nameCache: Record<string, string> = {};
    
    // Batch resolve names (limit to avoid too many calls)
    await Promise.all(
      uniqueRecipients.slice(0, 20).map(async (addr) => {
        if (!addr) return;
        try {
          const name = await client.readContract({
            address: NAMES_CONTRACT,
            abi: NAMES_ABI,
            functionName: "nameOf",
            args: [addr],
          });
          if (name && name !== "") {
            nameCache[addr.toLowerCase()] = `${name}.pay`;
          }
        } catch {
          // No name registered
        }
      })
    );

    // Get block timestamps for recent transactions
    const recentLogs = logs.slice(-limit).reverse(); // Most recent first
    
    const transactions = await Promise.all(
      recentLogs.map(async (log) => {
        let timestamp: number | null = null;
        try {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          timestamp = Number(block.timestamp) * 1000; // Convert to milliseconds
        } catch {
          // Couldn't get block
        }

        const toAddress = log.args.to?.toLowerCase() || "";
        const recipientName = nameCache[toAddress];

        return {
          hash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          timestamp,
          to: log.args.to,
          toName: recipientName || null,
          amount: log.args.value ? formatUnits(log.args.value, 6) : "0",
          type: "payment",
        };
      })
    );

    return NextResponse.json({
      transactions,
      fromBlock: Number(fromBlock),
      toBlock: Number(currentBlock),
    });
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
