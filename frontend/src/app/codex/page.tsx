import Link from "next/link";
import { BookOpen, Shield, ArrowRight, Sparkles, Binary, Lock, Compass, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "The Codex — MARGINALIA",
  description: "Historical foundation, mathematical treatise, and cryptographic primitives of MARGINALIA on Robinhood Chain.",
};

export default function CodexPage() {
  return (
    <div className="min-h-screen bg-[#0B0907] text-white">
      {/* HERO SECTION */}
      <section className="relative overflow-clip pb-12 pt-8">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex flex-col justify-between">
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>
            
            <div className="flex flex-col justify-center py-8 lg:py-12 max-w-[46rem]">
              <div className="flex items-center gap-2.5 text-mono-s uppercase tracking-wider text-sun mb-3">
                <span className="size-1.5 rounded-full bg-sun"></span>
                <span>Historical Foundation & Mathematical Treatise</span>
              </div>
              <h1 className="text-heading-56 text-dust font-light text-pretty">
                The Codex of Marginalia
              </h1>
              <p className="font-heading italic text-xl sm:text-2xl text-sun/90 mt-3 font-light">
                "Proven in the margins. Hidden from the crowd."
              </p>
              <p className="text-body-18-light text-dust/70 mt-4 leading-relaxed">
                From Pierre de Fermat’s 1637 margin notes in Diophantus’ Arithmetica to Groth16 zero-knowledge SNARKs on Robinhood Chain Orbit L2: how mathematical truth exists without requiring public revelation.
              </p>
            </div>

            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
          </div>
        </div>
      </section>

      {/* TREATISE BODY */}
      <main className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="space-y-12 max-w-[54rem]">
          {/* Chapter I */}
          <div className="border border-dusk bg-night p-6 sm:p-10 rounded-xs relative">
            <div className="relative h-2 text-stroke-3 -mt-2 mb-4">
              <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
              <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
            </div>

            <div className="text-mono-s text-dust/40 uppercase mb-1">Chapter I</div>
            <h2 className="text-heading-28 text-dust mb-4">
              The Margin of Diophantus (1637)
            </h2>
            
            <div className="space-y-4 text-body-16-light text-dust/80 leading-relaxed">
              <p>
                In the winter of 1637, the French magistrate and mathematician <strong className="text-dust font-semibold">Pierre de Fermat</strong> was annotating Claude Gaspard Bachet’s Latin translation of Diophantus’ <em className="text-sun">Arithmetica</em>. Beside Problem 8 in Book II, Fermat famously inscribed:
              </p>

              <blockquote className="p-5 rounded-xs bg-[#14100e] border-l-2 border-sun font-serif italic text-dust/90 my-4 text-sm sm:text-base leading-relaxed">
                "Cubum autem in duos cubos, aut quadrato-quadratum in duos quadrato-quadratos, et generaliter nullam in infinitum ultra quadratum potestatem in duos eiusdem nominis fas est dividere: cuius rei demonstrationem mirabilem sane detexi. Hanc marginis exiguitas non caperet."
              </blockquote>

              <p className="text-xs font-mono text-dust/50">
                — Translation: "I have discovered a truly marvelous demonstration of this proposition, which this margin is too narrow to contain."
              </p>

              <p>
                Fermat possessed mathematical certainty of truth, but lacked the space to reveal the calculation. For 358 years, the world sought to reconstruct what lay in that narrow border until Andrew Wiles settled the proof in 1995.
              </p>

              <p>
                <strong className="text-dust font-semibold">MARGINALIA</strong> transposes Fermat's timeless paradox into modern cryptography: using Zero-Knowledge proofs, one can demonstrate computational correctness without publishing transaction histories or balances on public block explorers.
              </p>
            </div>

            <div className="relative h-2 text-stroke-3 -mb-2 mt-6">
              <div className="absolute size-2.5 border-current bottom-0 left-0 border-b border-l"></div>
              <div className="absolute size-2.5 border-current bottom-0 right-0 border-b border-r"></div>
            </div>
          </div>

          {/* Chapter II */}
          <div className="border border-dusk bg-night p-6 sm:p-10 rounded-xs relative">
            <div className="relative h-2 text-stroke-3 -mt-2 mb-4">
              <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
              <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
            </div>

            <div className="text-mono-s text-dust/40 uppercase mb-1">Chapter II</div>
            <h2 className="text-heading-28 text-dust mb-4">
              Cryptographic Primitives & Circuit Design
            </h2>

            <p className="text-body-16-light text-dust/80 leading-relaxed mb-6">
              The privacy engine of MARGINALIA is governed by Groth16 zero-knowledge SNARKs computed over the <code className="text-sun font-mono text-xs px-1.5 py-0.5 rounded bg-sun/10 border border-sun/20">BN254 (alt_bn128)</code> elliptic curve pairing:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                <div className="font-mono text-xs text-sun uppercase mb-1">Poseidon Hash Function</div>
                <p className="text-xs text-dust/70 leading-relaxed">
                  Optimized for arithmetic circuits with minimal S-box complexity (t=3 for tree leaves, t=4 for nullifiers).
                </p>
              </div>

              <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                <div className="font-mono text-xs text-sun uppercase mb-1">Folio Merkle Tree (2²⁰)</div>
                <p className="text-xs text-dust/70 leading-relaxed">
                  Sparse incremental Merkle tree supporting up to 1,048,576 private notes on Robinhood Chain Orbit L2.
                </p>
              </div>

              <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                <div className="font-mono text-xs text-sun uppercase mb-1">Association Set Buffer</div>
                <p className="text-xs text-dust/70 leading-relaxed">
                  A 16-root sliding window on MagistrateRegister ensuring zero illicit contagion without deanonymizing clean users.
                </p>
              </div>

              <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                <div className="font-mono text-xs text-sun uppercase mb-1">Single-Use Wax Seal</div>
                <p className="text-xs text-dust/70 leading-relaxed">
                  Nullifier derivation <code className="text-sun">H(sk, ρ)</code> ensures mathematical double-spending prevention.
                </p>
              </div>
            </div>

            <div className="relative h-2 text-stroke-3 -mb-2 mt-6">
              <div className="absolute size-2.5 border-current bottom-0 left-0 border-b border-l"></div>
              <div className="absolute size-2.5 border-current bottom-0 right-0 border-b border-r"></div>
            </div>
          </div>

          {/* CTA BAR */}
          <div className="relative flex flex-col justify-between pt-4">
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-6 px-4">
              <div>
                <h3 className="text-heading-28 text-dust">Ready to explore the shielded pool?</h3>
                <p className="text-sm text-dust/70 mt-1">Inscribe notes or synthesize proofs on Robinhood Chain.</p>
              </div>
              <Link
                href="/app"
                className="cursor-pointer rounded-xs border px-5 py-3 text-xs font-mono transition-colors select-none bg-dust border-dust text-night hover:bg-sand inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto font-medium"
              >
                <span>Launch Shielded dApp</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
          </div>
        </div>
      </main>
    </div>
  );
}
