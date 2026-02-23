"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useSignTypedData,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { formatUnits, parseUnits, parseAbiItem } from "viem";
import { base } from "viem/chains";

// ─── Contracts ───────────────────────────────────────────────────────────────

const CONTRACTS = {
  SPEND_PERMISSION_MANAGER: "0xf85210B21cC50302F477BA56686d2019dC9b67Ad" as `0x${string}`,
  PAYSPAWN_SPENDER:         "0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" as `0x${string}`, // V4 legacy
  PAYSPAWN_SPENDER_V5:      "0x357b7D5A6529F6aA3b89A276698615D2110ED9E2" as `0x${string}`, // V5 — new default
  USDC:                     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
  NAMES:                    "0xc653c91524B5D72Adb767151d30b606A727be2E4" as `0x${string}`,
};

// ─── ABIs ────────────────────────────────────────────────────────────────────

const USDC_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
] as const;

const SPM_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spendPermission", type: "tuple",
      components: [
        { name: "account", type: "address" }, { name: "spender", type: "address" },
        { name: "token", type: "address" },   { name: "allowance", type: "uint160" },
        { name: "period", type: "uint48" },   { name: "start", type: "uint48" },
        { name: "end", type: "uint48" },      { name: "salt", type: "uint256" },
        { name: "extraData", type: "bytes" },
      ] }], outputs: [{ type: "bool" }] },
] as const;

const NAMES_ABI = [
  { name: "nameOf",     type: "function", stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }], outputs: [{ type: "string" }] },
  { name: "isAvailable", type: "function", stateMutability: "view",
    inputs: [{ name: "name", type: "string" }], outputs: [{ type: "bool" }] },
  { name: "register",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }], outputs: [] },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpendPermission {
  account: `0x${string}`; spender: `0x${string}`; token: `0x${string}`;
  allowance: bigint; period: number; start: number; end: number;
  salt: bigint; extraData: `0x${string}`;
}

interface AgentEntry {
  id: string;
  label: string;          // human name: "Claude Researcher"
  credential: string;     // base64
  permission: {           // serialized (bigints as strings)
    account: string; spender: string; token: string;
    allowance: string; period: number; start: number; end: number;
    salt: string; extraData: string;
    // V5 fields (optional — absent on V4 credentials)
    maxPerTx?: string;
    allowedTo?: string[];
    maxTxPerHour?: number;
    parentHash?: string;
  };
  isEOA: boolean;
  credentialVersion: "v4" | "v5";
  isPaused?: boolean;
  createdAt: number;
  isRevoked: boolean;
}

/** Detect if a stored permission has V5 fields */
function isPermissionV5(p: AgentEntry["permission"]): boolean {
  return p.maxPerTx !== undefined || p.allowedTo !== undefined ||
         p.maxTxPerHour !== undefined || p.parentHash !== undefined;
}

interface TxEvent {
  txHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  fee: bigint;
  blockNumber: bigint;
  timestamp?: number;
}

// ─── EIP-712 ─────────────────────────────────────────────────────────────────

const SPM_TYPES = {
  SpendPermission: [
    { name: "account", type: "address" }, { name: "spender", type: "address" },
    { name: "token",   type: "address" }, { name: "allowance", type: "uint160" },
    { name: "period",  type: "uint48"  }, { name: "start",    type: "uint48"  },
    { name: "end",     type: "uint48"  }, { name: "salt",     type: "uint256" },
    { name: "extraData", type: "bytes" },
  ],
} as const;

const DOMAIN = {
  name: "Spend Permission Manager",
  version: "1",
  chainId: base.id,
  verifyingContract: CONTRACTS.SPEND_PERMISSION_MANAGER,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: bigint) => parseFloat(formatUnits(v, 6)).toFixed(2);
const salt = () => BigInt(Math.floor(Math.random() * 1e18));
const uid  = () => Math.random().toString(36).slice(2, 10);

interface PermissionV5 {
  account: `0x${string}`; spender: `0x${string}`; token: `0x${string}`;
  allowance: bigint; period: number; start: number; end: number;
  salt: bigint;
  maxPerTx: bigint;
  allowedTo: `0x${string}`[];
  maxTxPerHour: number;
  parentHash: `0x${string}`;
}

function encodeCredential(p: SpendPermission, sig: string): string {
  return Buffer.from(JSON.stringify({
    signature: sig,
    permission: {
      account: p.account, spender: p.spender, token: p.token,
      allowance: p.allowance.toString(), period: p.period,
      start: p.start, end: p.end, salt: p.salt.toString(), extraData: p.extraData,
    },
  })).toString("base64");
}

function encodeCredentialV5(p: PermissionV5, sig: string): string {
  return Buffer.from(JSON.stringify({
    signature: sig,
    permission: {
      account: p.account, spender: p.spender, token: p.token,
      allowance: p.allowance.toString(), period: p.period,
      start: p.start, end: p.end, salt: p.salt.toString(),
      maxPerTx: p.maxPerTx.toString(),
      allowedTo: p.allowedTo,
      maxTxPerHour: p.maxTxPerHour,
      parentHash: p.parentHash,
    },
  })).toString("base64");
}

function storageKey(addr: string) { return `payspawn_fleet_${addr.toLowerCase()}`; }

function loadAgents(addr: string): AgentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: AgentEntry[] = JSON.parse(localStorage.getItem(storageKey(addr)) || "[]");
    // Backfill credentialVersion for entries created before V5
    return raw.map(a => ({
      ...a,
      credentialVersion: a.credentialVersion ?? (isPermissionV5(a.permission) ? "v5" : "v4"),
    }));
  } catch { return []; }
}

function saveAgents(addr: string, agents: AgentEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(addr), JSON.stringify(agents));
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts * 1000) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-xs px-2 py-1 border border-white/20 text-white/40 hover:border-[#F65B1A] hover:text-[#F65B1A] transition-all"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? "bg-green-400" : "bg-white/20"}`} />
  );
}

// ─── Agent Card (fleet list item) ────────────────────────────────────────────

function AgentCard({ agent, selected, onClick }: {
  agent: AgentEntry; selected: boolean; onClick: () => void;
}) {
  const limit = parseFloat(formatUnits(BigInt(agent.permission.allowance), 6)).toFixed(0);
  const expiry = new Date(agent.permission.end * 1000);
  const expired = agent.permission.end < Date.now() / 1000;
  const active = !agent.isRevoked && !expired;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 border-b border-white/5 transition-colors ${
        selected ? "bg-[#F65B1A]/8 border-l-2 border-l-[#F65B1A]" : "hover:bg-white/3"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusDot active={active} />
          <span className={`text-sm font-light ${selected ? "text-white" : "text-white/70"}`}>
            {agent.label}
          </span>
        </div>
        <span className={`text-xs ${active ? "text-[#F65B1A]" : "text-white/20"}`}>
          ${limit}/day
        </span>
      </div>
      <div className="mt-1 ml-5 flex items-center gap-3 text-xs text-white/25">
        <span>{agent.isEOA ? "EOA" : "Smart Wallet"}</span>
        <span>·</span>
        <span className={`font-mono px-1 py-0.5 text-[10px] rounded ${
          (agent.credentialVersion === "v5" || isPermissionV5(agent.permission))
            ? "bg-[#F65B1A]/15 text-[#F65B1A]"
            : "bg-white/8 text-white/30"
        }`}>
          {(agent.credentialVersion === "v5" || isPermissionV5(agent.permission)) ? "V5" : "V4"}
        </span>
        {agent.isPaused && <span className="text-yellow-400">PAUSED</span>}
        <span>·</span>
        <span>{expired ? "Expired" : agent.isRevoked ? "Revoked" : `Exp ${expiry.toLocaleDateString()}`}</span>
      </div>
    </button>
  );
}

// ─── Agent Detail Panel ──────────────────────────────────────────────────────

function AgentDetail({ agent, onRevoke, onDelete, onReplace, onPauseToggle }: {
  agent: AgentEntry; onRevoke: () => void; onDelete: () => void;
  onReplace: () => void; onPauseToggle?: () => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [pausing, setPausing]       = useState(false);
  const [pauseError, setPauseError] = useState("");
  const limit  = parseFloat(formatUnits(BigInt(agent.permission.allowance), 6)).toFixed(2);
  const expiry = new Date(agent.permission.end * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const active = !agent.isRevoked && agent.permission.end > Date.now() / 1000;
  const isV5   = agent.credentialVersion === "v5" || isPermissionV5(agent.permission);

  const handlePause = async () => {
    setPausing(true); setPauseError("");
    try {
      const res = await fetch("/api/pay/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: agent.credential, action: agent.isPaused ? "unpause" : "pause" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onPauseToggle?.();
    } catch (e: unknown) {
      setPauseError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPausing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot active={active && !agent.isPaused} />
            <h3 className="text-lg font-extralight text-white">{agent.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Version badge */}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${
              isV5 ? "border-[#F65B1A]/40 text-[#F65B1A]" : "border-white/15 text-white/25"
            }`}>{isV5 ? "V5" : "V4"}</span>
            {/* Status badge */}
            <span className={`text-xs px-2 py-1 border ${
              agent.isPaused    ? "border-yellow-500/40 text-yellow-400" :
              active            ? "border-green-500/40 text-green-400"   :
                                  "border-white/20 text-white/30"
            }`}>
              {agent.isRevoked ? "Revoked" : agent.isPaused ? "Paused" : active ? "Active" : "Expired"}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-white/30 font-mono">
          Created {new Date(agent.createdAt).toLocaleString()}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 border-b border-white/10">
        {[
          { label: "Daily Limit", value: `$${limit}` },
          { label: "Period", value: "24h reset" },
          { label: "Expires", value: expiry },
        ].map(({ label, value }) => (
          <div key={label} className="px-6 py-4 border-r border-white/10 last:border-r-0">
            <div className="text-xs text-white/30 tracking-wider uppercase mb-1">{label}</div>
            <div className="text-sm text-white font-light">{value}</div>
          </div>
        ))}
      </div>

      {/* V5 controls row */}
      {isV5 && (
        <div className="grid grid-cols-3 border-b border-white/10 bg-[#F65B1A]/3">
          <div className="px-6 py-3 border-r border-white/10">
            <div className="text-[10px] text-white/25 tracking-wider uppercase mb-1">Max Per Tx</div>
            <div className="text-xs text-white/70">
              {agent.permission.maxPerTx && BigInt(agent.permission.maxPerTx) > BigInt(0)
                ? `$${parseFloat(formatUnits(BigInt(agent.permission.maxPerTx), 6)).toFixed(2)}`
                : <span className="text-white/30">No cap</span>}
            </div>
          </div>
          <div className="px-6 py-3 border-r border-white/10">
            <div className="text-[10px] text-white/25 tracking-wider uppercase mb-1">Velocity</div>
            <div className="text-xs text-white/70">
              {agent.permission.maxTxPerHour
                ? `${agent.permission.maxTxPerHour}/hr`
                : <span className="text-white/30">Unlimited</span>}
            </div>
          </div>
          <div className="px-6 py-3">
            <div className="text-[10px] text-white/25 tracking-wider uppercase mb-1">Whitelist</div>
            <div className="text-xs text-white/70">
              {agent.permission.allowedTo?.length
                ? `${agent.permission.allowedTo.length} addr${agent.permission.allowedTo.length > 1 ? "s" : ""}`
                : <span className="text-white/30">Any address</span>}
            </div>
          </div>
        </div>
      )}

      {/* V4 upgrade nudge */}
      {!isV5 && active && (
        <div className="px-6 py-3 border-b border-white/10 bg-white/2 flex items-center justify-between">
          <span className="text-xs text-white/30">V5 adds per-tx limits, whitelisting, pause controls</span>
          <button onClick={onReplace} className="text-xs text-[#F65B1A] hover:underline">Upgrade →</button>
        </div>
      )}

      {/* Credential */}
      <div className="px-6 py-5 border-b border-white/10 flex-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs tracking-[0.2em] uppercase text-[#F65B1A]">🔑 Credential</span>
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs px-2 py-1 border border-white/20 text-white/40 hover:border-white/40 hover:text-white/60 transition-all"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <CopyButton text={agent.credential} />
          </div>
        </div>
        <div className="bg-white/4 border border-white/10 p-3 font-mono text-xs text-white/60 break-all leading-relaxed">
          {expanded ? agent.credential : `${agent.credential.slice(0, 60)}...`}
        </div>
        <p className="mt-2 text-xs text-yellow-500/70">
          ⚠ Keep secret — this credential authorizes spending from your wallet
        </p>

        {/* Quick start */}
        <div className="mt-4 bg-black/40 border border-white/10 p-4">
          <div className="text-xs text-white/30 tracking-wider uppercase mb-2">Quick Start</div>
          <pre className="text-xs text-white/60 overflow-x-auto leading-relaxed">{`npm install @payspawn/sdk

import { PaySpawn } from '@payspawn/sdk';
const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL);
await ps.pay('alice.pay', 5.00);`}</pre>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-white/10">
        {active ? (
          <>
            {/* V5: pause/unpause */}
            {isV5 && (
              <div className="mb-3">
                <button
                  onClick={handlePause}
                  disabled={pausing}
                  className={`w-full py-2 text-sm transition-colors ${
                    agent.isPaused
                      ? "border border-green-500/30 text-green-400 hover:bg-green-500/10"
                      : "border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {pausing
                    ? "Confirming on-chain..."
                    : agent.isPaused
                      ? "▶ Resume Agent (unpause on-chain)"
                      : "⏸ Pause Agent (on-chain)"}
                </button>
                {pauseError && <p className="mt-1 text-xs text-red-400">{pauseError}</p>}
                <p className="mt-1 text-xs text-white/20 text-center">
                  {agent.isPaused
                    ? "Credential is paused. No payments can execute until resumed."
                    : "Instantly blocks all payments. Reversible — credential stays valid."}
                </p>
              </div>
            )}
            <button
              onClick={onRevoke}
              className="w-full py-2 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
            >
              Revoke Agent
            </button>
            <p className="mt-2 text-xs text-white/25 text-center">
              Removes spending authorization. Credential becomes invalid.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onClick={onReplace}
              className="w-full py-2 border border-[#F65B1A]/40 text-[#F65B1A] text-sm hover:bg-[#F65B1A]/10 transition-colors"
            >
              ↺ Replace Agent
            </button>
            <button
              onClick={onDelete}
              className="w-full py-2 border border-white/15 text-white/30 text-sm hover:border-white/30 hover:text-white/50 transition-colors"
            >
              Delete from list
            </button>
            <p className="mt-1 text-xs text-white/20 text-center">
              Replace creates a fresh credential with the same label.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Agent Form ───────────────────────────────────────────────────────────

function AddAgentForm({ address, isEOA, onCreated, initialLabel = "" }: {
  address: `0x${string}`; isEOA: boolean | null;
  onCreated: (agent: AgentEntry) => void;
  initialLabel?: string;
}) {
  const [label, setLabel]       = useState(initialLabel);
  const [limit, setLimit]       = useState("50");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync: writeApprove, data: approveTxHash, error: approveError } = useWriteContract();
  const { isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const [pendingEOAPermission, setPendingEOAPermission] = useState<SpendPermission | null>(null);

  // When EOA approval tx confirms, finalize the credential
  useEffect(() => {
    if (isApproveConfirmed && pendingEOAPermission && label) {
      const p = pendingEOAPermission as unknown as PermissionV5 & { extraData?: string };
      const isV5 = (p as any).maxPerTx !== undefined;

      let cred: string;
      let agent: AgentEntry;

      if (isV5) {
        const pv5 = p as PermissionV5;
        cred = encodeCredentialV5(pv5, "EOA");
        agent = {
          id: uid(), label: label.trim(), credential: cred,
          permission: {
            account: pv5.account, spender: pv5.spender, token: pv5.token,
            allowance: pv5.allowance.toString(), period: pv5.period,
            start: pv5.start, end: pv5.end, salt: pv5.salt.toString(),
            extraData: "0x",
            maxPerTx: pv5.maxPerTx.toString(),
            allowedTo: pv5.allowedTo,
            maxTxPerHour: pv5.maxTxPerHour,
            parentHash: pv5.parentHash,
          },
          isEOA: true, credentialVersion: "v5",
          createdAt: Date.now(), isRevoked: false,
        };
      } else {
        cred = encodeCredential(pendingEOAPermission, "EOA");
        agent = {
          id: uid(), label: label.trim(), credential: cred,
          permission: {
            account: pendingEOAPermission.account, spender: pendingEOAPermission.spender,
            token: pendingEOAPermission.token, allowance: pendingEOAPermission.allowance.toString(),
            period: pendingEOAPermission.period, start: pendingEOAPermission.start,
            end: pendingEOAPermission.end, salt: pendingEOAPermission.salt.toString(),
            extraData: pendingEOAPermission.extraData,
          },
          isEOA: true, credentialVersion: "v4",
          createdAt: Date.now(), isRevoked: false,
        };
      }
      setPendingEOAPermission(null);
      setLoading(false);
      onCreated(agent);
    }
  }, [isApproveConfirmed, pendingEOAPermission, label, onCreated]);

  useEffect(() => {
    if (approveError) { setError(approveError.message); setLoading(false); }
  }, [approveError]);

  const create = async () => {
    if (!label.trim()) { setError("Give this agent a name"); return; }
    if (!address) return;
    setError(""); setLoading(true);

    const now      = Math.floor(Date.now() / 1000);

    // V5 permission — default: no per-tx cap, no whitelist, no velocity limit
    const permissionV5: PermissionV5 = {
      account:      address,
      spender:      CONTRACTS.PAYSPAWN_SPENDER_V5,
      token:        CONTRACTS.USDC,
      allowance:    parseUnits(limit, 6),
      period:       86400,
      start:        now - 60,
      end:          now + 365 * 24 * 60 * 60,
      salt:         salt(),
      maxPerTx:     BigInt(0),
      allowedTo:    [],
      maxTxPerHour: 0,
      parentHash:   "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    };

    // Legacy V4 shape (for SmartWallet SPM path — SPM uses original struct)
    const permission: SpendPermission = {
      account:   address,
      spender:   CONTRACTS.PAYSPAWN_SPENDER,
      token:     CONTRACTS.USDC,
      allowance: parseUnits(limit, 6),
      period:    86400,
      start:     now - 60,
      end:       now + 365 * 24 * 60 * 60,
      salt:      permissionV5.salt,
      extraData: "0x" as `0x${string}`,
    };

    try {
      if (isEOA) {
        // EOA: approve V5 contract, store V5 credential
        setPendingEOAPermission({ ...permissionV5, extraData: "0x" as `0x${string}` } as unknown as SpendPermission);
        await writeApprove({
          address: CONTRACTS.USDC, abi: USDC_ABI,
          functionName: "approve",
          args: [CONTRACTS.PAYSPAWN_SPENDER_V5, permissionV5.allowance],
        });
      } else {
        const sig = await signTypedDataAsync({ domain: DOMAIN, types: SPM_TYPES, primaryType: "SpendPermission", message: permission });
        const cred = encodeCredential(permission, sig);
        const agent: AgentEntry = {
          id: uid(), label: label.trim(), credential: cred,
          permission: {
            account: permission.account, spender: permission.spender, token: permission.token,
            allowance: permission.allowance.toString(), period: permission.period,
            start: permission.start, end: permission.end,
            salt: permission.salt.toString(), extraData: permission.extraData,
          },
          isEOA: false, credentialVersion: "v4", createdAt: Date.now(), isRevoked: false,
        };
        setLoading(false);
        onCreated(agent);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  };

  const PRESETS = ["10","25","50","100","250"];

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <div className="text-xs tracking-[0.25em] uppercase text-[#F65B1A] mb-4">New Agent</div>

        {/* Agent name */}
        <div className="mb-5">
          <label className="block text-xs text-white/40 tracking-wider uppercase mb-2">Agent Name</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Claude Researcher, Trading Bot..."
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm text-white placeholder-white/20 focus:border-[#F65B1A] focus:outline-none"
          />
        </div>

        {/* Daily limit */}
        <div className="mb-5">
          <label className="block text-xs text-white/40 tracking-wider uppercase mb-2">Daily Limit</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {PRESETS.map(p => (
              <button key={p} onClick={() => setLimit(p)}
                className={`px-3 py-1.5 text-sm border transition-all ${
                  limit === p ? "border-[#F65B1A] text-[#F65B1A] bg-[#F65B1A]/8" : "border-white/20 text-white/50 hover:border-white/40"
                }`}>${p}</button>
            ))}
            <input type="number" value={limit} onChange={e => setLimit(e.target.value)}
              className="w-20 bg-transparent border border-white/20 px-3 py-1.5 text-sm text-white focus:border-[#F65B1A] focus:outline-none"
              placeholder="custom" />
          </div>
        </div>

        {/* Wallet type badge */}
        {isEOA !== null && (
          <div className={`p-3 text-xs border mb-4 ${
            isEOA ? "border-yellow-500/30 text-yellow-400/80 bg-yellow-500/5" : "border-green-500/30 text-green-400/80 bg-green-500/5"
          }`}>
            {isEOA ? "⚡ Standard wallet — one approval tx required" : "✨ Smart wallet — gasless signature"}
          </div>
        )}

        {/* Permission summary */}
        <div className="bg-white/4 border border-white/10 p-4 text-xs text-white/50 space-y-1 mb-4">
          <div>Agent spends up to <span className="text-white">${limit}/day</span></div>
          <div>Resets every <span className="text-white">24 hours</span></div>
          <div>Expires in <span className="text-white">1 year</span></div>
          <div>PaySpawn fee: <span className="text-[#F65B1A]">Free</span> (zero protocol fees)</div>
        </div>

        {error && (
          <div className="p-3 border border-red-500/30 text-red-400 text-xs mb-4">{error}</div>
        )}

        <button
          onClick={create}
          disabled={loading}
          className={`w-full py-3 text-sm tracking-wider transition-colors ${
            loading ? "bg-white/10 text-white/30 cursor-not-allowed" : "bg-[#F65B1A] text-black hover:bg-[#ff7a3d]"
          }`}
        >
          {loading ? (isEOA ? "Confirm in wallet..." : "Sign...") : "Create Agent Credential"}
        </button>
        <p className="mt-2 text-xs text-white/25 text-center">
          {isEOA ? "One approval tx, ~$0.005 gas on Base" : "Gasless signature, no transaction"}
        </p>
      </div>
    </div>
  );
}

// ─── Transaction History ──────────────────────────────────────────────────────

const PAYMENT_SENT_EVENT = parseAbiItem(
  "event PaymentSent(address indexed from, address indexed to, uint256 amount, uint256 fee)"
);

function TxHistory({ address }: { address: `0x${string}` }) {
  const [txs, setTxs]         = useState<TxEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const publicClient          = usePublicClient();

  const load = useCallback(async () => {
    if (!publicClient || !address) return;
    setLoading(true);
    try {
      const logs = await publicClient.getLogs({
        address: CONTRACTS.PAYSPAWN_SPENDER,
        event:   PAYMENT_SENT_EVENT,
        args:    { from: address },
        fromBlock: BigInt(42000000),
        toBlock:   "latest",
      });
      const events: TxEvent[] = logs.map(l => ({
        txHash:      l.transactionHash as `0x${string}`,
        from:        l.args.from as `0x${string}`,
        to:          l.args.to as `0x${string}`,
        amount:      l.args.amount as bigint,
        fee:         l.args.fee as bigint,
        blockNumber: l.blockNumber as bigint,
      })).reverse();

      // Fetch block timestamps for top 10
      const enriched = await Promise.all(events.slice(0, 20).map(async (e) => {
        try {
          const blk = await publicClient.getBlock({ blockNumber: e.blockNumber });
          return { ...e, timestamp: Number(blk.timestamp) };
        } catch { return e; }
      }));
      setTxs(enriched);
    } catch { setTxs([]); }
    finally { setLoading(false); }
  }, [publicClient, address]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="py-8 text-center text-xs text-white/25">Loading transaction history...</div>
  );

  if (!txs.length) return (
    <div className="py-8 text-center text-xs text-white/25">No transactions yet. Your agents&apos; payments will appear here.</div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10">
            {["Time", "To", "Amount", "Fee", "Tx"].map(h => (
              <th key={h} className="pb-3 text-left text-white/30 tracking-wider uppercase font-light pr-6">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txs.map((tx, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/2 transition-colors">
              <td className="py-3 pr-6 text-white/40">
                {tx.timestamp ? timeAgo(tx.timestamp) : `Block ${tx.blockNumber}`}
              </td>
              <td className="py-3 pr-6 font-mono text-white/60">
                {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
              </td>
              <td className="py-3 pr-6 text-white">${fmt(tx.amount)}</td>
              <td className="py-3 pr-6 text-white/40">${fmt(tx.fee)}</td>
              <td className="py-3">
                <a href={`https://basescan.org/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-[#F65B1A] hover:underline">
                  ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Fund Widget ─────────────────────────────────────────────────────────────

function FundWidget({ address }: { address: `0x${string}` }) {
  const [amount, setAmount] = useState("25");
  const onramp = `https://pay.coinbase.com/buy/select-asset?appId=payspawn&destinationWallets=[{"address":"${address}","blockchains":["base"],"assets":["USDC"]}]&defaultAsset=USDC&defaultNetwork=base&defaultPaymentMethod=CARD&fiatCurrency=USD&presetFiatAmount=${amount}`;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {["10","25","50","100"].map(p => (
        <button key={p} onClick={() => setAmount(p)}
          className={`px-3 py-1.5 text-xs border transition-all ${
            amount === p ? "border-[#F65B1A] text-[#F65B1A]" : "border-white/20 text-white/40 hover:border-white/40"
          }`}>${p}</button>
      ))}
      <a href={onramp} target="_blank" rel="noopener noreferrer"
        className="px-4 py-1.5 bg-[#F65B1A] text-black text-xs font-medium hover:bg-[#ff7a3d] transition-colors">
        Add ${amount} USDC
      </a>
      <a href={`https://app.uniswap.org/swap?outputCurrency=${CONTRACTS.USDC}&chain=base`}
        target="_blank" rel="noopener noreferrer"
        className="px-4 py-1.5 border border-white/20 text-white/50 text-xs hover:border-white/40 transition-colors">
        Swap on Uniswap
      </a>
    </div>
  );
}

// ─── Names Section ────────────────────────────────────────────────────────────

function WalletName({ address }: { address: `0x${string}` }) {
  const [nameInput, setNameInput] = useState("");
  const [registering, setRegistering] = useState(false);

  const { data: walletName } = useReadContract({
    address: CONTRACTS.NAMES, abi: NAMES_ABI, functionName: "nameOf", args: [address],
  });
  const { data: isAvail } = useReadContract({
    address: CONTRACTS.NAMES, abi: NAMES_ABI, functionName: "isAvailable",
    args: [nameInput], query: { enabled: nameInput.length >= 3 },
  });
  const { writeContractAsync: registerName } = useWriteContract();

  const hasName = walletName && walletName.length > 0;

  if (hasName) return (
    <div className="flex items-center gap-2">
      <span className="text-[#F65B1A] font-light">{walletName}.pay</span>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <input
        value={nameInput} onChange={e => setNameInput(e.target.value.toLowerCase())}
        placeholder="claim wallet.pay"
        className="bg-transparent border border-white/20 px-3 py-1.5 text-xs text-white placeholder-white/20 focus:border-[#F65B1A] focus:outline-none w-40"
      />
      {nameInput.length >= 3 && (
        <span className={`text-xs ${isAvail ? "text-green-400" : "text-red-400"}`}>
          {isAvail ? "✓ available" : "✗ taken"}
        </span>
      )}
      {isAvail && nameInput.length >= 3 && (
        <button
          disabled={registering}
          onClick={async () => {
            setRegistering(true);
            try { await registerName({ address: CONTRACTS.NAMES, abi: NAMES_ABI, functionName: "register", args: [nameInput] }); }
            catch { /* silent */ }
            finally { setRegistering(false); }
          }}
          className="px-3 py-1.5 text-xs bg-[#F65B1A] text-black hover:bg-[#ff7a3d] transition-colors"
        >
          {registering ? "..." : "Register"}
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MissionControl() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [agents, setAgents]         = useState<AgentEntry[]>([]);
  const [selected, setSelected]     = useState<string | null>(null); // agent id or "new"
  const [isEOA, setIsEOA]           = useState<boolean | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list"); // mobile nav state

  // USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.USDC, abi: USDC_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Detect EOA vs smart wallet
  useEffect(() => {
    if (!address || !publicClient) return;
    publicClient.getBytecode({ address }).then(code => {
      setIsEOA(!code || code === "0x");
    });
  }, [address, publicClient]);

  // Load agents from localStorage
  useEffect(() => {
    if (!address) { setAgents([]); return; }
    setAgents(loadAgents(address));
  }, [address]);

  const addAgent = useCallback((agent: AgentEntry) => {
    if (!address) return;
    setAgents(prev => {
      const updated = [agent, ...prev];
      saveAgents(address, updated);
      return updated;
    });
    setSelected(agent.id);
  }, [address]);

  const revokeAgent = useCallback((id: string) => {
    if (!address) return;
    setAgents(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, isRevoked: true } : a);
      saveAgents(address, updated);
      return updated;
    });
  }, [address]);

  const deleteAgent = useCallback((id: string) => {
    if (!address) return;
    setAgents(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAgents(address, updated);
      return updated;
    });
    setSelected(null);
    setMobileView("list");
  }, [address]);

  const togglePause = useCallback((id: string) => {
    if (!address) return;
    setAgents(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, isPaused: !a.isPaused } : a);
      saveAgents(address, updated);
      return updated;
    });
  }, [address]);

  const [replaceLabel, setReplaceLabel] = useState("");

  const activeAgents  = agents.filter(a => !a.isRevoked && a.permission.end > Date.now() / 1000);
  const revokedAgents = agents.filter(a =>  a.isRevoked || a.permission.end < Date.now() / 1000);
  const selectedAgent = agents.find(a => a.id === selected) ?? null;

  const totalLimit = activeAgents.reduce((sum, a) => sum + parseFloat(formatUnits(BigInt(a.permission.allowance), 6)), 0);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#F65B1A] selection:text-black">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase font-light hover:opacity-70 transition-opacity">
              <img src="/logo-128.png" alt="PaySpawn" className="w-5 h-5" />
              <span className="hidden sm:inline">PaySpawn</span>
            </Link>
            <span className="text-white/20 text-xs tracking-[0.2em] uppercase">Mission Control</span>
          </div>
          <ConnectButton />
        </div>
      </nav>

      {!isConnected ? (
        // ── Not connected ──
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase mb-4">Mission Control</div>
            <h1 className="text-4xl font-extralight mb-6">Connect your wallet to begin</h1>
            <ConnectButton />
          </div>
        </div>
      ) : (
        <div className="max-w-[1600px] mx-auto px-6 pt-20">

          {/* ── Security Notice: revoke V4 approvals ── */}
          <div className="mt-4 mb-2 border border-yellow-500/40 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-300/80 flex items-start gap-3">
            <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
            <span>
              <strong className="text-yellow-300">Action required:</strong> If you created agents before today, revoke your USDC approval to the old V4 contract{" "}
              (<a href="https://basescan.org/address/0x71FF87e48b3A66549FbC6A30214b11C4b4975bda#writeContract" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-200">0x71FF...bda</a>){" "}
              and old V5 contract{" "}
              (<a href="https://basescan.org/address/0xB079417f0122cB4ff7Aa56d6D5AD49E3d0ECA4bE#writeContract" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-200">0xB079...bE</a>){" "}
              using the USDC contract <em>approve(spender, 0)</em> function. New agents use the fixed contract automatically.
            </span>
          </div>

          {/* ── Wallet Header ── */}
          <div className="border-b border-white/10 py-5">
            {/* Stats: 2-col on mobile, row on desktop */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <div className="text-xs text-white/30 tracking-wider uppercase mb-1">Balance</div>
                <div className="text-xl md:text-2xl font-extralight text-white">
                  ${usdcBalance ? fmt(usdcBalance) : "0.00"}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/30 tracking-wider uppercase mb-1">Active Agents</div>
                <div className="text-xl md:text-2xl font-extralight">
                  {activeAgents.length}
                  <span className="text-sm text-white/30 ml-1">/ {agents.length}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-white/30 tracking-wider uppercase mb-1">Auth / Day</div>
                <div className="text-xl md:text-2xl font-extralight text-[#F65B1A]">
                  ${totalLimit.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/30 tracking-wider uppercase mb-1">.pay Name</div>
                {address && <WalletName address={address} />}
              </div>
            </div>
            {/* Fund row */}
            <div>
              <div className="text-xs text-white/30 tracking-wider uppercase mb-2">Fund Wallet</div>
              {address && <FundWidget address={address} />}
            </div>
          </div>

          {/* ── Main Area: Fleet + Detail ── */}
          {/* Mobile: drill-down (list XOR detail). Desktop: always side-by-side. */}
          <div className="flex border-b border-white/10 min-h-[480px]">

            {/* ── Sidebar: Agent List ── hide on mobile when detail open */}
            <div className={`
              flex-col border-white/10
              ${mobileView === "detail" ? "hidden" : "flex"} 
              w-full md:flex md:w-64 md:flex-shrink-0 md:border-r
            `}>
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs tracking-[0.25em] uppercase text-white/30">Agents</span>
                <button
                  onClick={() => { setSelected("new"); setMobileView("detail"); }}
                  className="text-xs px-3 py-1.5 bg-[#F65B1A] text-black hover:bg-[#ff7a3d] transition-colors"
                >
                  + New Agent
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {agents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
                    <p className="text-xs text-white/25 leading-relaxed">No agents yet. Create your first one.</p>
                    <button
                      onClick={() => { setSelected("new"); setMobileView("detail"); }}
                      className="px-5 py-2 bg-[#F65B1A] text-black text-xs"
                    >
                      Create Agent
                    </button>
                  </div>
                ) : (
                  <>
                    {activeAgents.length > 0 && (
                      <div>
                        <div className="px-5 py-2 text-xs text-white/20 tracking-wider uppercase bg-white/2">Active</div>
                        {activeAgents.map(a => (
                          <AgentCard key={a.id} agent={a} selected={selected === a.id}
                            onClick={() => { setSelected(a.id); setMobileView("detail"); }} />
                        ))}
                      </div>
                    )}
                    {revokedAgents.length > 0 && (
                      <div>
                        <div className="px-5 py-2 text-xs text-white/20 tracking-wider uppercase bg-white/2">Inactive</div>
                        {revokedAgents.map(a => (
                          <AgentCard key={a.id} agent={a} selected={selected === a.id}
                            onClick={() => { setSelected(a.id); setMobileView("detail"); }} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Right Panel: Detail or empty state ── */}
            <div className={`
              flex-col flex-1 overflow-y-auto
              ${mobileView === "detail" ? "flex" : "hidden"} md:flex
            `}>
              {/* Mobile back button */}
              <div className="md:hidden px-5 py-3 border-b border-white/10">
                <button onClick={() => setMobileView("list")}
                  className="text-xs text-white/40 hover:text-white flex items-center gap-2 transition-colors">
                  ← Back to agents
                </button>
              </div>

              {selected === "new" && address ? (
                <AddAgentForm address={address} isEOA={isEOA} initialLabel={replaceLabel}
                  onCreated={(agent) => { addAgent(agent); setReplaceLabel(""); refetchBalance(); setMobileView("detail"); }} />
              ) : selectedAgent ? (
                <AgentDetail agent={selectedAgent}
                  onRevoke={() => { revokeAgent(selectedAgent.id); setSelected(null); setMobileView("list"); }}
                  onDelete={() => deleteAgent(selectedAgent.id)}
                  onReplace={() => { setReplaceLabel(selectedAgent.label); setSelected("new"); }}
                  onPauseToggle={() => togglePause(selectedAgent.id)} />
              ) : (
                /* Desktop empty state */
                <div className="hidden md:flex h-full flex-col items-center justify-center text-center px-8">
                  <div className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase mb-4">Agent Fleet</div>
                  <h2 className="text-2xl font-extralight text-white mb-3">One wallet.<br />Unlimited agents.</h2>
                  <p className="text-white/30 text-sm font-light max-w-xs leading-relaxed mb-6">
                    Each agent gets its own credential with independent spending limits. Revoke any agent instantly.
                  </p>
                  <button onClick={() => setSelected("new")}
                    className="px-6 py-3 bg-[#F65B1A] text-black text-sm hover:bg-[#ff7a3d] transition-colors">
                    Create First Agent
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Transaction History ── */}
          <div className="py-8">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs tracking-[0.3em] uppercase text-white/30">Transaction History</span>
              <span className="hidden sm:block text-xs text-white/20">All payments via PaySpawn</span>
            </div>
            <div className="overflow-x-auto -mx-6 px-6">
              {address && <TxHistory address={address} />}
            </div>
          </div>

          {/* ── How it works ── */}
          <div className="border-t border-white/10 py-10">
            <div className="text-xs tracking-[0.3em] uppercase text-white/20 mb-6">How it works</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/10">
              {[
                { n: "01", t: "One wallet", b: "Connect once. Create unlimited agent credentials, each with independent daily limits and expiry." },
                { n: "02", t: "Agents pay", b: "Drop the credential into any agent. It pays APIs, services, other agents — all within your limits." },
                { n: "03", t: "Full control", b: "Revoke any agent instantly. Limits are enforced on-chain. Compromise is always capped." },
              ].map(({ n, t, b }) => (
                <div key={n} className="bg-black p-6">
                  <div className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase mb-3">{n}</div>
                  <div className="text-base font-extralight text-white mb-2">{t}</div>
                  <p className="text-xs text-white/35 font-light leading-relaxed">{b}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 py-6 flex items-center justify-between text-xs text-white/25">
            <span className="tracking-[0.2em] uppercase">PaySpawn Mission Control</span>
            <div className="flex gap-6 tracking-[0.15em] uppercase">
              <Link href="/docs"      className="hover:text-white transition-colors">Docs</Link>
              <Link href="/dashboard" className="hover:text-white transition-colors">Classic Dashboard</Link>
              <a href="https://basescan.org/address/0x71FF87e48b3A66549FbC6A30214b11C4b4975bda"
                target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Contract
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
