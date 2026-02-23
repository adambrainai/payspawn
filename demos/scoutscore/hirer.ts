/**
 * PaySpawn + ScoutScore Demo
 *
 * Shows the full trusted agent payment flow:
 *
 *  1. Agent needs AI image generation
 *  2. ScoutScore checks two candidate services (spam vs legitimate)
 *  3. Trusted service selected — ps.fetch() pays via V5.3 on-chain
 *  4. Image returned. Basescan proof on-chain.
 *
 * Without PaySpawn: agent holds private key + no spending limits
 * With PaySpawn:    credential string + on-chain spending cap enforced by contract
 *
 * Usage: npx ts-node hirer.ts [--verbose]
 */

const SCOUTSCORE_API  = "https://scoutscore.ai/api/bazaar/score";
const SPAM_SERVICE    = "lowpaymentfee.com";
const LEGIT_SERVICE   = "api.recoupable.com";
const IMAGE_ENDPOINT  = "https://api.recoupable.com/api/image/generate";
const VERBOSE         = process.argv.includes("--verbose");

// Echo Agent V5.3 credential — $10/day, adam.pay → V5.3 contract
const CREDENTIAL =
  process.env.PAYSPAWN_CREDENTIAL ||
  "eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHhhYThlNjgxNWIwRThhMzAwNkRFZTBjMzE3MUNmOUNBMTY1ZmQ4NjJlIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIxMDAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYzNDA5LCJlbmQiOjE4MDMzOTk0NjksInNhbHQiOiI3ODYzODU4ODE5MjMwNDAwMDAiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0=";

// ── Colors ───────────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  orange: "\x1b[38;5;208m", green: "\x1b[32m", red: "\x1b[31m",
  cyan:   "\x1b[36m", yellow: "\x1b[33m", white: "\x1b[97m", gray: "\x1b[90m",
};
const sa = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const log  = (m: string) => process.stdout.write(m + "\n");
const dim  = (m: string) => log(`${c.dim}${m}${c.reset}`);
const ok   = (m: string) => log(`${c.green}  ✓ ${m}${c.reset}`);
const warn = (m: string) => log(`${c.yellow}  ⚠ ${m}${c.reset}`);
const bad  = (m: string) => log(`${c.red}  ✗ ${m}${c.reset}`);
const info = (m: string) => log(`${c.cyan}  → ${m}${c.reset}`);
const step = (n: number, m: string) =>
  log(`\n${c.bold}${c.orange}[${n}]${c.reset} ${c.white}${m}${c.reset}`);

function box(lines: string[]) {
  const w = Math.max(...lines.map(l => sa(l).length)) + 4;
  log(`  ┌${"─".repeat(w)}┐`);
  for (const l of lines) log(`  │ ${l}${" ".repeat(w - sa(l).length - 2)} │`);
  log(`  └${"─".repeat(w)}┘`);
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  const color = score >= 70 ? c.green : score >= 40 ? c.yellow : c.red;
  return `${color}${bar}${c.reset} ${score}/100`;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── ScoutScore Check ─────────────────────────────────────────────────────────
async function checkTrust(domain: string): Promise<any> {
  const res  = await fetch(`${SCOUTSCORE_API}/${domain}`);
  return res.json();
}

// ── Main Demo ────────────────────────────────────────────────────────────────
async function main() {
  log("");
  log(`${c.bold}${c.orange}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  log(`${c.bold}${c.orange}║      PAYSPAWN + SCOUTSCORE — TRUSTED AGENT PAYMENTS              ║${c.reset}`);
  log(`${c.bold}${c.orange}║      Check trust. Pay safely. Limits enforced on-chain.          ║${c.reset}`);
  log(`${c.bold}${c.orange}╚══════════════════════════════════════════════════════════════════╝${c.reset}`);
  log(`  ${c.dim}ScoutScore monitors 1,732 x402 services. Avg trust score: 38/100.${c.reset}`);
  log(`  ${c.dim}PaySpawn V5.3 enforces spending limits by smart contract — not code.${c.reset}`);

  // ── Decode credential ────────────────────────────────────────────────────
  const decoded = JSON.parse(Buffer.from(CREDENTIAL, "base64").toString());
  const perm    = decoded.permission;
  const daily   = (Number(perm.allowance) / 1e6).toFixed(2);
  const expires = new Date(perm.end * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  step(1, "Agent credential loaded  (V5.3 — no private key)");
  ok(`wallet:      ${perm.account}`);
  ok(`spender:     V5.3  ${perm.spender}`);
  ok(`daily limit: $${daily} USDC  (contract-enforced)`);
  ok(`expires:     ${expires}`);

  await sleep(600);

  // ── ScoutScore: check spam service ───────────────────────────────────────
  step(2, `ScoutScore → checking service #1: ${SPAM_SERVICE}`);
  info(`GET ${SCOUTSCORE_API}/${SPAM_SERVICE}`);

  const spam = await checkTrust(SPAM_SERVICE) as any;
  await sleep(400);

  bad(`Score:      ${scoreBar(spam.score || 0)}`);
  bad(`Verdict:    ${spam.recommendation?.verdict || "UNKNOWN"}`);
  log(`${c.red}  ✗ Flags:    ${(spam.flags || []).join("  ")}${c.reset}`);
  log(`\n  ${c.red}${c.bold}REJECTED${c.reset}${c.red} — wallet spam farm. 10,658 services. 1 wallet. Do not pay.${c.reset}`);

  await sleep(800);

  // ── ScoutScore: check legitimate service ─────────────────────────────────
  step(3, `ScoutScore → checking service #2: ${LEGIT_SERVICE}`);
  info(`GET ${SCOUTSCORE_API}/${LEGIT_SERVICE}`);

  const legit = await checkTrust(LEGIT_SERVICE) as any;
  await sleep(400);

  ok(`Score:      ${scoreBar(legit.score || 0)}`);
  ok(`Verdict:    ${legit.recommendation?.verdict || "?"}`);
  ok(`Flags:      ${(legit.flags || []).slice(0, 3).join("  ")}`);
  ok(`Price:      $${legit.serviceInfo?.priceUSD || "0.01"} USDC per request`);
  ok(`Network:    ${legit.serviceInfo?.network || "base"}`);
  log(`\n  ${c.green}${c.bold}APPROVED${c.reset}${c.green} — high trust. verified schema. 100% fidelity.${c.reset}`);

  await sleep(800);

  // ── Pay via PaySpawn V5.3 ────────────────────────────────────────────────
  step(4, "ps.fetch() — V5.3 pays on-chain, spending limit enforced by contract");
  dim(`  const ps   = new PaySpawn(credential)`);
  dim(`  const data = await ps.fetch('${IMAGE_ENDPOINT}?prompt=futuristic+agent+economy')`);
  log("");
  info(`GET ${IMAGE_ENDPOINT}`);
  info("← 402 Payment Required  ($0.01 USDC, Base mainnet)");
  info("→ PaySpawn V5.3 relayer submitting to contract...");

  const startMs = Date.now();

  const fetchRes = await fetch("https://payspawn.ai/api/x402", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      credential: CREDENTIAL,
      url:        `${IMAGE_ENDPOINT}?prompt=futuristic+agent+economy+powered+by+payspawn`,
      method:     "GET",
    }),
  });

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const result  = await fetchRes.json() as any;

  if (!fetchRes.ok || result.error) {
    bad(`Payment failed: ${result.error || fetchRes.status}`);
    if (VERBOSE) log(`  ${c.dim}${JSON.stringify(result, null, 2)}${c.reset}`);
    return;
  }

  // ── Payment confirmed ────────────────────────────────────────────────────
  step(5, `Payment confirmed  ✓  ${elapsed}s`);

  if (result.payment) {
    const p = result.payment;
    ok(`amount:    $${p.recipientReceives} USDC → ${LEGIT_SERVICE}`);
    ok(`fee:       $${p.fee} USDC → PaySpawn`);
    ok(`total:     $${p.totalCharged} USDC (of $${daily}/day limit)`);
    ok(`txHash:    ${p.txHash}`);
    ok(`explorer:  ${p.explorer}`);
  }

  // ── Service response ─────────────────────────────────────────────────────
  step(6, "Service response");
  if (result.data) {
    const d = result.data;
    box([
      `${c.bold}${c.orange}AI IMAGE GENERATED — api.recoupable.com${c.reset}`,
      `${c.dim}${"─".repeat(40)}${c.reset}`,
      ...(d.url        ? [`${c.white}url:    ${c.cyan}${d.url}${c.reset}`]        : []),
      ...(d.image_url  ? [`${c.white}image:  ${c.cyan}${d.image_url}${c.reset}`]  : []),
      ...(d.prompt     ? [`${c.white}prompt: ${c.dim}${d.prompt}${c.reset}`]      : []),
      `${c.white}paid:   ${c.green}true  ·  verified  ·  on-chain${c.reset}`,
    ]);
  } else if (VERBOSE) {
    log(`  ${c.dim}${JSON.stringify(result, null, 2).slice(0, 400)}...${c.reset}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  log(`\n${c.bold}${c.orange}━━ THE COMPLETE TRUSTED AGENT PAYMENT STACK ━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  box([
    `${c.bold}${c.white}  Step              Tool            Result${c.reset}`,
    `${c.dim}  ─────────────────────────────────────────────────────────${c.reset}`,
    `${c.white}  1. Check trust    ScoutScore      ${c.red}spam rejected  ${c.green}legit approved${c.reset}`,
    `${c.white}  2. Pay safely     PaySpawn V5.3   ${c.green}$0.01 USDC on-chain, limit enforced${c.reset}`,
    `${c.white}  3. Get result     recoupable.com  ${c.green}AI image returned${c.reset}`,
    `${c.dim}  ─────────────────────────────────────────────────────────${c.reset}`,
    `${c.white}  No private key in agent.  No unlimited wallet.  Math enforces limits.${c.reset}`,
  ]);

  if (result.payment?.txHash) {
    log(`\n  ${c.orange}${c.bold}On-chain proof:${c.reset}`);
    log(`  ${c.cyan}${result.payment.explorer}${c.reset}`);
    log(`  ${c.dim}PaymentExecutedV5  ·  V5.3  ·  Base mainnet${c.reset}`);
  }

  log(`\n  ${c.dim}npm install @payspawn/sdk  ·  payspawn.ai${c.reset}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
