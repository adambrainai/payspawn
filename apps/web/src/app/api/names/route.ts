import { NextRequest, NextResponse } from "next/server";

import { publicClient } from "@/lib/rpc";

// PaySpawnNames contract on Base
const NAMES_CONTRACT = "0xc653c91524B5D72Adb767151d30b606A727be2E4";

const NAMES_ABI = [
  {
    name: "resolve",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "address" }],
  },
  {
    name: "nameOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "isAvailable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "isValidName",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// publicClient imported from @/lib/rpc (shared, with fallback transport)

// In-memory cache for speed (contract is source of truth)
const nameCache: Map<string, { address: string; timestamp: number }> = new Map();
const addressCache: Map<string, { name: string; timestamp: number }> = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

// GET /api/names?name=alice - Resolve a name to address
// GET /api/names?address=0x... - Get name for address
// GET /api/names?check=alice - Check if name is available
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const address = searchParams.get("address");
  const check = searchParams.get("check");

  // Check availability
  if (check) {
    const normalizedName = check.toLowerCase().replace(/\.pay$/, "");
    try {
      const isAvailable = await publicClient.readContract({
        address: NAMES_CONTRACT,
        abi: NAMES_ABI,
        functionName: "isAvailable",
        args: [normalizedName],
      });
      
      const isValid = await publicClient.readContract({
        address: NAMES_CONTRACT,
        abi: NAMES_ABI,
        functionName: "isValidName",
        args: [normalizedName],
      });

      return NextResponse.json({
        name: normalizedName,
        displayName: `${normalizedName}.pay`,
        available: isAvailable,
        valid: isValid,
      });
    } catch (e) {
      console.error("Availability check error:", e);
      return NextResponse.json({ error: "Failed to check availability" }, { status: 500 });
    }
  }

  // Resolve name to address
  if (name) {
    const normalizedName = name.toLowerCase().replace(/\.pay$/, "");
    
    // Check cache first
    const cached = nameCache.get(normalizedName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        name: normalizedName,
        displayName: `${normalizedName}.pay`,
        address: cached.address,
        cached: true,
      });
    }

    try {
      const resolvedAddress = await publicClient.readContract({
        address: NAMES_CONTRACT,
        abi: NAMES_ABI,
        functionName: "resolve",
        args: [normalizedName],
      });

      if (resolvedAddress === "0x0000000000000000000000000000000000000000") {
        return NextResponse.json({ error: "Name not found" }, { status: 404 });
      }

      // Update cache
      nameCache.set(normalizedName, { address: resolvedAddress.toLowerCase(), timestamp: Date.now() });
      addressCache.set(resolvedAddress.toLowerCase(), { name: normalizedName, timestamp: Date.now() });

      return NextResponse.json({
        name: normalizedName,
        displayName: `${normalizedName}.pay`,
        address: resolvedAddress.toLowerCase(),
      });
    } catch (e) {
      console.error("Name resolution error:", e);
      return NextResponse.json({ error: "Failed to resolve name" }, { status: 500 });
    }
  }

  // Get name for address
  if (address) {
    const normalizedAddress = address.toLowerCase();
    
    // Check cache first
    const cached = addressCache.get(normalizedAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        name: cached.name,
        displayName: `${cached.name}.pay`,
        address: normalizedAddress,
        cached: true,
      });
    }

    try {
      const resolvedName = await publicClient.readContract({
        address: NAMES_CONTRACT,
        abi: NAMES_ABI,
        functionName: "nameOf",
        args: [address as `0x${string}`],
      });

      if (!resolvedName || resolvedName === "") {
        return NextResponse.json({ error: "No name registered for this address" }, { status: 404 });
      }

      // Update cache
      nameCache.set(resolvedName, { address: normalizedAddress, timestamp: Date.now() });
      addressCache.set(normalizedAddress, { name: resolvedName, timestamp: Date.now() });

      return NextResponse.json({
        name: resolvedName,
        displayName: `${resolvedName}.pay`,
        address: normalizedAddress,
      });
    } catch (e) {
      console.error("Address lookup error:", e);
      return NextResponse.json({ error: "Failed to lookup address" }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "Provide ?name=, ?address=, or ?check= parameter" },
    { status: 400 }
  );
}

// POST is no longer needed - registration happens on-chain via the dashboard
export async function POST() {
  return NextResponse.json({
    error: "Name registration is now on-chain. Use the dashboard to register names.",
    contract: NAMES_CONTRACT,
    basescan: `https://basescan.org/address/${NAMES_CONTRACT}`,
  }, { status: 400 });
}
