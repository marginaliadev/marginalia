"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Copy, Check, ShieldCheck, ArrowRight, Eye, Shield, FileText, CheckCircle2, XCircle } from "lucide-react";

export default function CompliancePage() {
  const [noteInput, setNoteInput] = useState("");
  const [auditorPem, setAuditorPem] = useState("");
  const [disclosureResult, setDisclosureResult] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) {
      setErrorMessage("Please enter a valid secret marginal note.");
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/disclosure/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: noteInput.trim(),
          auditorPublicKeyPem: auditorPem.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDisclosureResult(data);
      } else {
        setErrorMessage(data.error || "Failed to generate disclosure package.");
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!disclosureResult) return;
    navigator.clipboard.writeText(JSON.stringify(disclosureResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0B0907] text-white">
      {/* HERO SECTION */}
      <section className="relative overflow-clip pb-14 md:pb-20 pt-8">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-y-10">
          <div className="flex flex-col gap-x-8 gap-y-8 md:flex-row">
            {/* Left Hero */}
            <div className="relative flex flex-col justify-between flex-1">
              <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>
              <div className="flex flex-col justify-center py-6 lg:py-10">
                <div className="max-w-[42.5rem]">
                  <div className="flex items-center gap-x-2 text-mono-s uppercase tracking-wider text-sun mb-3">
                    <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                    <span>Axiom III · Compliance Architecture</span>
                  </div>
                  <h1 className="text-heading-56 font-light text-dust text-pretty">
                    Compliance is built in, not bolted on
                  </h1>
                  <p className="text-body-18-light mt-4 text-dust/80 max-w-[36rem]">
                    How a self-custodial shielded pool protects users without becoming a haven for illicit contagion: screening at the edge, scoped viewing keys, and zero-knowledge attestations on Robinhood Chain.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-x-4 gap-y-3">
                    <a
                      href="#generator"
                      className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-4 py-2.5 text-center whitespace-nowrap text-sm font-medium transition-colors select-none bg-dust border-dust text-night hover:bg-sand"
                    >
                      Generate Disclosure
                    </a>
                    <a
                      href="#screening"
                      className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-4 py-2.5 text-center whitespace-nowrap text-sm font-medium transition-colors select-none bg-midnight border-dusk text-white hover:bg-night"
                    >
                      How Screening Works
                    </a>
                  </div>
                </div>
              </div>
              <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
            </div>

            {/* Right Metric Card */}
            <div className="flex w-full shrink-0 flex-col justify-end md:w-5/12 md:max-w-[28rem]">
              <div className="space-y-6 border border-dusk bg-night p-6 rounded-xs relative">
                <div className="relative h-2 text-stroke-3">
                  <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
                  <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-x-2.5">
                    <div className="size-2 rounded-full bg-sun"></div>
                    <span className="font-mono text-xs tracking-wider uppercase text-dust/70">DISCLOSURE STANDARD</span>
                  </div>
                  <span className="rounded-xs border border-sun/30 bg-sun/10 px-2 py-0.5 font-mono text-[10px] text-sun">X25519-AES</span>
                </div>
                <div>
                  <div className="font-heading text-5xl leading-none text-dust tracking-tight">0</div>
                  <div className="mt-2.5 text-sm text-dust/80 leading-relaxed">
                    Permanent master viewing keys. You disclose per auditor, per scope, per time window. Never the master private key.
                  </div>
                </div>
                <div className="pt-4 border-t border-dusk/60 flex items-center justify-between text-mono-s text-dust/60">
                  <span>OFAC / ASP Screening</span>
                  <span className="text-emerald-400 font-mono">100% Client-Side</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 1: AT THE EDGE SCREENING */}
      <section id="screening" className="relative py-16 md:py-24 border-t border-dusk/50 bg-[#0f0c0b]">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[42rem] mb-12">
            <div className="text-mono-s uppercase tracking-wider text-sun mb-2">At the edge</div>
            <h2 className="text-heading-40 text-dust">Clean money in, clean money out.</h2>
            <p className="text-body-18-light mt-3 text-dust/70">
              Unlike legacy mixers that pool taint and freeze capital, MARGINALIA separates clean actors from sanctioned clusters before commitments enter the tree.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 01 */}
            <div className="relative border border-dusk bg-night/80 p-6 flex flex-col justify-between group hover:border-stroke-2 transition-all">
              <div className="bracket-x h-2 text-stroke-3 border-t mb-4"></div>
              <div>
                <span className="text-mono-s text-dust/40">01</span>
                <h3 className="text-heading-28 text-dust mt-2">Edge Compliance Screening</h3>
                <p className="text-body-16-light text-dust/70 mt-3 leading-relaxed">
                  Sanctions, OFAC lists, and chain intelligence checks happen strictly at the deposit boundary via the Magistrate ASP register. Dirty funds are rejected at the door.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-dusk/50 text-mono-s text-sun/80 uppercase">
                ASP REGISTER · SLIDING 16-ROOTS
              </div>
            </div>

            {/* Card 02 */}
            <div className="relative border border-dusk bg-night/80 p-6 flex flex-col justify-between group hover:border-stroke-2 transition-all">
              <div className="bracket-x h-2 text-stroke-3 border-t mb-4"></div>
              <div>
                <span className="text-mono-s text-dust/40">02</span>
                <h3 className="text-heading-28 text-dust mt-2">Identity Separation</h3>
                <p className="text-body-16-light text-dust/70 mt-3 leading-relaxed">
                  Your real-world identity stays with the licensed ramp or broker. MARGINALIA never sees, receives, or stores KYC records or documents.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-dusk/50 text-mono-s text-sun/80 uppercase">
                NO KYC AT REST · ZERO DATA LEAKS
              </div>
            </div>

            {/* Card 03 */}
            <div className="relative border border-dusk bg-night/80 p-6 flex flex-col justify-between group hover:border-stroke-2 transition-all">
              <div className="bracket-x h-2 text-stroke-3 border-t mb-4"></div>
              <div>
                <span className="text-mono-s text-dust/40">03</span>
                <h3 className="text-heading-28 text-dust mt-2">Decorrelated Withdrawals</h3>
                <p className="text-body-16-light text-dust/70 mt-3 leading-relaxed">
                  Zero-knowledge proofs break transaction graphs without breaking provenance. Clean origin can be mathematically verified at withdrawal without linking addresses.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-dusk/50 text-mono-s text-sun/80 uppercase">
                GROTH16 ZK-SNARK · BN254 PAIRING
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: VIEWING KEYS & INTERACTIVE TOOL */}
      <section id="viewing-keys" className="relative py-16 md:py-24 border-t border-dusk/50 bg-[#0B0907]">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[42rem] mb-12">
            <div className="text-mono-s uppercase tracking-wider text-sun mb-2">Selective disclosure</div>
            <h2 className="text-heading-40 text-dust">Show exactly what’s needed. Never more.</h2>
            <p className="text-body-18-light mt-3 text-dust/70">
              When an auditor, tax agency, or lender requests transaction provenance, provide an authenticated cryptographic letter of disclosure encrypted directly to their public key.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <div className="border border-dusk bg-night/60 p-5 rounded-xs">
              <div className="text-sun font-mono text-xs uppercase mb-1">01 Scoped Keys</div>
              <div className="text-dust font-medium text-base mb-2">Time & Note Scoped</div>
              <p className="text-xs text-dust/70 leading-relaxed">
                Disclose an individual note or a specific tax period without revealing subsequent pool transactions.
              </p>
            </div>

            <div className="border border-dusk bg-night/60 p-5 rounded-xs">
              <div className="text-sun font-mono text-xs uppercase mb-1">02 Programmable Expiry</div>
              <div className="text-dust font-medium text-base mb-2">Revocable Access</div>
              <p className="text-xs text-dust/70 leading-relaxed">
                Viewing permissions expire automatically after the compliance audit window concludes.
              </p>
            </div>

            <div className="border border-dusk bg-night/60 p-5 rounded-xs">
              <div className="text-sun font-mono text-xs uppercase mb-1">03 Authenticated Memos</div>
              <div className="text-dust font-medium text-base mb-2">X25519 Ciphertext</div>
              <p className="text-xs text-dust/70 leading-relaxed">
                Deposit origins and amounts are encrypted using ECDH X25519 and verified with HMAC authentication.
              </p>
            </div>

            <div className="border border-dusk bg-night/60 p-5 rounded-xs">
              <div className="text-sun font-mono text-xs uppercase mb-1">04 Tax Accounting Export</div>
              <div className="text-dust font-medium text-base mb-2">IRS / HMRC Ready</div>
              <p className="text-xs text-dust/70 leading-relaxed">
                Produces standard cryptographic JSON packages compatible with standard enterprise audit software.
              </p>
            </div>
          </div>

          {/* INTERACTIVE GENERATOR TOOL */}
          <div id="generator" className="relative border border-dusk bg-night p-6 sm:p-10 rounded-xs shadow-2xl">
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t -mt-6 sm:-mt-10 mb-6"></div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-dusk/60">
              <div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-sun" />
                  <h3 className="text-heading-28 text-dust">Cryptographic Letter of Disclosure Generator</h3>
                </div>
                <p className="text-xs text-dust/60 font-mono mt-1">
                  X25519-HKDF-AES-256-GCM · Standard LETTER_OF_DISCLOSURE_V1
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-mono-s text-emerald-400 uppercase">Magistrate Ready</span>
              </div>
            </div>

            <form onSubmit={handleGenerate} className="space-y-6">
              <div>
                <label className="block text-mono-s text-dust/80 uppercase mb-2">
                  Secret Marginal Note (Required)
                </label>
                <textarea
                  id="disclosureNote"
                  rows={3}
                  placeholder="marginalia-note-v1-..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  className="w-full bg-[#14100e] border border-dusk rounded-xs p-4 text-xs font-mono text-dust focus:outline-none focus:border-sun transition-colors resize-none placeholder:text-dust/30"
                />
              </div>

              <div>
                <label className="block text-mono-s text-dust/80 uppercase mb-2">
                  Auditor Public Key (Optional PEM, leave blank to auto-generate fresh keypair)
                </label>
                <textarea
                  id="auditorPubKeyPem"
                  rows={3}
                  placeholder="-----BEGIN PUBLIC KEY----- ... (or leave blank to create a fresh viewing keypair)"
                  value={auditorPem}
                  onChange={(e) => setAuditorPem(e.target.value)}
                  className="w-full bg-[#14100e] border border-dusk rounded-xs p-4 text-xs font-mono text-dust focus:outline-none focus:border-sun transition-colors resize-none placeholder:text-dust/30"
                />
              </div>

              {errorMessage && (
                <div className="p-4 bg-rose-950/60 border border-rose-500/40 rounded-xs text-rose-300 text-xs font-mono">
                  {errorMessage}
                </div>
              )}

              <button
                id="generateDisclosureBtn"
                type="submit"
                disabled={isGenerating}
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>{isGenerating ? "Computing X25519 Ephemeral Cipher..." : "Generate Letter of Disclosure"}</span>
              </button>
            </form>

            {/* Results Container */}
            {disclosureResult && (
              <div id="disclosureResult" className="mt-8 pt-8 border-t border-dusk/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h4 className="font-heading text-xl text-dust font-semibold">
                      Encrypted Disclosure Package
                    </h4>
                    <p className="text-mono-s text-dust/60 mt-0.5">
                      Standard: {disclosureResult.standard} · X25519 Authenticated Ciphertext
                    </p>
                  </div>

                  <button
                    id="copyDisclosureBtn"
                    onClick={handleCopy}
                    className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-3.5 py-2 text-xs font-mono transition-colors select-none bg-midnight border-dusk text-white hover:bg-night gap-2"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy JSON"}</span>
                  </button>
                </div>

                <pre
                  id="disclosureJsonText"
                  className="bg-[#0c0908] border border-dusk rounded-xs p-4 text-xs font-mono text-dust/90 overflow-x-auto max-h-96"
                >
                  {JSON.stringify(disclosureResult, null, 2)}
                </pre>
              </div>
            )}
            
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b -mb-6 sm:-mb-10 mt-8"></div>
          </div>
        </div>
      </section>

      {/* SECTION 3: WHO YOU CAN PROVE THINGS TO (COMPARISON TABLE) */}
      <section className="relative py-16 md:py-24 border-t border-dusk/50 bg-[#0f0c0b]">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[42rem] mb-12">
            <div className="text-mono-s uppercase tracking-wider text-sun mb-2">Comparison</div>
            <h2 className="text-heading-40 text-dust">Who you can prove things to</h2>
            <p className="text-body-18-light mt-3 text-dust/70">
              Compare disclosure ergonomics between a conventional public wallet and MARGINALIA’s zero-knowledge protocol.
            </p>
          </div>

          <div className="overflow-x-auto border border-dusk bg-night/70 rounded-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-dusk/80 text-mono-s text-dust/50 uppercase">
                  <th className="py-4 px-6">Counterparty</th>
                  <th className="py-4 px-6">Public Wallet</th>
                  <th className="py-4 px-6 text-sun">MARGINALIA / Noirpay Standard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dusk/50 text-sm">
                <tr className="hover:bg-midnight/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-dust">Accountant</td>
                  <td className="py-4 px-6 text-dust/60">Full history disclosed forever; leaks all balances</td>
                  <td className="py-4 px-6 text-dust font-mono text-xs">
                    <span className="text-emerald-400">Scoped viewing key</span> for specific tax year only
                  </td>
                </tr>
                <tr className="hover:bg-midnight/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-dust">Auditor / Regulator</td>
                  <td className="py-4 px-6 text-dust/60">Exposes upstream & downstream client relationships</td>
                  <td className="py-4 px-6 text-dust font-mono text-xs">
                    <span className="text-emerald-400">Cryptographic Letter of Disclosure</span> with X25519 cipher
                  </td>
                </tr>
                <tr className="hover:bg-midnight/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-dust">Lender</td>
                  <td className="py-4 px-6 text-dust/60">Reveals liquidation thresholds & portfolio sizing</td>
                  <td className="py-4 px-6 text-dust font-mono text-xs">
                    <span className="text-emerald-400">Zero-Knowledge Proof of Funds</span> (Balance &gt; threshold)
                  </td>
                </tr>
                <tr className="hover:bg-midnight/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-dust">Banking Partner / Card Issuer</td>
                  <td className="py-4 px-6 text-dust/60">Public transaction receipts tied directly to KYC</td>
                  <td className="py-4 px-6 text-dust font-mono text-xs">
                    <span className="text-emerald-400">Screened edge settlement</span> with zero on-chain tracing
                  </td>
                </tr>
                <tr className="hover:bg-midnight/30 transition-colors">
                  <td className="py-4 px-6 font-medium text-dust">Business Client</td>
                  <td className="py-4 px-6 text-dust/60">Client sees your corporate treasury & supplier payouts</td>
                  <td className="py-4 px-6 text-dust font-mono text-xs">
                    <span className="text-emerald-400">One-time stealth addresses</span>; balance stays shielded
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 4: WHAT WE NEVER SEE */}
      <section className="relative py-16 md:py-24 border-t border-dusk/50 bg-[#0B0907]">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-[42rem] mb-12">
            <div className="text-mono-s uppercase tracking-wider text-sun mb-2">Cryptographic guarantees</div>
            <h2 className="text-heading-40 text-dust">What MARGINALIA never sees</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border border-dusk/60 bg-night p-6 rounded-xs">
              <span className="text-mono-s text-dust/40">01</span>
              <h3 className="text-heading-28 text-dust mt-2">Your Balances & Positions</h3>
              <p className="text-body-16-light text-dust/70 mt-3 leading-relaxed">
                Commitments are Poseidon hashes encrypted with your private secret. Neither relayer, sequencer, nor Magistrate node can inspect how much you hold.
              </p>
            </div>

            <div className="border border-dusk/60 bg-night p-6 rounded-xs">
              <span className="text-mono-s text-dust/40">02</span>
              <h3 className="text-heading-28 text-dust mt-2">Your Identity Records</h3>
              <p className="text-body-16-light text-dust/70 mt-3 leading-relaxed">
                We store zero personal information, IP addresses, or government identification documents. All proofs are computed client-side in WebAssembly.
              </p>
            </div>

            <div className="border border-dusk/60 bg-night p-6 rounded-xs">
              <span className="text-mono-s text-dust/40">03</span>
              <h3 className="text-heading-28 text-dust mt-2">No Master Backdoors</h3>
              <p className="text-body-16-light text-dust/70 mt-3 leading-relaxed">
                There is no administrative master key, god-mode freeze, or forced decryption circuit. Once an encrypted note is inscribed, only the holder of the private key can spend it.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
