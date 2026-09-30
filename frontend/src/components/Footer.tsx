"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, ExternalLink } from "lucide-react";
import MarginaliaLogo from "@/components/MarginaliaLogo";

export default function Footer() {
  return (
    <footer className="w-full bg-black py-16 text-white border-t border-dusk/60 relative z-20">
      <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 space-y-16 md:space-y-20 lg:space-y-24">
        {/* NOIRPAY SIGNATURE GLOWING CTA BANNER */}
        <div className="relative overflow-hidden rounded-xs bg-dusk border border-dusk/80">
          {/* Ambient Radial Gradients & Rule Grid Overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden bg-[linear-gradient(135deg,#1b1613_0%,#27221f_50%,#3f3630_100%)]"
          >
            <div className="absolute -right-[10%] -bottom-[60%] aspect-square w-[70%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,139,62,0.45)_0%,rgba(255,139,62,0.14)_38%,transparent_68%)] blur-2xl"></div>
            <div className="absolute -top-[40%] -left-[10%] aspect-square w-[45%] rounded-full bg-[radial-gradient(circle_at_center,rgba(251,246,236,0.10)_0%,transparent_65%)] blur-2xl"></div>
            <svg
              className="absolute inset-0 size-full opacity-[0.16]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern id="footer-rule-grid" width="72" height="72" patternUnits="userSpaceOnUse">
                  <path d="M72 0 H0 V72" fill="none" stroke="#fbf6ec" strokeOpacity="0.35"></path>
                  <rect x="0" y="0" width="3" height="3" fill="#fbf6ec" fillOpacity="0.6"></rect>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#footer-rule-grid)"></rect>
            </svg>
          </div>

          <div className="relative z-10 flex flex-col justify-between gap-y-12 px-6 py-10 sm:gap-y-16 sm:px-10 sm:py-14 lg:min-h-[22rem]">
            <div className="max-w-[42rem]">
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-sun mb-4">
                <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                <span>Robinhood Orbit L2 · Mathematical Privacy</span>
              </div>
              <h2 className="text-heading-56 font-light text-dust text-pretty">
                Proven in the margins. Hidden from the crowd.
              </h2>
              <p className="text-body-18-light text-dust/80 mt-3 max-w-[36rem]">
                Experience zero-knowledge shielded transactions on Robinhood Chain. Inscribe notes, synthesize proofs, and prove compliance without revealing your history.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/app"
                className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-6 py-3 text-center whitespace-nowrap transition-colors select-none bg-dust border-dust text-night hover:bg-sand font-mono text-xs font-semibold uppercase tracking-wider"
              >
                <span>Launch Shielded App</span>
                <ArrowRight className="size-3.5 ml-2" />
              </Link>
              <Link
                href="/codex"
                className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-5 py-3 text-center whitespace-nowrap transition-colors select-none bg-midnight border-dusk text-white hover:bg-night font-mono text-xs uppercase tracking-wider"
              >
                <span>Read the Codex</span>
              </Link>
            </div>
          </div>
        </div>

        {/* TECHNICAL PROTOCOL SPECIFICATION BADGE */}
        <div className="p-4 rounded-xs bg-night border border-dusk flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-2.5 text-dust">
            <span className="size-2 rounded-full bg-sun animate-pulse"></span>
            <span className="text-sun font-semibold uppercase">PROTOCOL STATUS :</span>
            <span className="text-dust/70">
              Working prototype · Robinhood Chain Testnet (Chain ID 46630) · Zero-Knowledge Groth16
            </span>
          </div>
          <div className="flex items-center gap-3 text-dust/50 text-[11px]">
            <span>BN254</span>
            <span>•</span>
            <span>circom 2.2.2</span>
            <span>•</span>
            <span>Poseidon T3/T4</span>
          </div>
        </div>

        {/* 4-COLUMN FOOTER DIRECTORY WITH NOIRPAY SLIDING ARROWS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-12">
          {/* Col 1: Protocol */}
          <div className="space-y-6">
            <h3 className="text-mono-s uppercase tracking-wider text-dust/50">Protocol</h3>
            <ul className="space-y-3.5 font-sans text-sm">
              <li>
                <Link className="group relative block" href="/app">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Shielded Terminal
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/app">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Poseidon Commitments
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/app">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Mersenne Courier
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/app">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Emergency Exit
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2: Verification */}
          <div className="space-y-6">
            <h3 className="text-mono-s uppercase tracking-wider text-dust/50">Verification</h3>
            <ul className="space-y-3.5 font-sans text-sm">
              <li>
                <Link className="group relative block" href="/explorer">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Folio Explorer
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/explorer">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Wax Seal Verifier
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/compliance">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Letter of Disclosure
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/compliance#screening">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    ASP Magistrate
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Research & Codex */}
          <div className="space-y-6">
            <h3 className="text-mono-s uppercase tracking-wider text-dust/50">Codex & Research</h3>
            <ul className="space-y-3.5 font-sans text-sm">
              <li>
                <Link className="group relative block" href="/codex">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    The Codex Mathematica
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/codex">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Fermat's Margin (1637)
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/codex">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    BN254 Cryptography
                  </span>
                </Link>
              </li>
              <li>
                <Link className="group relative block" href="/compliance">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    className="absolute top-1/2 left-0 w-3 -translate-y-1/2 scale-50 text-sun opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 6L10.5 6M10.5 6L6.2 10.3M10.5 6L6.2 1.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="square"
                    ></path>
                  </svg>
                  <span className="text-dust/80 group-hover:text-sun block transition-transform duration-200 group-hover:translate-x-5">
                    Selective Viewing Keys
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Network Specs */}
          <div className="space-y-6">
            <h3 className="text-mono-s uppercase tracking-wider text-dust/50">Chain & Network</h3>
            <ul className="space-y-3 font-mono text-xs text-dust/70">
              <li>
                <span className="text-dust/40 block text-[10px] uppercase">Rollup</span>
                <span>Robinhood Orbit L2</span>
              </li>
              <li>
                <span className="text-dust/40 block text-[10px] uppercase">Chain ID</span>
                <span>46630 (Testnet)</span>
              </li>
              <li>
                <span className="text-dust/40 block text-[10px] uppercase">Proof Protocol</span>
                <span>Groth16 (BN254)</span>
              </li>
              <li>
                <span className="text-dust/40 block text-[10px] uppercase">Hash Primitive</span>
                <span>Poseidon (T3/T4)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* BOTTOM COPYRIGHT WITH NOIRPAY BRACKET-X DIVIDER */}
        <div className="relative flex flex-col justify-between pt-8">
          <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-6 px-2">
            <div className="flex items-center gap-3">
              <MarginaliaLogo
                className="size-6 shrink-0"
                bracketColor="#ff8b3e"
                mColor="#fbf6ec"
              />
              <span className="font-cinzel text-xs tracking-wider text-dust/80 uppercase">
                © 2026 MARGINALIA PROTOCOL · ROBINHOOD CHAIN
              </span>
            </div>

            <div className="font-heading italic text-sm text-dust/60">
              "Fermat asked the world to trust him. Marginalia asks no one to trust anyone."
            </div>
          </div>

          <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
        </div>
      </div>
    </footer>
  );
}
