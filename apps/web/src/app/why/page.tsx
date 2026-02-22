import Link from "next/link";

export const metadata = {
  title: "Why PaySpawn | The Wallet Layer for the Agent Economy",
  description: "x402 is the payment rail. PaySpawn is the wallet your agent uses to ride it. One wallet, unlimited agents, fleet-ready from day one.",
};

export default function WhyPage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#F65B1A] selection:text-black">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4 md:py-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 md:gap-3 text-xs md:text-sm tracking-[0.2em] md:tracking-[0.3em] uppercase font-light">
            <img src="/logo-128.png" alt="PaySpawn" className="w-6 h-6 md:w-8 md:h-8" />
            <span>PaySpawn</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4 md:gap-8 text-xs md:text-sm">
            <Link href="/why" className="text-[#F65B1A]">Why</Link>
            <Link href="/docs" className="text-white/60 hover:text-white transition-colors">Docs</Link>
            <Link href="/dashboard" className="border border-white/20 px-3 py-1.5 md:px-4 md:py-2 hover:bg-white hover:text-black transition-all">
              Launch
            </Link>
          </div>
        </div>
      </nav>

      <article className="pt-32 pb-24 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <header className="mb-16">
            <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Why PaySpawn</span>
            <h1 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)] leading-tight">
              The wallet layer<br />the agent economy was missing.
            </h1>
            <p className="mt-4 text-white/40 font-light italic">Three problems. One answer.</p>
          </header>

          <div className="prose prose-invert prose-lg max-w-none">

            {/* ── The Moment ── */}
            <div className="border-l-2 border-[#F65B1A] pl-6 mb-16">
              <p className="text-white/80 font-light leading-relaxed text-lg">
                HTTP 402 has been dormant for 30 years. A placeholder in the spec — &ldquo;Payment Required&rdquo; — that nobody ever used.
              </p>
              <p className="text-white/60 font-light leading-relaxed mt-4">
                Then Stripe launched x402 on Base. Coinbase built for it simultaneously. In 10 days, a dormant protocol became a standards war. The agent economy now has a payment rail.
              </p>
              <p className="text-white/60 font-light leading-relaxed mt-4">
                The infrastructure around it is being built right now, in real time. PaySpawn is the wallet layer.
              </p>
            </div>

            {/* ── Problem 1: The Key Problem ── */}
            <h2 className="text-2xl font-light text-white mt-16 mb-6 font-[family-name:var(--font-exo2)]">
              Problem 1: The Key Problem
            </h2>

            <p className="text-white/70 font-light leading-relaxed">
              There&apos;s a moment every builder hits when working with AI agents.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              You&apos;ve got your agent running. It can browse, reason, execute. You want it to actually <em className="text-white">do</em> something in the real world — buy compute, pay for an API, purchase data.
            </p>

            <p className="text-white/70 font-light leading-relaxed font-[family-name:var(--font-exo2)] text-xl my-8">
              <strong className="text-white">And you realize: your agent has no money.</strong>
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              The first thing everyone tries: just give it a private key. Create a wallet. Fund it. Paste the key into the agent&apos;s environment.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              It works. For about five minutes, you feel like a genius.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              Then you think about it more. That key is sitting in plaintext on a server somewhere. Maybe in a <code className="text-[#F65B1A] bg-white/5 px-2 py-1">.env</code> file. Maybe in the logs. Your agent can do anything with that key — drain the whole wallet, send funds anywhere. No limits. No oversight. If something goes wrong, everything is gone.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              So you look for alternatives. Custodial services. &ldquo;Deposit funds with us, we handle payments.&rdquo; Cool — now you&apos;re trusting a startup with your money. Their security. Their uptime. Their terms of service.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              You&apos;ve traded one risk for another.
            </p>

            <div className="my-8 border border-white/10 p-6 bg-white/[0.02]">
              <p className="text-white font-light text-lg font-[family-name:var(--font-exo2)]">
                Agents don&apos;t need private keys. They need spending power with limits.
              </p>
              <p className="text-white/50 font-light text-sm mt-3">
                Think corporate cards: employees spend up to $500/day. They can&apos;t empty the account. If something goes wrong, you cancel the card. Simple, bounded risk, human oversight. That didn&apos;t exist for AI agents.
              </p>
            </div>

            {/* ── Problem 2: The Fleet Problem ── */}
            <h2 className="text-2xl font-light text-white mt-20 mb-6 font-[family-name:var(--font-exo2)]">
              Problem 2: The Fleet Problem
            </h2>

            <p className="text-white/70 font-light leading-relaxed">
              Even if you solve the key problem for one agent, the moment you&apos;re running more than a handful, a new problem surfaces.
            </p>

            <blockquote className="my-8 border-l-2 border-[#F65B1A] pl-6">
              <p className="text-white/80 font-light text-xl leading-relaxed">
                &ldquo;Managing spend for 5 agents is a settings page. Managing spend for 500 agents is an operations problem.&rdquo;
              </p>
            </blockquote>

            <p className="text-white/70 font-light leading-relaxed">
              Which agent spent what? Which one is over budget? Which one just went rogue? If each agent has its own separate wallet, you have 500 wallets to monitor. 500 places to top up. 500 potential breaches to track.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              The &ldquo;just make a new wallet and fund it $5&rdquo; mental model breaks completely when x402 adoption accelerates — because now agents aren&apos;t just spending $5 from a burner, they&apos;re paying dozens of APIs per task. Budget management becomes critical infrastructure.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              What you actually need is a fleet layer: one wallet, many agents, each with its own delegation and limits, all visible in one place.
            </p>

            <div className="my-8 grid grid-cols-2 gap-4 font-mono text-sm">
              {[
                { label: "Before", bad: "500 wallets to manage", worse: "No spending visibility", worst: "No revocation control" },
                { label: "After", good: "One wallet, 500 credentials", better: "Mission Control dashboard", best: "Revoke any agent instantly" },
              ].map(({ label, ...items }) => (
                <div key={label} className={`border p-5 ${label === "Before" ? "border-red-500/20 bg-red-500/5" : "border-[#F65B1A]/30 bg-[#F65B1A]/5"}`}>
                  <div className={`text-xs tracking-wider uppercase mb-4 ${label === "Before" ? "text-red-400/60" : "text-[#F65B1A]"}`}>{label}</div>
                  {Object.values(items).map((v, i) => (
                    <div key={i} className="flex gap-2 mb-2 text-xs">
                      <span className={label === "Before" ? "text-red-400/60" : "text-[#F65B1A]"}>{label === "Before" ? "✗" : "✓"}</span>
                      <span className="text-white/60">{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* ── Problem 3: The x402 Problem ── */}
            <h2 className="text-2xl font-light text-white mt-20 mb-6 font-[family-name:var(--font-exo2)]">
              Problem 3: The x402 Problem
            </h2>

            <p className="text-white/70 font-light leading-relaxed">
              x402 is now real. The standard is simple and powerful: API returns <code className="text-[#F65B1A] bg-white/5 px-2 py-1">HTTP 402 Payment Required</code> → agent pays USDC → access granted. No accounts, no billing cycles, no API keys.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              But x402 assumes agents have wallets they own with USDC to spend. Which means every agent needs its own wallet. Which brings you back to problem 2 — now you need to manage 500 wallets AND their private keys.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              More critically: x402 tells you <em>how</em> payments flow. It doesn&apos;t tell you <em>who controls</em> how much an agent can spend. Without limits, an agent could pay $1,000 for something that costs $1. x402 is the rail — but there&apos;s no braking system.
            </p>

            <div className="my-8 border border-[#F65B1A]/30 bg-[#F65B1A]/5 p-6">
              <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-4">The missing piece</div>
              <p className="text-white font-light text-lg font-[family-name:var(--font-exo2)]">
                &ldquo;x402 is the payment rail. PaySpawn is the wallet your agent uses to ride it.&rdquo;
              </p>
              <p className="text-white/50 font-light text-sm mt-3">
                One credential delegates from your existing wallet. Agent pays any x402 API — without owning a single private key, without a separate wallet, within your spending limits.
              </p>
            </div>

            {/* ── The Answer: PaySpawn ── */}
            <h2 className="text-2xl font-light text-white mt-20 mb-6 font-[family-name:var(--font-exo2)]">
              What We Built
            </h2>

            <p className="text-white/70 font-light leading-relaxed">
              PaySpawn is non-custodial payment infrastructure for AI agents. Three problems, one answer — built around three pillars.
            </p>

            {/* Pillar 1 */}
            <div className="my-10">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-[#F65B1A] font-mono text-sm">01</span>
                <h3 className="text-xl font-light text-white font-[family-name:var(--font-exo2)]">Credentials, not keys</h3>
              </div>
              <div className="space-y-3 pl-10">
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Connect your wallet.</strong> Any wallet — MetaMask, Coinbase Smart Wallet (Face ID, no seed phrase). Keys stay with you.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Create a credential.</strong> A base64-encoded spend permission, not a private key. Set a daily limit in USDC. Embed it in your agent&apos;s env like any API key.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Limits enforced on-chain.</strong> The contract won&apos;t allow spending beyond the cap. We can&apos;t override it. You can&apos;t accidentally override it. Math enforces the rules.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Instant kill switch.</strong> Revoke the credential on-chain from the dashboard. Effect is immediate. Old credential becomes useless.</p>
                </div>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="my-10">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-[#F65B1A] font-mono text-sm">02</span>
                <h3 className="text-xl font-light text-white font-[family-name:var(--font-exo2)]">Fleet management — Mission Control</h3>
              </div>
              <div className="space-y-3 pl-10">
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">One wallet. Unlimited agents.</strong> Each agent gets its own credential with its own daily limit. All delegating from the same wallet you already have.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Independent limits.</strong> Research agent: $10/day. Trading bot: $500/day. Each credential is its own spending authority. One gets compromised — revoke it. Others keep running.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Full visibility.</strong> Every agent, every limit, every transaction in Mission Control. Running 5 agents or 500 — same interface, same control.</p>
                </div>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="my-10">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-[#F65B1A] font-mono text-sm">03</span>
                <h3 className="text-xl font-light text-white font-[family-name:var(--font-exo2)]">x402 native + .pay names</h3>
              </div>
              <div className="space-y-3 pl-10">
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Pay any x402 API.</strong> Agent hits a 402 wall — PaySpawn handles it automatically, within your spending limits. No owned wallet needed. One credential rides any x402 rail.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">Accept x402 payments.</strong> Gate your own APIs behind x402. PaySpawn is the full facilitator — verify and settle on Base.</p>
                </div>
                <div className="flex gap-4">
                  <span className="text-[#F65B1A]">→</span>
                  <p className="text-white/70 font-light"><strong className="text-white">.pay names — the identity layer.</strong> <code className="text-[#F65B1A]">alice.pay</code> sends to <code className="text-[#F65B1A]">research-bot.pay</code>. Human-readable, on-chain, verified. When agent-to-agent commerce is real — and it&apos;s coming fast — hex addresses aren&apos;t an identity layer. .pay names are.</p>
                </div>
              </div>
            </div>

            {/* ── The Bigger Picture ── */}
            <h2 className="text-2xl font-light text-white mt-20 mb-6 font-[family-name:var(--font-exo2)]">
              The Bigger Picture
            </h2>

            <p className="text-white/70 font-light leading-relaxed">
              We&apos;re entering an era where AI agents manage real resources. Not in some distant future — now. Agents are browsing the web, writing code, making decisions. The only thing holding them back from participating fully in the economy is the inability to transact safely at scale.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              x402 just solved the <em>how</em>. The payment protocol is live. The standards are converging. Stripe and Coinbase are both building for it.
            </p>

            <p className="text-white/70 font-light leading-relaxed font-[family-name:var(--font-exo2)] text-xl my-8">
              <strong className="text-white">The wallet layer — who controls what an agent spends, at scale — is what was missing. That&apos;s PaySpawn.</strong>
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              Non-custodial. Fleet-ready. x402 native. Free to use. Built on Base.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              Your keys. Your limits. Your fleet. Your control.
            </p>

            {/* ── The No-Gas Footnote ── */}
            <h2 className="text-2xl font-light text-white mt-20 mb-6 font-[family-name:var(--font-exo2)]">
              One More Thing: No Gas
            </h2>

            <p className="text-white/70 font-light leading-relaxed">
              One annoying thing about crypto payments: agents need ETH to pay in USDC. So now you&apos;re managing two tokens per agent. Topping up gas. Hoping your agent doesn&apos;t stop mid-task because it ran out of ETH.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              PaySpawn&apos;s relayer covers gas on behalf of every agent. Your agents only need USDC. We handle the blockchain transaction with zero protocol fees, settling on Base in ~2 seconds.
            </p>

            <p className="text-white/70 font-light leading-relaxed">
              Coinbase Smart Wallet users pay zero gas even for setup — signature is off-chain. Standard wallet users pay ~$0.005 once for the USDC approval. That&apos;s it. Agents spend. You don&apos;t babysit gas.
            </p>

            {/* ── CTA ── */}
            <div className="mt-20 pt-12 border-t border-white/10">
              <div className="border-l-2 border-[#F65B1A] pl-6 mb-10">
                <p className="text-white text-2xl font-light font-[family-name:var(--font-exo2)]">
                  x402 is the payment rail.<br />
                  <span className="text-[#F65B1A]">PaySpawn is the wallet your agent uses to ride it.</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/dashboard" className="inline-block bg-[#F65B1A] text-black px-8 py-4 text-sm tracking-wider uppercase hover:bg-[#ff7a3d] transition">
                  Launch Mission Control
                </Link>
                <Link href="/docs" className="inline-block border border-white/20 px-8 py-4 text-sm tracking-wider uppercase hover:border-white transition">
                  Read the Docs
                </Link>
              </div>
              <p className="mt-8 text-white/30 text-sm font-light">
                Built on Base. Verified contracts. Open source. Any wallet. Zero fees.
              </p>
            </div>
          </div>
        </div>
      </article>

      {/* Footer */}
      <footer className="py-12 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xs tracking-[0.3em] uppercase text-white/40">PaySpawn 2026</div>
          <div className="flex gap-8 text-sm text-white/40">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
