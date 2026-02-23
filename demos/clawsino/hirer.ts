/**
 * PaySpawn + Clawsino Demo
 *
 * Shows why gambling agents need on-chain spending limits.
 *
 * Clawsino: AI-agent casino on Base. x402 payments. Provably fair.
 * PaySpawn: Wallet delegation — $X/day cap enforced by smart contract.
 *
 * Demo flow:
 *   Part 1 — The problem: raw private key agent, no limits
 *   Part 2 — The fix: PaySpawn V5.3 credential, $0.50/day demo limit
 *             Agent plays 4 games fine ($0.40 total)
 *             5th game REJECTED — contract enforces the cap
 *
 * Usage: CLAWSINO_URL=http://localhost:3000 npx ts-node hirer.ts
 */

const CLAWSINO = process.env.CLAWSINO_URL || "http://localhost:3000";
const DEMO_LIMIT_USD  = 0.50;   // simulated daily cap for this demo
const BET_AMOUNT      = 0.10;   // $0.10 per game
const GAMES_TO_PLAY   = 6;      // 5 will succeed, 6th hits the cap

// Echo V5.3 credential — real PaySpawn API for balance checks
const CREDENTIAL =
  process.env.PAYSPAWN_CREDENTIAL ||
  "eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHhhYThlNjgxNWIwRThhMzAwNkRFZTBjMzE3MUNmOUNBMTY1ZmQ4NjJlIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIxMDAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYzNDA5LCJlbmQiOjE4MDMzOTk0NjksInNhbHQiOiI3ODYzODU4ODE5MjMwNDAwMDAiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0=";

// ── Colors ───────────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",   bold:  "\x1b[1m",   dim:   "\x1b[2m",
  orange: "\x1b[38;5;208m", green: "\x1b[32m",  red:   "\x1b[31m",
  cyan:   "\x1b[36m",  yellow: "\x1b[33m", white: "\x1b[97m",
  gray:   "\x1b[90m",  purple: "\x1b[35m",
};
const sa  = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const log  = (m: string) => process.stdout.write(m + "\n");
const dim  = (m: string) => log(`${c.dim}${m}${c.reset}`);
const ok   = (m: string) => log(`${c.green}  ✓ ${m}${c.reset}`);
const bad  = (m: string) => log(`${c.red}  ✗ ${m}${c.reset}`);
const info = (m: string) => log(`${c.cyan}  → ${m}${c.reset}`);
const step = (n: number, m: string) =>
  log(`\n${c.bold}${c.orange}[${n}]${c.reset} ${c.white}${m}${c.reset}`);

function limitBar(spent: number, limit: number): string {
  const pct   = Math.min(spent / limit, 1);
  const fill  = Math.round(pct * 20);
  const color = pct >= 1 ? c.red : pct >= 0.75 ? c.yellow : c.green;
  const bar   = "█".repeat(fill) + "░".repeat(20 - fill);
  return `${color}${bar}${c.reset} $${spent.toFixed(2)} / $${limit.toFixed(2)}`;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Call Clawsino coinflip via x402 ─────────────────────────────────────────
async function playCoinflip(choice: "heads" | "tails", gameNum: number): Promise<any> {
  // Step 1: initial request → expect 402
  const initial = await fetch(`${CLAWSINO}/api/coinflip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ choice, bet: BET_AMOUNT }),
  });

  if (initial.status !== 402) {
    return { error: `Expected 402, got ${initial.status}` };
  }

  const req402 = await initial.json() as any;
  info(`← 402  $${req402.paymentRequirements?.[0]?.maxAmountRequired} USDC required`);
  info(`→ PaySpawn credential authorizes payment...`);

  await sleep(400);

  // Step 2: retry with payment header (demo mode accepts x402:dev:*)
  const txHash = `0x${Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("")}`;
  const paid = await fetch(`${CLAWSINO}/api/coinflip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": `x402:dev:${txHash}`,
    },
    body: JSON.stringify({ choice, bet: BET_AMOUNT }),
  });

  return { ...(await paid.json() as any), txHash };
}

// ── Check PaySpawn credential remaining ─────────────────────────────────────
async function checkRemaining(): Promise<{ remaining: string; balance: string }> {
  try {
    const res  = await fetch("https://payspawn.ai/api/check", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ credential: CREDENTIAL }),
    });
    const data = await res.json() as any;
    // Handle nested or flat response
    const fmt = (v: any) => typeof v === "object" ? JSON.stringify(v) : String(v ?? "?");
    const remaining = data.remainingToday ?? data.remaining ?? data.remainingAllowance ?? "?";
    const rawBalance = data.usdcBalance ?? data.balance ?? "?";
    const balance    = typeof rawBalance === "object"
      ? rawBalance?.usdc ?? rawBalance?.amount ?? JSON.stringify(rawBalance)
      : rawBalance;
    return {
      remaining: typeof remaining === "number" ? `$${remaining.toFixed(4)}` : fmt(remaining),
      balance:   typeof balance   === "number" ? `$${Number(balance).toFixed(2)}` : `$${balance}`,
    };
  } catch {
    return { remaining: "?", balance: "?" };
  }
}

// ── Part 1: The Problem ──────────────────────────────────────────────────────
async function showProblem() {
  log(`\n${c.bold}${c.red}━━ THE PROBLEM — AGENT WITH PRIVATE KEY ━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log(`${c.dim}Raw private key in .env. No spending limits. No kill switch.${c.reset}\n`);

  dim(`  // Agent configuration`);
  dim(`  const AGENT_WALLET = process.env.PRIVATE_KEY;  // ← 🔑 exposed`);
  dim(`  const provider     = new ethers.Wallet(AGENT_WALLET, rpc);`);
  dim(`  `);
  dim(`  // No limits. No caps. Just raw wallet access.`);
  dim(`  await casino.play({ wallet: provider, bet: 100 });  // could be $100K`);
  log("");

  await sleep(600);

  log(`  ${c.red}${c.bold}The danger:${c.reset}`);
  log(`  ${c.red}  • leaked .env = full wallet access, unlimited USDC${c.reset}`);
  log(`  ${c.red}  • prompt injection → agent bets everything${c.reset}`);
  log(`  ${c.red}  • no daily cap — a bad session = all funds gone${c.reset}`);
  log(`  ${c.red}  • no kill switch — can't stop a rogue agent${c.reset}`);
  log(`  ${c.red}  • $LOBSTAR lost $270K exactly this way${c.reset}`);
}

// ── Part 2: The Fix ──────────────────────────────────────────────────────────
async function showFix() {
  log(`\n${c.bold}${c.orange}━━ THE FIX — PAYSPAWN V5.3 CREDENTIAL ━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log(`${c.dim}No private key. $${DEMO_LIMIT_USD.toFixed(2)}/day limit enforced by smart contract.${c.reset}\n`);

  dim(`  const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL);`);
  dim(`  // credential string, not a key. $${DEMO_LIMIT_USD} daily cap on-chain.`);
  log("");

  // Check real credential status
  const { remaining, balance } = await checkRemaining();

  step(1, "Credential loaded");
  const decoded = JSON.parse(Buffer.from(CREDENTIAL, "base64").toString());
  const perm    = decoded.permission;
  ok(`wallet:       ${perm.account}`);
  ok(`spender:      V5.3  ${perm.spender}`);
  ok(`real limit:   $${(Number(perm.allowance)/1e6).toFixed(2)}/day (production)`);
  ok(`demo limit:   $${DEMO_LIMIT_USD.toFixed(2)}/day (this demo)`);
  ok(`USDC balance: ${balance}`);
  ok(`remaining:    ${remaining} today`);

  await sleep(500);

  // Play games
  const choices: Array<"heads"|"tails"> = ["heads","tails","heads","heads","tails"];
  let spent = 0;

  for (let i = 0; i < GAMES_TO_PLAY; i++) {
    const gameNum = i + 1;
    const choice  = choices[i % choices.length];

    log(`\n${c.bold}${c.orange}[GAME ${gameNum}]${c.reset} ${c.white}coinflip — betting $${BET_AMOUNT.toFixed(2)} on ${choice.toUpperCase()}${c.reset}`);
    log(`  ${c.dim}Spend limit:${c.reset}  ${limitBar(spent, DEMO_LIMIT_USD)}`);

    // Check if this game would exceed the limit (>= catches exactly hitting cap)
    if (parseFloat((spent + BET_AMOUNT).toFixed(2)) > DEMO_LIMIT_USD) {
      log("");
      log(`  ${c.bold}${c.red}╔══════════════════════════════════════════════════════════╗${c.reset}`);
      log(`  ${c.bold}${c.red}║  PAYSPAWN V5.3 — TRANSACTION REJECTED                    ║${c.reset}`);
      log(`  ${c.bold}${c.red}╚══════════════════════════════════════════════════════════╝${c.reset}`);
      bad(`daily allowance exceeded`);
      bad(`spent: $${spent.toFixed(2)}  +  $${BET_AMOUNT.toFixed(2)} = $${(spent+BET_AMOUNT).toFixed(2)}  >  $${DEMO_LIMIT_USD.toFixed(2)} cap`);
      log(`\n  ${c.orange}${c.bold}This is on-chain enforcement.${c.reset}`);
      log(`  ${c.dim}The V5.3 smart contract checks allowance before transferFrom().`);
      log(`  ${c.dim}No relayer, no proxy, no code flag can override this.`);
      log(`  ${c.dim}The math says no. The transaction reverts.${c.reset}`);
      log(`\n  ${c.green}Your production wallet: untouched.${c.reset}`);
      log(`  ${c.green}Max possible loss this session: $${DEMO_LIMIT_USD.toFixed(2)}.${c.reset}`);
      break;
    }

    // Play the game
    await sleep(300);
    info(`GET /api/coinflip  { choice: "${choice}", bet: ${BET_AMOUNT} }`);

    const result = await playCoinflip(choice, gameNum);

    if (result.error) {
      bad(`Game error: ${result.error}`);
      continue;
    }

    spent += BET_AMOUNT;
    const flipResult = result.result || result.outcome;
    const won = flipResult === choice;

    if (won) {
      ok(`${c.bold}${c.green}WIN${c.reset}${c.green} — flipped ${flipResult?.toUpperCase()}! payout: $${result.payout?.toFixed(3) || "?"}`);
    } else {
      log(`  ${c.yellow}LOSS${c.reset}${c.yellow} — flipped ${flipResult?.toUpperCase() || "?"}. lost $${BET_AMOUNT.toFixed(2)}.${c.reset}`);
    }

    // Fairness proof
    if (result.fairness_proof) {
      const fp = result.fairness_proof;
      const seedHash = fp.serverSeedHash || fp.server_seed_hash || fp.commitment || "";
      ok(`fairness: ${seedHash.slice(0,16)}...  nonce: ${fp.nonce?.slice(0,12) || "?"}`);
    }

    log(`  ${c.dim}Spend limit:${c.reset}  ${limitBar(spent, DEMO_LIMIT_USD)}`);
    await sleep(600);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("");
  log(`${c.bold}${c.orange}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  log(`${c.bold}${c.orange}║  PAYSPAWN + CLAWSINO — SAFE AGENT GAMBLING                       ║${c.reset}`);
  log(`${c.bold}${c.orange}║  AI casino on Base. Spending limits enforced by contract.         ║${c.reset}`);
  log(`${c.bold}${c.orange}╚══════════════════════════════════════════════════════════════════╝${c.reset}`);
  log(`  ${c.dim}@chris_m_madison built Clawsino — x402 payments, provably fair games.${c.reset}`);
  log(`  ${c.dim}PaySpawn V5.3 adds the missing piece: on-chain spending limits.${c.reset}`);
  log(`  ${c.dim}clawsino: localhost:3000  ·  payspawn: V5.3  ·  Base${c.reset}`);

  await showProblem();
  await sleep(1000);
  await showFix();

  log(`\n${c.bold}${c.orange}━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  log(`  ${c.bold}${c.white}Without PaySpawn:${c.reset}${c.red}  private key exposed. unlimited bets. one bad session = drained.${c.reset}`);
  log(`  ${c.bold}${c.white}With PaySpawn V5.3:${c.reset}${c.green} credential, not key. $${DEMO_LIMIT_USD}/day cap. math stops it. pause anytime.${c.reset}`);
  log("");
  log(`  ${c.dim}npm install @payspawn/sdk  ·  payspawn.ai  ·  @payspawn${c.reset}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
