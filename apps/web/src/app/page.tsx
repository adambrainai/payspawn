import Link from "next/link";
import HeroNeuralNet from "@/components/HeroNeuralNet";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#F65B1A] selection:text-black">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 mix-blend-difference">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4 md:py-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 md:gap-3 text-xs md:text-sm tracking-[0.2em] md:tracking-[0.3em] uppercase font-light">
            <img src="/logo-128.png" alt="PaySpawn" className="w-6 h-6 md:w-8 md:h-8" />
            <span>PaySpawn</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4 md:gap-8 text-xs md:text-sm">
            <Link href="/why" className="opacity-60 hover:opacity-100 transition-opacity">Why</Link>
            <Link href="/docs" className="opacity-60 hover:opacity-100 transition-opacity">Docs</Link>
            <Link href="/dashboard" className="border border-white/20 px-3 py-1.5 md:px-4 md:py-2 hover:bg-white hover:text-black transition-all">
              Launch
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="h-screen flex flex-col justify-center px-4 md:px-8 pt-20 pb-12 relative overflow-hidden">
        <HeroNeuralNet />

        <div className="relative z-10 max-w-[1800px] mx-auto w-full pointer-events-none">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Agent Payment Infrastructure</span>
            <span className="border border-[#F65B1A] text-[#F65B1A] px-3 py-1 text-xs tracking-wider uppercase">x402 Native</span>
            <span className="border border-white/20 text-white/40 px-3 py-1 text-xs tracking-wider uppercase">Fleet Ready</span>
          </div>

          <h1 className="font-extralight leading-[1.05] tracking-tight font-[family-name:var(--font-exo2)] text-[7vw] md:text-[5.2vw] lg:text-[3.8vw]">
            <span className="block">One wallet.</span>
            <span className="block">Unlimited agents.</span>
            <span className="block">No private keys.</span>
            <span className="block">On-chain limits.</span>
            <span className="block"><span className="text-[#F65B1A] font-mono">.pay</span> names.</span>
            <span className="block">x402 native.</span>
            <span className="block text-[#F65B1A]">Spawn your fleet now.</span>
          </h1>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 pointer-events-auto">
            <Link href="/dashboard" className="inline-block bg-[#F65B1A] text-black px-8 py-4 text-sm tracking-wider uppercase hover:bg-[#ff7a3d] transition-colors">
              Launch Mission Control
            </Link>
            <Link href="/why" className="inline-block border border-white/20 px-8 py-4 text-sm tracking-wider uppercase hover:border-white transition-colors">
              Why We Built This
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
        </div>
      </section>

      {/* ── Fleet Scale Callout ── */}
      <section className="py-24 px-4 md:px-8 border-t border-white/10 bg-[#F65B1A]/[0.025]">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">The Scale Problem</span>
              <blockquote className="mt-6 text-2xl md:text-3xl font-extralight leading-snug font-[family-name:var(--font-exo2)]">
                &ldquo;Managing spend for 5 agents is a settings page.
                <br />
                <span className="text-[#F65B1A]">Managing spend for 500 agents is an operations problem.</span>&rdquo;
              </blockquote>
              <p className="mt-6 text-white/40 text-sm font-light">
                The agent economy isn&apos;t coming. It&apos;s here. Budget allocation, per-agent rules, instant revocation, real-time monitoring — this is infrastructure, not a feature.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 font-mono text-sm">
              {[
                { n: "01", label: "One Wallet", desc: "All agents spend from your existing wallet. No new wallets, no new keys." },
                { n: "02", label: "Unlimited Agents", desc: "Each gets its own credential with independent daily limits." },
                { n: "03", label: "Instant Revocation", desc: "Kill any agent immediately. Compromise is always capped." },
                { n: "04", label: "Mission Control", desc: "See every agent, every limit, every payment in one place." },
              ].map(({ n, label, desc }) => (
                <div key={n} className="border border-white/10 p-5">
                  <div className="text-[#F65B1A] text-xs mb-2">{n}</div>
                  <div className="text-white font-light mb-2">{label}</div>
                  <div className="text-white/40 text-xs leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The Problem / Solution ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto">
          <div className="mb-16">
            <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">The Problem</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">
              Agents need money.<br />
              <span className="text-white/40">The tools to give it safely didn&apos;t exist.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-white/10">
            {/* Header */}
            <div className="bg-black px-8 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-500/70 inline-block" />
              <span className="text-xs tracking-[0.2em] uppercase text-white/40">Without PaySpawn</span>
            </div>
            <div className="bg-black px-8 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#F65B1A] inline-block" />
              <span className="text-xs tracking-[0.2em] uppercase text-[#F65B1A]">With PaySpawn</span>
            </div>

            {/* Row 1 */}
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-red-400/80 text-sm font-light mb-2">Private key lives in .env file</p>
              <p className="text-white/30 text-sm font-light">One breach = wallet drained. No limits, no recovery.</p>
            </div>
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-white font-light mb-2">Agent holds a credential string</p>
              <p className="text-white/40 text-sm font-light">Compromised credential can only spend within your preset limits. Not your keys, not your wallet.</p>
            </div>

            {/* Row 2 */}
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-red-400/80 text-sm font-light mb-2">x402 needs agents to have their own wallets</p>
              <p className="text-white/30 text-sm font-light">Key management per-agent. Fund each one separately. One gets compromised, it&apos;s gone.</p>
            </div>
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-white font-light mb-2">One wallet rides any x402 rail</p>
              <p className="text-white/40 text-sm font-light">Credential delegates from your wallet. Agent pays any x402-enabled API — no owned wallet needed.</p>
            </div>

            {/* Row 3 */}
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-red-400/80 text-sm font-light mb-2">Managing 100 agents is a spreadsheet</p>
              <p className="text-white/30 text-sm font-light">Which agent spent what? Who has access? No visibility, no control at scale.</p>
            </div>
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-white font-light mb-2">Mission Control — fleet management built in</p>
              <p className="text-white/40 text-sm font-light">Every agent, every limit, every transaction in one dashboard. Revoke any agent instantly.</p>
            </div>

            {/* Row 4 */}
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-red-400/80 text-sm font-light mb-2">Custodial service holds your keys</p>
              <p className="text-white/30 text-sm font-light">Trust a third party. Hope they don&apos;t get hacked or go offline.</p>
            </div>
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-white font-light mb-2">Non-custodial. You keep your keys.</p>
              <p className="text-white/40 text-sm font-light">Limits enforced by smart contract. We can&apos;t move your money. The chain enforces the rules.</p>
            </div>

            {/* Row 5 */}
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-red-400/80 text-sm font-light mb-2">Agents need ETH for gas</p>
              <p className="text-white/30 text-sm font-light">Fund two tokens per agent. Monitor two balances. Agent stops when gas runs out mid-task.</p>
            </div>
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-white font-light mb-2">Agent only needs USDC</p>
              <p className="text-white/40 text-sm font-light">Our relayer covers gas. One token, zero headaches. Zero protocol fees.</p>
            </div>

            {/* Row 6 */}
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-red-400/80 text-sm font-light mb-2">Sending to 0x4eB1b8Dd6eccBE4fE...</p>
              <p className="text-white/30 text-sm font-light">Off by one character = funds gone forever. Every payment is a risk.</p>
            </div>
            <div className="bg-black px-8 py-8 border-t border-white/10">
              <p className="text-white font-light mb-2">Send to alice.pay</p>
              <p className="text-white/40 text-sm font-light">Human-readable .pay names on-chain. Agents paying agents — readable, verifiable, permanent.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── x402 Section ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10 bg-[#F65B1A]/[0.02]">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">x402 Protocol</span>
                <span className="border border-[#F65B1A] text-[#F65B1A] px-2 py-0.5 text-[10px] tracking-wider uppercase">Native</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">
                Every API on the internet
                <br />
                <span className="text-[#F65B1A]">is about to have a price.</span>
              </h2>
              <p className="mt-6 text-white/50 font-light leading-relaxed">
                HTTP 402 has been dormant for 30 years. x402 brings it back: API returns a price → agent pays USDC → gets access. No accounts, no API keys, no billing cycles. Stripe launched it. Coinbase built for it. The standards war is happening now.
              </p>
              <p className="mt-4 text-white/50 font-light leading-relaxed">
                x402 tells agents <em>how</em> to pay. It doesn&apos;t tell you <em>who controls</em> how much they spend. PaySpawn is the wallet layer — the fleet credential that lets any agent ride any x402 rail, within your limits, without owning a single private key.
              </p>
              <div className="mt-6 border-l-2 border-[#F65B1A] pl-4">
                <p className="text-white/60 text-sm font-light italic">
                  &ldquo;x402 is the payment rail. PaySpawn is the wallet your agent uses to ride it.&rdquo;
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border border-[#F65B1A]/30 bg-[#F65B1A]/5 p-6">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-3">Send — Agent pays x402 APIs</div>
                <p className="text-white/60 font-light text-sm mb-3">Your agent hits a 402 API → PaySpawn handles the payment automatically, within your spending limits</p>
                <code className="text-xs font-mono text-white/40 block">POST /api/x402 → payment settled, access granted</code>
              </div>
              <div className="border border-[#F65B1A]/30 bg-[#F65B1A]/5 p-6">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-3">Receive — Accept x402 for your APIs</div>
                <p className="text-white/60 font-light text-sm mb-3">Gate your own services behind x402 — PaySpawn is the full facilitator stack</p>
                <code className="text-xs font-mono text-white/40 block">/api/x402/verify + /api/x402/settle</code>
              </div>
              <div className="flex gap-4 text-xs font-mono">
                <span className="border border-white/20 px-3 py-1.5 text-white/50">Base Network</span>
                <span className="border border-white/20 px-3 py-1.5 text-white/50">USDC</span>
                <span className="border border-white/20 px-3 py-1.5 text-white/50">Micropayments</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 md:gap-32">
            <div>
              <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">How it works</span>
              <h2 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">
                One wallet.<br />Unlimited agents.
              </h2>
              <p className="mt-6 text-white/40 font-light leading-relaxed">
                Each agent gets its own credential with its own daily limit, all delegating from one wallet you already have. No new wallets, no new keys, no new risk.
              </p>
            </div>

            <div className="space-y-12 md:pt-12">
              {[
                { n: "01", title: "Connect your wallet", body: "Any wallet. MetaMask, Coinbase, Smart Wallet. Your keys never leave your device." },
                { n: "02", title: "Create agent credentials", body: "One per agent — each with independent daily limits. 3 agents or 300, same flow." },
                { n: "03", title: "Deploy and ride the x402 rail", body: "Paste the credential string. Agent calls our API or SDK to pay any x402 API, on-chain, within your limits." },
              ].map(({ n, title, body }) => (
                <div key={n} className="flex items-baseline gap-6">
                  <span className="text-[#F65B1A] font-mono text-sm shrink-0">{n}</span>
                  <div>
                    <h3 className="text-xl font-light mb-2">{title}</h3>
                    <p className="text-white/40 font-light">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Code ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Integration</span>
              <h2 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">
                One line.
              </h2>
              <p className="mt-6 text-white/40 font-light max-w-md">
                Credential string in env. SDK call to pay. Agent sends USDC to any wallet, .pay name, or x402 API — on-chain in ~2 seconds. No private keys. No ETH. No complexity.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  "No private keys for agents",
                  "Pay wallets, .pay names, or x402 APIs",
                  "Limits enforced by smart contract",
                  "Instant kill switch — revoke any agent",
                  "Zero protocol fees",
                ].map(f => (
                  <div key={f} className="flex items-center gap-4">
                    <div className="w-1 h-1 bg-[#F65B1A] shrink-0" />
                    <span className="text-white/60 text-sm">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 p-6 md:p-8 font-mono text-sm overflow-x-auto">
              <div className="text-white/30 mb-4">// agent.js</div>
              <pre className="leading-relaxed">
<span className="text-purple-400">import</span> <span className="text-white/50">{"{"}</span> <span className="text-white">PaySpawn</span> <span className="text-white/50">{"}"}</span> <span className="text-purple-400">from</span> <span className="text-[#F65B1A]">&apos;@payspawn/sdk&apos;</span>{`

`}<span className="text-purple-400">const</span> <span className="text-white">ps</span> <span className="text-white/50">=</span> <span className="text-purple-400">new</span> <span className="text-blue-400">PaySpawn</span><span className="text-white/50">(</span>{`
  `}<span className="text-white">process</span><span className="text-white/50">.</span><span className="text-white">env</span><span className="text-white/50">.</span><span className="text-cyan-400">PAYSPAWN_CREDENTIAL</span>{`
`}<span className="text-white/50">)</span>{`

`}<span className="text-white/40">{"// pay a .pay name"}</span>{`
`}<span className="text-purple-400">await</span> <span className="text-white">ps</span><span className="text-white/50">.</span><span className="text-blue-400">pay</span><span className="text-white/50">(</span><span className="text-[#F65B1A]">&apos;alice.pay&apos;</span><span className="text-white/50">,</span> <span className="text-cyan-400">5.00</span><span className="text-white/50">)</span>{`

`}<span className="text-white/40">{"// pay an x402 API"}</span>{`
`}<span className="text-purple-400">await</span> <span className="text-white">ps</span><span className="text-white/50">.</span><span className="text-blue-400">x402</span><span className="text-white/50">(</span><span className="text-[#F65B1A]">&apos;https://api.example.com/data&apos;</span><span className="text-white/50">)</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── .pay Names ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Name System</span>
              <h2 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">
                Agents paying agents.<br />
                <span className="text-[#F65B1A]">Human-readable.</span>
              </h2>
              <p className="mt-6 text-white/50 font-light leading-relaxed">
                When agent-to-agent commerce becomes real — and it&apos;s coming fast — hex addresses aren&apos;t an identity layer. <span className="text-white">.pay</span> names are. Registered on-chain on Base. Resolved anywhere PaySpawn is accepted.
              </p>
              <p className="mt-4 text-white/50 font-light leading-relaxed">
                <code className="text-white">alice.pay</code> sends to <code className="text-white">research-bot.pay</code>. On-chain. Verifiable. No typos, no hex, no fear.
              </p>
              <div className="mt-8">
                <Link href="/dashboard" className="inline-block border border-[#F65B1A] text-[#F65B1A] px-6 py-3 text-sm tracking-wider uppercase hover:bg-[#F65B1A] hover:text-black transition-all">
                  Claim your .pay name
                </Link>
              </div>
            </div>
            <div className="space-y-4 font-mono text-sm">
              <div className="border border-white/10 p-6 bg-white/[0.02]">
                <div className="text-white/30 text-xs mb-4 tracking-wider uppercase">Without .pay</div>
                <div className="text-white/40 break-all">0x4eB1b8Dd6eccBE4fE59c0c25eaAcF6564B5e0482</div>
              </div>
              <div className="flex items-center justify-center text-white/20 text-xs tracking-widest">↓ PAYSPAWN NAME SYSTEM</div>
              <div className="border border-[#F65B1A]/40 p-6 bg-[#F65B1A]/5">
                <div className="text-[#F65B1A] text-xs mb-4 tracking-wider uppercase">With .pay</div>
                <div className="text-white text-xl font-light">alice.pay</div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                {["alice.pay", "trading-bot.pay", "research.pay"].map(n => (
                  <div key={n} className="border border-white/10 p-3 text-center text-white/40 text-xs">{n}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto">
          <div className="mb-16">
            <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Features</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">
              The full stack.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-[#F65B1A]/50 bg-[#F65B1A]/5 p-6 sm:col-span-2">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">x402 Native ✦ Send &amp; Receive</div>
              <p className="text-white/50 text-sm font-light">Full x402 facilitator. Pay any x402-enabled API or gate your own services — all with on-chain spending limits. The payment standard the agent economy is converging on.</p>
            </div>
            <div className="border border-[#F65B1A]/50 bg-[#F65B1A]/5 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">Fleet Management ✦</div>
              <p className="text-white/50 text-sm font-light">Mission Control dashboard — create, monitor, and revoke any agent credential from one place. Built for operators running agents at scale.</p>
            </div>
            <div className="border border-white/10 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">Non-Custodial</div>
              <p className="text-white/50 text-sm font-light">Your keys never leave your wallet. We can&apos;t access your funds. Limits enforced by smart contract, not our servers.</p>
            </div>
            <div className="border border-white/10 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">.pay Name System</div>
              <p className="text-white/50 text-sm font-light">Human-readable on-chain names. Agent-to-agent payments without hex addresses. The identity layer for the agent economy.</p>
            </div>
            <div className="border border-white/10 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">No Gas for Agents</div>
              <p className="text-white/50 text-sm font-light">Agents only need USDC. Our relayer covers gas. One token, zero ETH headaches.</p>
            </div>
            <div className="border border-white/10 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">Instant Kill Switch</div>
              <p className="text-white/50 text-sm font-light">Revoke any credential on-chain immediately. Compromise is always bounded. One click, immediate effect.</p>
            </div>
            <div className="border border-white/10 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">ENS &amp; Basenames</div>
              <p className="text-white/50 text-sm font-light">Pay to .eth or .base.eth names directly. Works alongside the full Ethereum name ecosystem.</p>
            </div>
            <div className="border border-white/10 p-6">
              <div className="text-[#F65B1A] text-xs tracking-[0.2em] uppercase mb-3">Free to Use</div>
              <p className="text-white/50 text-sm font-light">Zero protocol fees. No monthly costs. Agents just need USDC.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Pricing</span>
              <h2 className="mt-4 text-4xl md:text-5xl font-extralight font-[family-name:var(--font-exo2)]">Free</h2>
              <p className="mt-6 text-white/40 font-light">
                Zero protocol fees. No monthly costs.<br />
                We cover gas — your agent just needs USDC.
              </p>
            </div>
            <div className="font-mono text-sm space-y-4">
              {[["$0.10 payment", "$0.00 fee"], ["$1.00 payment", "$0.00 fee"], ["$10.00 payment", "$0.00 fee"], ["$100 payment", "$0.00 fee"], ["$1,000 payment", "$0.00 fee"]].map(([amount, fee]) => (
                <div key={amount} className="flex justify-between py-3 border-b border-white/10">
                  <span className="text-white/40">{amount}</span>
                  <span className="text-[#F65B1A]">{fee}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto text-center">
          <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Join the agent economy</span>
          <h2 className="mt-6 text-4xl md:text-6xl font-extralight font-[family-name:var(--font-exo2)] mb-4">
            Your agents are ready.<br />
            <span className="text-[#F65B1A]">Give them spending power.</span>
          </h2>
          <p className="text-white/40 font-light mb-10 max-w-lg mx-auto">
            One wallet. Unlimited agents. x402 native. Free forever.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/dashboard" className="inline-block bg-[#F65B1A] text-black px-12 py-5 text-sm tracking-wider uppercase hover:bg-[#ff7a3d] transition-colors">
              Launch Mission Control
            </Link>
            <Link href="/why" className="inline-block border border-white/20 px-12 py-5 text-sm tracking-wider uppercase hover:border-white transition-colors">
              Why We Built This
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xs tracking-[0.3em] uppercase text-white/40">PaySpawn © 2026</div>
          <div className="flex gap-8 text-sm text-white/40">
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/why" className="hover:text-white transition-colors">Why</Link>
            <a href="https://github.com/adambrainai/payspawn" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href="https://basescan.org/address/0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Contract</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
