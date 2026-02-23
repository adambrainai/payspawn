import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { publicClient } from "@/lib/rpc";

// ============ Contract Addresses (Base Mainnet) ============

const CONTRACTS = {
  PAYSPAWN_SPENDER_V4: "0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" as `0x${string}`,
  SPEND_PERMISSION_MANAGER: "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
};

// ============ Types ============

interface SpendPermission {
  account: string;
  spender: string;
  token: string;
  allowance: string;
  period: number;
  start: number;
  end: number;
  salt: string;
  extraData: string;
}

// ============ ABIs ============

const SPM_ABI = [
  {
    name: "isApproved",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "spendPermission", type: "tuple", components: [
      { name: "account", type: "address" },
      { name: "spender", type: "address" },
      { name: "token", type: "address" },
      { name: "allowance", type: "uint160" },
      { name: "period", type: "uint48" },
      { name: "start", type: "uint48" },
      { name: "end", type: "uint48" },
      { name: "salt", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ]}],
    outputs: [{ type: "bool" }],
  },
  {
    name: "isRevoked",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "spendPermission", type: "tuple", components: [
      { name: "account", type: "address" },
      { name: "spender", type: "address" },
      { name: "token", type: "address" },
      { name: "allowance", type: "uint160" },
      { name: "period", type: "uint48" },
      { name: "start", type: "uint48" },
      { name: "end", type: "uint48" },
      { name: "salt", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ]}],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getCurrentPeriod",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "spendPermission", type: "tuple", components: [
      { name: "account", type: "address" },
      { name: "spender", type: "address" },
      { name: "token", type: "address" },
      { name: "allowance", type: "uint160" },
      { name: "period", type: "uint48" },
      { name: "start", type: "uint48" },
      { name: "end", type: "uint48" },
      { name: "salt", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ]}],
    outputs: [
      { name: "start", type: "uint48" },
      { name: "end", type: "uint48" },
      { name: "spend", type: "uint160" },
    ],
  },
] as const;

const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ============ Helpers ============

function formatPermissionForContract(permission: SpendPermission) {
  return {
    account: permission.account as `0x${string}`,
    spender: permission.spender as `0x${string}`,
    token: permission.token as `0x${string}`,
    allowance: BigInt(permission.allowance),
    period: Number(permission.period),
    start: Number(permission.start),
    end: Number(permission.end),
    salt: BigInt(permission.salt),
    extraData: (permission.extraData || "0x") as `0x${string}`,
  };
}

function decodeCredential(credentialString: string): { signature: string; permission: SpendPermission } | null {
  try {
    const decoded = Buffer.from(credentialString, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ============ API Handler ============

/**
 * POST /api/check
 * Full credential status check. Detects EOA vs Smart Wallet automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Accept either { credential: "base64..." } or legacy { permission: {...} }
    let permission: SpendPermission;
    let isEOA = false;

    if (body.credential) {
      const decoded = decodeCredential(body.credential);
      if (!decoded) {
        return NextResponse.json({ error: "Invalid credential format" }, { status: 400 });
      }
      permission = decoded.permission;
      isEOA = decoded.signature === "EOA" || decoded.signature === "0x";
    } else if (body.permission) {
      permission = body.permission;
      // Legacy: assume smart wallet if no signature info
      isEOA = false;
    } else {
      return NextResponse.json({ error: "Missing required field: credential or permission" }, { status: 400 });
    }

    if (!permission.account || !permission.spender || !permission.token) {
      return NextResponse.json(
        { error: "Invalid permission: missing account, spender, or token" },
        { status: 400 }
      );
    }


    const now = Math.floor(Date.now() / 1000);
    const isExpired = now > permission.end;
    const notYetStarted = now < permission.start;
    const allowance = BigInt(permission.allowance);

    // Always fetch USDC balance
    const balance = await publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [permission.account as `0x${string}`],
    });

    if (isEOA) {
      // EOA path: check USDC allowance to the credential's spender (V5.1 or V4)
      const spenderAddr = (permission.spender as `0x${string}`) || CONTRACTS.PAYSPAWN_SPENDER_V4;
      const usdcAllowance = await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [permission.account as `0x${string}`, spenderAddr],
      });

      const isActive = !isExpired && !notYetStarted;
      const status = isExpired ? "expired" : notYetStarted ? "not_started" : "active";

      return NextResponse.json({
        walletType: "EOA",
        status,
        account: permission.account,
        spender: permission.spender,
        isApproved: usdcAllowance > BigInt(0),
        isRevoked: usdcAllowance === BigInt(0) && isActive,
        isExpired,
        notYetStarted,
        balance: {
          usdc: formatUnits(balance, 6),
          raw: balance.toString(),
        },
        limits: {
          dailyAllowance: formatUnits(allowance, 6),
          usdcAllowance: formatUnits(usdcAllowance, 6),
          remaining: formatUnits(usdcAllowance, 6),
          periodSpent: null,
          periodStart: null,
          periodEnd: null,
        },
        validity: {
          start: new Date(permission.start * 1000).toISOString(),
          end: new Date(permission.end * 1000).toISOString(),
          periodSeconds: permission.period,
        },
        canSpend: isActive && usdcAllowance > BigInt(0) && balance > BigInt(0),
        contracts: {
          paySpawnSpenderV4: CONTRACTS.PAYSPAWN_SPENDER_V4,
        },
      });
    } else {
      // Smart Wallet path: check SpendPermissionManager
      const permissionForContract = formatPermissionForContract(permission);

      const [isApproved, isRevoked] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.SPEND_PERMISSION_MANAGER,
          abi: SPM_ABI,
          functionName: "isApproved",
          args: [permissionForContract],
        }),
        publicClient.readContract({
          address: CONTRACTS.SPEND_PERMISSION_MANAGER,
          abi: SPM_ABI,
          functionName: "isRevoked",
          args: [permissionForContract],
        }),
      ]);

      let periodSpent = BigInt(0);
      let periodStart = 0;
      let periodEnd = 0;

      if (isApproved && !isRevoked) {
        try {
          const periodInfo = await publicClient.readContract({
            address: CONTRACTS.SPEND_PERMISSION_MANAGER,
            abi: SPM_ABI,
            functionName: "getCurrentPeriod",
            args: [permissionForContract],
          });
          [periodStart, periodEnd, periodSpent] = periodInfo;
        } catch {
          // No spending yet in this period
        }
      }

      const remaining = allowance - periodSpent;

      let status: "active" | "pending" | "revoked" | "expired" | "not_started";
      if (isRevoked) status = "revoked";
      else if (isExpired) status = "expired";
      else if (notYetStarted) status = "not_started";
      else if (isApproved) status = "active";
      else status = "pending";

      return NextResponse.json({
        walletType: "SmartWallet",
        status,
        account: permission.account,
        spender: permission.spender,
        isApproved,
        isRevoked,
        isExpired,
        notYetStarted,
        balance: {
          usdc: formatUnits(balance, 6),
          raw: balance.toString(),
        },
        limits: {
          dailyAllowance: formatUnits(allowance, 6),
          periodSpent: formatUnits(periodSpent, 6),
          remaining: formatUnits(remaining, 6),
          periodStart: periodStart > 0 ? new Date(periodStart * 1000).toISOString() : null,
          periodEnd: periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null,
        },
        validity: {
          start: new Date(permission.start * 1000).toISOString(),
          end: new Date(permission.end * 1000).toISOString(),
          periodSeconds: permission.period,
        },
        canSpend: status === "active" || status === "pending",
        contracts: {
          paySpawnSpenderV4: CONTRACTS.PAYSPAWN_SPENDER_V4,
          spendPermissionManager: CONTRACTS.SPEND_PERMISSION_MANAGER,
        },
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Check error:", error);
    return NextResponse.json({ error: msg || "Failed to check status" }, { status: 500 });
  }
}

/**
 * GET /api/check?address=0x...
 * Returns USDC balance and V4 allowance for an address.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (address) {
    try {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
      }

  

      const [balance, v4Allowance] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.USDC,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        }),
        publicClient.readContract({
          address: CONTRACTS.USDC,
          abi: USDC_ABI,
          functionName: "allowance",
          args: [address as `0x${string}`, CONTRACTS.PAYSPAWN_SPENDER_V4],
        }),
      ]);

      const balanceFormatted = parseFloat(formatUnits(balance, 6)).toFixed(2);
      const allowanceFormatted = parseFloat(formatUnits(v4Allowance, 6)).toFixed(2);

      return NextResponse.json({
        address,
        balance: balanceFormatted,
        balanceRaw: balance.toString(),
        remaining: allowanceFormatted,
        remainingRaw: v4Allowance.toString(),
        token: "USDC",
        chain: "base",
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Balance check error:", error);
      return NextResponse.json({ error: msg || "Failed to fetch balance" }, { status: 500 });
    }
  }

  // No address - return API docs
  return NextResponse.json({
    endpoint: "GET/POST /api/check",
    description: "Check balance or credential status. EOA and Smart Wallet aware.",
    get: {
      params: {
        address: "Wallet address to check balance and V4 allowance",
      },
      response: {
        balance: "USDC balance (formatted)",
        remaining: "USDC allowance to PaySpawnSpenderV4 (for EOA agents)",
      },
    },
    post: {
      body: {
        credential: "Your base64-encoded PaySpawn credential (preferred)",
        permission: "Raw permission object (legacy, assumes Smart Wallet)",
      },
      response: {
        walletType: "EOA or SmartWallet",
        status: "active | pending | revoked | expired | not_started",
        isApproved: "Whether permission is approved on-chain",
        balance: "Current USDC balance",
        limits: {
          dailyAllowance: "Maximum spend per period",
          remaining: "Remaining allowance (EOA: USDC allowance; SmartWallet: period remaining)",
        },
        canSpend: "Whether agent can currently make payments",
      },
    },
  });
}
