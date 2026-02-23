import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";

export default function DocsPage() {
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
            <Link href="/why" className="text-white/60 hover:text-white transition-colors">
              Why
            </Link>
            <Link href="/docs" className="text-[#F65B1A]">
              Docs
            </Link>
            <Link 
              href="/dashboard" 
              className="border border-white/20 px-3 py-1.5 md:px-4 md:py-2 hover:bg-white hover:text-black transition-all"
            >
              Launch
            </Link>
          </div>
        </div>
      </nav>

      <div className="pt-32 pb-24 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-20">
            <span className="text-[#F65B1A] text-xs tracking-[0.3em] uppercase">Documentation</span>
            <h1 className="mt-4 text-5xl md:text-6xl font-extralight font-[family-name:var(--font-exo2)]">
              Getting Started
            </h1>
          </div>

          {/* Overview */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-6">Overview</h2>
            <p className="text-white/60 font-light leading-relaxed text-lg mb-8">
              PaySpawn is non-custodial payment infrastructure for AI agents. Give your agent a credential to spend, receive, and transact — without giving it your private keys. Built on Base with USDC.
            </p>
            
            {/* Feature grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Non-Custodial</div>
                <p className="text-white/50 text-sm font-light">Your keys never leave your wallet. We store nothing sensitive.</p>
              </div>
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Session Keys</div>
                <p className="text-white/50 text-sm font-light">Agent holds a limited credential. Revoke anytime.</p>
              </div>
              <div className="border border-[#F65B1A]/30 bg-[#F65B1A]/5 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">x402 Native</div>
                <p className="text-white/50 text-sm font-light">Pay for web content automatically. Built-in x402 support.</p>
              </div>
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Base Network</div>
                <p className="text-white/50 text-sm font-light">Fast, cheap transactions on Coinbase&apos;s L2.</p>
              </div>
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Instant Revoke</div>
                <p className="text-white/50 text-sm font-light">Revoke agent access on-chain anytime. Immediate effect.</p>
              </div>
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Name System</div>
                <p className="text-white/50 text-sm font-light">Pay to alice.pay instead of hex addresses.</p>
              </div>
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">ENS Support</div>
                <p className="text-white/50 text-sm font-light">Pay to any .eth name directly.</p>
              </div>
              <div className="border border-white/10 p-4">
                <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">No Gas for Agents</div>
                <p className="text-white/50 text-sm font-light">We cover gas. Agents just need USDC.</p>
              </div>
            </div>
          </section>

          {/* Quick Start */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">Quick Start</h2>
            
            <div className="space-y-12">
              <div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-[#F65B1A]">01</span>
                  <h3 className="text-xl font-light">Create a wallet (or connect existing)</h3>
                </div>
                <div className="ml-10 text-white/50 font-light space-y-2">
                  <p>Go to <Link href="/dashboard" className="text-[#F65B1A] hover:underline">/dashboard</Link></p>
                  <p><strong className="text-white">New to crypto?</strong> Create a wallet with Face ID / fingerprint. No seed phrase needed.</p>
                  <p><strong className="text-white">Have a wallet?</strong> Connect via MetaMask, Rabby, Coinbase Wallet, etc.</p>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-[#F65B1A]">02</span>
                  <h3 className="text-xl font-light">Fund your wallet with USDC</h3>
                </div>
                <div className="ml-10 text-white/50 font-light space-y-2">
                  <p>Transfer USDC from another wallet on Base, or</p>
                  <p>Buy USDC with credit card / Apple Pay (coming soon)</p>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-[#F65B1A]">03</span>
                  <h3 className="text-xl font-light">Create a session key</h3>
                </div>
                <div className="ml-10 text-white/50 font-light space-y-2">
                  <p>Set your daily spending limit (e.g., $100/day)</p>
                  <p>Set expiration (e.g., 1 year)</p>
                  <p><strong className="text-white/70">Smart Wallet:</strong> Off-chain signature — no gas cost</p>
                  <p><strong className="text-white/70">Standard wallet (MetaMask, Phantom):</strong> One USDC approval transaction (~$0.005)</p>
                  <p>Copy your credential string</p>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-[#F65B1A]">04</span>
                  <h3 className="text-xl font-light">Give credential to your agent</h3>
                </div>
                <div className="ml-10 text-white/50 font-light space-y-4">
                  <p>The credential is a single string your agent stores like any secret:</p>
                  <div className="bg-white/[0.02] border border-white/10 p-4 font-mono text-sm">
                    <span className="text-white/40"># Add to agent&apos;s environment</span>
                    <div className="text-white/70 break-all">PAYSPAWN_CREDENTIAL=eyJzaWduYXR1cmUiOiIweC4uLiIsImFsbG93YW5jZSI6...</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-4 mb-4">
                  <span className="font-mono text-[#F65B1A]">05</span>
                  <h3 className="text-xl font-light">Agent makes payments</h3>
                </div>
                <div className="ml-10">
                  <div className="border border-white/10">
                    <CodeBlock language="typescript" code={`import { PaySpawn } from '@payspawn/sdk'

const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL)

// Pay by address
await ps.pay("0x1234...", 10.00)

// Pay by ENS
await ps.pay("vitalik.eth", 5.00)

// Pay by PaySpawn name
await ps.pay("alice.pay", 25.00)

// Check balance
const balance = await ps.balance()  // "142.50"

// Get address to receive payments
const myAddress = ps.address  // "0x..."

// Pay for x402 content automatically
const data = await ps.fetch("https://api.example.com/premium")`} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SDK Reference */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">SDK Reference</h2>
            
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-light mb-4">Installation</h3>
                <div className="border border-white/10">
                  <CodeBlock language="bash" code={`npm install @payspawn/sdk`} />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-light mb-4">Initialize</h3>
                <div className="border border-white/10">
                  <CodeBlock language="typescript" code={`import { PaySpawn } from '@payspawn/sdk'

// Initialize with your credential
const ps = new PaySpawn(process.env.PAYSPAWN_CREDENTIAL)`} />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-light mb-4">Methods</h3>
                <div className="border border-white/10 divide-y divide-white/10">
                  <div className="p-4">
                    <code className="text-[#F65B1A]">ps.pay(to, amount)</code>
                    <p className="text-white/50 text-sm mt-2">Send USDC to address, ENS name, or PaySpawn name</p>
                  </div>
                  <div className="p-4">
                    <code className="text-[#F65B1A]">ps.balance()</code>
                    <p className="text-white/50 text-sm mt-2">Get current USDC balance</p>
                  </div>
                  <div className="p-4">
                    <code className="text-[#F65B1A]">ps.address</code>
                    <p className="text-white/50 text-sm mt-2">Get wallet address (for receiving payments)</p>
                  </div>
                  <div className="p-4">
                    <code className="text-[#F65B1A]">ps.fetch(url, options?)</code>
                    <p className="text-white/50 text-sm mt-2">Fetch URL with automatic x402 payment handling</p>
                  </div>
                  <div className="p-4">
                    <code className="text-[#F65B1A]">ps.remaining()</code>
                    <p className="text-white/50 text-sm mt-2">Get remaining daily allowance</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-light mb-4">Python</h3>
                <div className="border border-white/10">
                  <CodeBlock language="python" code={`from payspawn import PaySpawn

ps = PaySpawn(os.environ['PAYSPAWN_CREDENTIAL'])

# Make a payment
result = ps.pay("alice.pay", 10.00)
print(f"Paid! TX: {result['txHash']}")

# Check balance
balance = ps.balance()  # "142.50"`} />
                </div>
              </div>
            </div>
          </section>

          {/* Session Keys */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">Session Keys</h2>
            
            <div className="space-y-8 text-white/50 font-light">
              <p>
                The credential your agent holds is a <strong className="text-white">session key</strong> — a signed permission that authorizes spending up to your limits. It&apos;s not a private key.
              </p>
              
              <div className="border border-white/10 p-6">
                <h3 className="text-white text-lg font-light mb-4">What&apos;s in a credential?</h3>
                <div className="border border-white/10">
                  <CodeBlock language="json" code={`{
  "signature": "EOA",       // "EOA" for standard wallets, "0x..." for Smart Wallets
  "permission": {
    "account": "0x...",     // Your wallet address
    "spender": "0x71FF...", // PaySpawnSpenderV4 contract
    "token": "0x8335...",   // USDC on Base
    "allowance": "100000000", // 100 USDC (6 decimals)
    "period": 86400,        // 24 hours
    "start": 1706400000,    // When it starts
    "end": 1737936000       // When it expires
  }
}`} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="border border-white/10 p-4">
                  <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Self-Resetting</div>
                  <p className="text-sm">Allowance refills each period. $100/day means $100 every 24 hours.</p>
                </div>
                <div className="border border-white/10 p-4">
                  <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Revocable</div>
                  <p className="text-sm">Revoke on-chain anytime from the dashboard. Immediate effect.</p>
                </div>
                <div className="border border-white/10 p-4">
                  <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Static</div>
                  <p className="text-sm">Agent holds the same credential until expiry or revocation.</p>
                </div>
                <div className="border border-white/10 p-4">
                  <div className="text-[#F65B1A] text-xs tracking-wider uppercase mb-2">Scoped</div>
                  <p className="text-sm">Only works with PaySpawn. Can&apos;t be used elsewhere.</p>
                </div>
              </div>
            </div>
          </section>

          {/* x402 */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">x402 Protocol</h2>
            
            <p className="text-white/60 font-light mb-8">
              x402 is a protocol for HTTP-native payments. When a server returns <code className="text-[#F65B1A]">402 Payment Required</code>, the SDK automatically pays and retries.
            </p>

            <div className="border border-white/10">
              <CodeBlock language="typescript" code={`// Agent fetches premium content
const data = await ps.fetch("https://api.example.com/premium-data")

// Behind the scenes:
// 1. SDK requests the URL
// 2. Server returns 402 with price ($0.01)
// 3. SDK pays automatically (within your limits)
// 4. Server returns the content
// 5. Agent gets the data`} />
            </div>
          </section>

          {/* PaySpawn Names */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">PaySpawn Names</h2>
            
            <p className="text-white/60 font-light mb-8">
              Instead of sharing a hex address, use a human-readable name.
            </p>

            <div className="space-y-4">
              <div className="border border-white/10 p-4 font-mono text-sm">
                <span className="text-white/40">// Instead of</span>
                <div className="text-white/70">await ps.pay(&quot;0x7F4e82B5c9E30f8cD41aB72e...&quot;, 10.00)</div>
              </div>
              <div className="border border-[#F65B1A]/30 bg-[#F65B1A]/5 p-4 font-mono text-sm">
                <span className="text-[#F65B1A]">// Use</span>
                <div className="text-white">await ps.pay(&quot;alice.pay&quot;, 10.00)</div>
              </div>
            </div>

            <p className="text-white/50 font-light mt-6">
              Claim your name in the dashboard. Names are registered on-chain.
            </p>
          </section>

          {/* Fee Structure */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">Fees</h2>
            
            <div className="mb-8">
              <div className="text-6xl font-extralight font-[family-name:var(--font-exo2)] text-[#F65B1A]">$0.005</div>
              <div className="text-white/40 font-light mt-2">Flat fee per transaction. No monthly costs. No percentage.</div>
            </div>
            
            <div className="border border-white/10 divide-y divide-white/10 font-mono text-sm">
              <div className="flex justify-between p-4">
                <span className="text-white/40">$1 payment</span>
                <span className="text-[#F65B1A]">$0.005 fee</span>
              </div>
              <div className="flex justify-between p-4">
                <span className="text-white/40">$10 payment</span>
                <span className="text-[#F65B1A]">$0.005 fee</span>
              </div>
              <div className="flex justify-between p-4">
                <span className="text-white/40">$100 payment</span>
                <span className="text-[#F65B1A]">$0.005 fee</span>
              </div>
              <div className="flex justify-between p-4">
                <span className="text-white/40">$1,000 payment</span>
                <span className="text-[#F65B1A]">$0.005 fee</span>
              </div>
            </div>
            
            <p className="mt-6 text-white/40 font-light text-sm">
              Fee is additive — recipient gets the full amount. We cover gas.
            </p>
          </section>

          {/* Security */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">Security</h2>
            
            <div className="space-y-8 text-white/50 font-light">
              <div>
                <h3 className="text-white text-lg font-light mb-2">We store nothing sensitive</h3>
                <p>Your credential stays with you. We&apos;re a stateless relay. If our servers are compromised, there&apos;s nothing to steal.</p>
              </div>
              
              <div>
                <h3 className="text-white text-lg font-light mb-2">Built-in limits</h3>
                <p>The session key has spending limits baked in. Even if someone steals your agent&apos;s credential, they can only spend up to your daily limit.</p>
              </div>
              
              <div>
                <h3 className="text-white text-lg font-light mb-2">Instant revocation</h3>
                <p>Revoke the credential on-chain anytime. Effect is immediate. The old credential becomes useless.</p>
              </div>
              
              <div className="border border-[#F65B1A]/30 bg-[#F65B1A]/5 p-6">
                <h3 className="text-white text-lg font-light mb-4">Credential vs Private Key</h3>
                <div className="space-y-4">
                  <p><strong className="text-white">Compromised credential:</strong> Attacker can spend up to your daily limit until you revoke. Damage is capped.</p>
                  <p><strong className="text-white">Compromised private key:</strong> Everything gone. No recovery.</p>
                  <p className="text-white/70 mt-4">That&apos;s why agents get credentials, not keys.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Contracts */}
          <section className="mb-20">
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">Contracts</h2>
            <p className="text-white/50 font-light mb-6">Deployed on Base Mainnet. Verified on Basescan.</p>
            
            <div className="border border-white/10 divide-y divide-white/10 font-mono text-sm">
              <div className="flex flex-col sm:flex-row sm:justify-between p-4 gap-2">
                <span className="text-white/70">PaySpawnSpenderV4</span>
                <a 
                  href="https://basescan.org/address/0x71FF87e48b3A66549FbC6A30214b11C4b4975bda" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#F65B1A] hover:underline break-all"
                >
                  0x71FF...5bda
                </a>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between p-4 gap-2">
                <span className="text-white/70">SpendPermissionManager (Coinbase)</span>
                <a 
                  href="https://basescan.org/address/0xf85210B21cC50302F477BA56686d2019dC9b67Ad" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#F65B1A] hover:underline break-all"
                >
                  0xf852...67Ad
                </a>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between p-4 gap-2">
                <span className="text-white/70">USDC</span>
                <a 
                  href="https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#F65B1A] hover:underline break-all"
                >
                  0x8335...2913
                </a>
              </div>
            </div>
          </section>

          {/* Support */}
          <section>
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#F65B1A] mb-8">Support</h2>
            <div className="flex gap-8 text-sm">
              <a 
                href="https://github.com/adambrainai/payspawn/issues" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors"
              >
                GitHub Issues
              </a>
              <a 
                href="https://twitter.com/payspawn" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors"
              >
                Twitter
              </a>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 px-4 md:px-8 border-t border-white/10">
        <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xs tracking-[0.3em] uppercase text-white/40">
            PaySpawn 2025
          </div>
          <div className="flex gap-8 text-sm text-white/40">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
