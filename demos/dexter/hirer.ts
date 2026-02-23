/**
 * PaySpawn + Dexter x402 Demo
 *
 * Shows how any agent with a PaySpawn V5.3 credential can call any x402-protected API
 * in a single line — no wallet management, no key exposure, no complexity.
 *
 * Contrast with Dexter's own SDK:
 *   Dexter alone:    const wallet = new EthereumWallet(privateKey); client.fetch(url)
 *   PaySpawn+Dexter: const ps = new PaySpawn(credential);           ps.fetch(url)
 *
 * Usage: PAYSPAWN_CREDENTIAL=<base64> npx ts-node hirer.ts [--verbose]
 */

const DEMO_ENDPOINT = "https://payspawn.ai/api/demo/market-data";
const VERBOSE = process.argv.includes("--verbose");

// Echo Agent V5.3 credential ($10/day, adam.pay → fee_collector)
const CREDENTIAL =
  process.env.PAYSPAWN_CREDENTIAL ||
  "eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHhhYThlNjgxNWIwRThhMzAwNkRFZTBjMzE3MUNmOUNBMTY1ZmQ4NjJlIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIxMDAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYzNDA5LCJlbmQiOjE4MDMzOTk0NjksInNhbHQiOiI3ODYzODU4ODE5MjMwNDAwMDAiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0=";

// Colors
const c = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  orange: "\x1b[38;5;208m",
  green: "\x1b[32m",
  cyan:  "\x1b[36m",
  red:   "\x1b[31m",
  yellow: "\x1b[33m",
  white: "\x1b[97m",
};

function log(msg: string) { process.stdout.write(msg + "\n"); }
function dim(msg: string) { log(`${c.dim}${msg}${c.reset}`); }
function step(n: number, msg: string) {
  log(`\n${c.bold}${c.orange}[${n}]${c.reset} ${c.white}${msg}${c.reset}`);
}
function ok(msg: string) { log(`${c.green}  ✓ ${msg}${c.reset}`); }
function info(msg: string) { log(`${c.cyan}  → ${msg}${c.reset}`); }
function err(msg: string) { log(`${c.red}  ✗ ${msg}${c.reset}`); }
function box(lines: string[]) {
  const width = Math.max(...lines.map(l => stripAnsi(l).length)) + 4;
  const bar = "─".repeat(width);
  log(`  ┌${bar}┐`);
  for (const line of lines) {
    const pad = width - stripAnsi(line).length - 2;
    log(`  │ ${line}${" ".repeat(pad)} │`);
  }
  log(`  └${bar}┘`);
}

function stripAnsi(s: string) { return s.replace(/\x1b\[[0-9;]*m/g, ""); }

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Section 1: WITHOUT PaySpawn (Dexter alone) ──────────────────────────────

async function demoWithoutPaySpawn() {
  log(`\n${c.bold}${c.red}━━ WITHOUT PAYSPAWN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log(`${c.dim}Using raw x402 fetch — agent must manage its own wallet${c.reset}\n`);

  dim(`  // Agent needs a private key in its environment`);
  dim(`  // If this key leaks → wallet is drained`);
  dim(`  // No spending limits, no revocation, no audit trail`);
  log("");
  dim(`  import { wrapFetch } from '@dexterai/x402/client';`);
  dim(`  `);
  dim(`  const x402Fetch = wrapFetch(fetch, {`);
  dim(`    walletPrivateKey: process.env.AGENT_PRIVATE_KEY,  // ← 🔑 danger`);
  dim(`    rpcUrl: process.env.BASE_RPC_URL,`);
  dim(`  });`);
  log("");

  await sleep(800);
  
  log(`  ${c.yellow}Calling ${DEMO_ENDPOINT}...${c.reset}`);
  
  // Actually call the endpoint WITHOUT a payment header to show the 402
  const res = await fetch(DEMO_ENDPOINT);
  
  if (res.status === 402) {
    const body = await res.json() as any;
    const reqHeader = res.headers.get("x-payment-required") || res.headers.get("payment-required");

    err(`402 Payment Required — agent is stuck`);
    info(`price:   $${body.price} ${body.currency}`);
    info(`payTo:   ${body.payTo}`);
    info(`network: ${body.network}`);
    
    log("");
    log(`  ${c.red}${c.bold}Problem:${c.reset}${c.red} agent must sign a Base transaction — needs a live wallet`);
    log(`  ${c.red}Private key in env → leaked key = drained wallet${c.reset}`);
    log(`  ${c.red}No limits: one bad actor drains everything${c.reset}`);
    log(`  ${c.red}No revocation: can't stop a rogue agent${c.reset}`);

    if (VERBOSE && reqHeader) {
      log(`\n  ${c.dim}PAYMENT-REQUIRED header:${c.reset}`);
      try {
        const decoded = JSON.parse(Buffer.from(reqHeader, "base64").toString("utf-8"));
        log(`  ${c.dim}${JSON.stringify(decoded, null, 2).split("\n").join("\n  ")}${c.reset}`);
      } catch {
        log(`  ${c.dim}${reqHeader}${c.reset}`);
      }
    }
  } else {
    log(`  ${c.yellow}Unexpected status: ${res.status}${c.reset}`);
  }
}

// ── Section 2: WITH PaySpawn V5.3 ───────────────────────────────────────────

async function demoWithPaySpawn() {
  log(`\n${c.bold}${c.orange}━━ WITH PAYSPAWN V5.3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log(`${c.dim}Agent holds a credential string — no wallet, no keys${c.reset}\n`);

  dim(`  import PaySpawn from '@payspawn/sdk';`);
  dim(`  `);
  dim(`  const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL);`);
  dim(`  `);
  dim(`  // That's it. ps.fetch() handles: 402 → pay on-chain → retry`);
  dim(`  const result = await ps.fetch('${DEMO_ENDPOINT}');`);
  log("");
  
  await sleep(600);

  // Decode credential for display
  const decoded = JSON.parse(Buffer.from(CREDENTIAL, "base64").toString("utf-8"));
  const perm = decoded.permission;
  const dailyLimit = (Number(perm.allowance) / 1e6).toFixed(2);
  const expiresDate = new Date(perm.end * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  step(1, "Credential loaded");
  ok(`wallet:      ${perm.account}`);
  ok(`spender:     V5.3 contract (${perm.spender.slice(0, 10)}...)`);
  ok(`daily limit: $${dailyLimit} USDC`);
  ok(`expires:     ${expiresDate}`);
  ok(`controls:    maxPerTx=$${Number(perm.maxPerTx)/1e6 || "unlimited"}, allowedTo=${perm.allowedTo?.length ? perm.allowedTo.join(",") : "any"}`);

  step(2, `Calling ${DEMO_ENDPOINT}`);
  info("initial GET request...");

  const initial = await fetch(DEMO_ENDPOINT);
  info(`response: ${initial.status} ${initial.status === 402 ? "Payment Required" : "OK"}`);

  if (initial.status !== 402) {
    err("Expected 402, got something else. Endpoint may be unreachable.");
    return;
  }

  step(3, "Got 402 — PaySpawn pays via relayer → V5.3 contract on-chain");
  info(`POST https://payspawn.ai/api/x402  { credential, url }`);

  const startTime = Date.now();
  
  const fetchRes = await fetch("https://payspawn.ai/api/x402", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: CREDENTIAL,
      url: DEMO_ENDPOINT,
      method: "GET",
    }),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const result = await fetchRes.json() as any;

  if (!fetchRes.ok || result.error) {
    err(`Payment failed: ${result.error || fetchRes.status}`);
    if (VERBOSE) log(`  ${c.dim}${JSON.stringify(result, null, 2)}${c.reset}`);
    return;
  }

  step(4, `Paid ✓  ${elapsed}s`);

  if (result.payment) {
    const p = result.payment;
    ok(`amount:    $${p.recipientReceives} USDC`);
    ok(`fee:       $${p.fee} USDC`);
    ok(`total:     $${p.totalCharged} USDC`);
    ok(`txHash:    ${p.txHash}`);
    ok(`Basescan:  ${p.explorer}`);
  }

  step(5, "Server response (market data)");

  if (result.data) {
    const data = result.data;
    box([
      `${c.orange}${c.bold}MARKET DATA — PaySpawn x402${c.reset}`,
      `${c.dim}─────────────────────────────────────${c.reset}`,
      `${c.white}USDC:     ${c.green}$${data.market?.USDC?.price}${c.reset}`,
      `${c.white}ETH:      ${c.green}$${data.market?.ETH?.price}  ${c.dim}(${data.market?.ETH?.change24h > 0 ? "+" : ""}${data.market?.ETH?.change24h}% 24h)${c.reset}`,
      `${c.white}timestamp: ${c.dim}${data.timestamp}${c.reset}`,
      `${c.white}protocol:  ${c.cyan}${data.protocol?.name} ${data.protocol?.version}${c.reset}`,
    ]);
  }

  step(6, "On-chain proof");
  if (result.payment?.txHash) {
    log(`\n  ${c.bold}${c.orange}PaymentExecutedV5 event on Base:${c.reset}`);
    log(`  ${c.cyan}https://basescan.org/tx/${result.payment.txHash}${c.reset}`);
    log(`\n  ${c.dim}contract: V5.3 (0xaa8e...d862e)${c.reset}`);
    log(`  ${c.dim}spender:  ${perm.spender}${c.reset}`);
    log(`  ${c.dim}from:     ${perm.account}  (adam.pay)${c.reset}`);
    log(`  ${c.dim}to:       ${result.payment.recipient}  (fee_collector)${c.reset}`);
    log(`  ${c.dim}amount:   $${result.payment.recipientReceives} USDC${c.reset}`);
    log(`  ${c.dim}fee:      $${result.payment.fee} USDC (PaySpawn)${c.reset}`);
  }

  log(`\n${c.bold}${c.green}━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log("");
  box([
    `${c.bold}${c.white}  Dexter alone             PaySpawn + Dexter${c.reset}`,
    `${c.dim}  ───────────────────────  ─────────────────────────────${c.reset}`,
    `${c.red}  needs private key        ${c.green}credential string (no key)${c.reset}`,
    `${c.red}  no spending limits       ${c.green}$${dailyLimit}/day cap, on-chain${c.reset}`,
    `${c.red}  no revocation            ${c.green}pause any time, instantly${c.reset}`,
    `${c.red}  leaked key = full drain  ${c.green}math enforces limits${c.reset}`,
    `${c.white}  client.fetch(url)        ${c.green}ps.fetch(url)  [same API]${c.reset}`,
  ]);
  log("");
  log(`  ${c.dim}Math doesn't negotiate.${c.reset}`);
  log(`  ${c.dim}payspawn.ai  ·  V5.3  ·  Base mainnet${c.reset}`);
  log("");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("");
  log(`${c.bold}${c.orange}╔═══════════════════════════════════════════════════════════════╗${c.reset}`);
  log(`${c.bold}${c.orange}║              PAYSPAWN + DEXTER x402 DEMO                      ║${c.reset}`);
  log(`${c.bold}${c.orange}║         Any x402 API. One credential. No keys.                ║${c.reset}`);
  log(`${c.bold}${c.orange}╚═══════════════════════════════════════════════════════════════╝${c.reset}`);
  log(`  ${c.dim}endpoint: ${DEMO_ENDPOINT}${c.reset}`);
  log(`  ${c.dim}protocol: x402 exact/base/USDC  ·  V5.3 contract${c.reset}`);

  await demoWithoutPaySpawn();
  await sleep(1200);
  await demoWithPaySpawn();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
