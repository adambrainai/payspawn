/**
 * Shared credential utilities — single source of truth for hash computation.
 * Previously duplicated across /api/pay, /api/pool/pay, /api/pay/pause.
 */
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

export interface PermissionV4 {
  account:   string;
  spender:   string;
  token:     string;
  allowance: string | bigint;
  period:    number;
  start:     number;
  end:       number;
  salt:      string | bigint;
  extraData: string;
}

export interface PermissionV5 {
  account:      string;
  spender:      string;
  token:        string;
  allowance:    string | bigint;
  period:       number;
  start:        number;
  end:          number;
  salt:         string | bigint;
  maxPerTx:     string | bigint;
  allowedTo:    string[];
  maxTxPerHour: number;
  parentHash:   string;
}

/** True if permission has V5-only fields */
export function isV5Permission(p: Record<string, any>): boolean {
  return (
    p.maxPerTx     !== undefined ||
    p.allowedTo    !== undefined ||
    p.maxTxPerHour !== undefined ||
    p.parentHash   !== undefined
  );
}

/** keccak256(abi.encode(PermissionV4 struct)) */
export function computeCredentialHashV4(p: PermissionV4): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address,address,address,uint160,uint48,uint48,uint48,uint256,bytes"),
      [
        p.account   as `0x${string}`,
        p.spender   as `0x${string}`,
        p.token     as `0x${string}`,
        BigInt(p.allowance),
        Number(p.period),
        Number(p.start),
        Number(p.end),
        BigInt(p.salt),
        (p.extraData || "0x") as `0x${string}`,
      ]
    )
  );
}

/** keccak256(abi.encode(PermissionV5 struct)) — matches on-chain computeCredentialHash */
export function computeCredentialHashV5(p: PermissionV5): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address,address,address,uint256,uint48,uint48,uint48,uint256,uint256,address[],uint8,bytes32"
      ),
      [
        p.account      as `0x${string}`,
        p.spender      as `0x${string}`,
        p.token        as `0x${string}`,
        BigInt(p.allowance),
        Number(p.period),
        Number(p.start),
        Number(p.end),
        BigInt(p.salt),
        BigInt(p.maxPerTx     ?? 0),
        (p.allowedTo   ?? []) as `0x${string}`[],
        Number(p.maxTxPerHour ?? 0),
        (p.parentHash  ?? "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`,
      ]
    )
  );
}

/** Decode a base64 credential string */
export function decodeCredential(credentialString: string): {
  signature: string;
  permission: Record<string, any>;
  poolId?: string;
} | null {
  try {
    const decoded = Buffer.from(credentialString, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** Validate and sanitize amount — returns error string or null if ok */
export function validateAmount(amount: unknown): string | null {
  const n = Number(amount);
  if (isNaN(n) || !isFinite(n)) return "Amount must be a number";
  if (n <= 0)                    return "Amount must be greater than 0";
  if (n > 10_000)                return "Amount exceeds maximum of $10,000 per transaction";
  return null;
}
