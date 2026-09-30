"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Shield,
  ArrowRight,
  Lock,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Layers,
  Terminal,
  Activity,
  Code2,
  ExternalLink,
  BookOpen,
  Scale,
  Sparkles,
  Search,
  Check,
  Compass,
} from "lucide-react";

import TechCard from "@/components/TechCard";
import StatusChip from "@/components/StatusChip";
import ProgressGauge from "@/components/ProgressGauge";
import AnimatedCounter from "@/components/AnimatedCounter";
import LiveProtocolTicker from "@/components/LiveProtocolTicker";
import RevealMotion from "@/components/RevealMotion";
import NoirpayCircuitCard from "@/components/NoirpayCircuitCard";
import NoirpayAccountPreview from "@/components/NoirpayAccountPreview";
import { motion } from "framer-motion";

export default function HomePage() {
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number>(14);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);
  const [liveProofs, setLiveProofs] = useState<number>(126);
  const [activeStage, setActiveStage] = useState<number>(1);

  const dots = Array.from({ length: 30 }, (_, i) => i);

  // Auto-motion: Live verified proofs counter ticks periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveProofs((prev) => prev + 1);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  // Auto-motion: ASP diagram pipeline steps pulse sequentially
  useEffect(() => {
    const stageTimer = setInterval(() => {
      setActiveStage((prev) => (prev % 4) + 1);
    }, 2200);
    return () => clearInterval(stageTimer);
  }, []);

  // Auto-motion: Folio matrix active leaf hops periodically
  useEffect(() => {
    if (hoveredDot !== null) return;
    const dotTimer = setInterval(() => {
      setSelectedNoteIndex((prev) => (prev + 7) % 30);
    }, 3000);
    return () => clearInterval(dotTimer);
  }, [hoveredDot]);

  return (
    <div className="flex flex-col items-center overflow-hidden bg-[#0B0907] text-white">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION (EXACT NOIRPAY TWO-COLUMN LAYOUT) */}
      {/* ========================================================================= */}
      <section className="relative overflow-clip bg-[#0B0907] pb-12 pt-8 text-white md:pb-16 lg:pb-20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-x-8 gap-y-8 md:flex-row items-stretch">
            {/* Left Column: Headline & Value Proposition in Noirpay Brackets */}
            <div className="relative flex flex-col justify-between flex-1">
              <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>

              <div className="flex flex-col justify-center py-6 sm:py-8 lg:py-10">
                <div className="w-full max-w-[42.5rem] px-2 sm:px-4 lg:px-6">
                  {/* Top Status Tag */}
                  <div className="inline-flex items-center gap-x-2 rounded-xs border border-white/15 px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-dust mb-6 bg-night">
                    <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                    <span>ROBINHOOD CHAIN (46630) · GROTH16 ZK POOLS</span>
                  </div>

                  {/* Headline */}
                  <h1 className="text-heading-56 text-pretty text-dust mb-4">
                    PROVEN. <br />
                    <span className="italic animate-shimmer-gold drop-shadow-[0_0_24px_rgba(255,139,62,0.28)]">
                      NOT REVEALED.
                    </span>
                  </h1>

                  {/* Subtitle */}
                  <p className="text-body-18-light text-stroke-1 opacity-85 leading-relaxed max-w-[36rem] mb-8 font-body">
                    Marginalia is a self-custodial zero-knowledge privacy pool on Robinhood Chain. Your deposits and transaction history stay invisible on-chain, and still prove ownership, still withdraw unlinkably, still pass compliance.
                  </p>

                  {/* Noirpay Exact Button Actions */}
                  <div className="flex flex-wrap gap-x-4 gap-y-3 mb-8">
                    <Link
                      href="/app"
                      className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-5 py-3 text-center whitespace-nowrap transition-colors select-none bg-dust border-dust text-night hover:bg-sand font-medium text-xs sm:text-sm tracking-wide"
                    >
                      <span>dApp access</span>
                      <ArrowRight className="size-4 ml-2" />
                    </Link>

                    <Link
                      href="/codex"
                      className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-5 py-3 text-center whitespace-nowrap transition-colors select-none bg-midnight border-dusk text-white hover:bg-night font-medium text-xs sm:text-sm tracking-wide"
                    >
                      <BookOpen className="size-4 mr-2 text-sun" />
                      <span>Protocol & Docs</span>
                    </Link>
                  </div>

                  {/* Live Cryptographic Stream Ticker */}
                  <LiveProtocolTicker />
                </div>
              </div>

              <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
            </div>

            {/* Right Column: Noirpay Exact Interactive Circuit & Screen Pipeline */}
            <NoirpayCircuitCard />
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. RUNS ON BANNER (INFINITE AUTO-SCROLLING MARQUEE) */}
      {/* ========================================================================= */}
      <section className="w-full border-y border-dusk bg-night/80 py-4 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-6">
          <div className="text-body-15-light text-stroke-2 font-mono uppercase tracking-widest text-xs shrink-0 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
            <span>Runs on</span>
          </div>
          <div className="flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
            <div className="flex items-center gap-8 whitespace-nowrap animate-marquee-x font-mono text-xs text-stroke-2">
              <span className="text-dust font-medium">ROBINHOOD CHAIN (46630)</span>
              <span className="text-sun">◈</span>
              <span>GROTH16 ZK-SNARK</span>
              <span className="text-sun">◈</span>
              <span>POSEIDON T3/T4</span>
              <span className="text-sun">◈</span>
              <span className="text-dust font-medium">BN254 (ALT_BN128)</span>
              <span className="text-sun">◈</span>
              <span>CIRCOMLIB 2.2</span>
              <span className="text-sun">◈</span>
              <span>ARBITRUM ORBIT L2</span>
              <span className="text-sun">◈</span>
              <span className="text-sun font-medium">UNLINKABLE PAYOUTS</span>
              <span className="text-sun">◈</span>
              <span className="text-dust font-medium">ROBINHOOD CHAIN (46630)</span>
              <span className="text-sun">◈</span>
              <span>GROTH16 ZK-SNARK</span>
              <span className="text-sun">◈</span>
              <span>POSEIDON T3/T4</span>
              <span className="text-sun">◈</span>
              <span className="text-dust font-medium">BN254 (ALT_BN128)</span>
              <span className="text-sun">◈</span>
              <span>CIRCOMLIB 2.2</span>
              <span className="text-sun">◈</span>
              <span>ARBITRUM ORBIT L2</span>
              <span className="text-sun">◈</span>
              <span className="text-sun font-medium">UNLINKABLE PAYOUTS</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. LIVE PROTOCOL STATS (EXACT NOIRPAY METRIC CARDS) */}
      {/* ========================================================================= */}
      <section className="w-full bg-[#0a0807] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealMotion direction="up">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-left">
              {/* Card 1: Deposited */}
              <TechCard className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-stroke-2 uppercase tracking-wider">
                    Deposited
                  </span>
                  <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                </div>
                <div className="font-heading text-2xl font-normal text-dust">
                  <AnimatedCounter end={12.4} decimals={1} suffix=" ETH" />
                </div>
                <ProgressGauge progressPercentage={65} className="mt-3" />
                <span className="text-[10px] text-stroke-3 font-mono mt-1.5 block">In Folio Pool</span>
              </TechCard>

              {/* Card 2: Shielded */}
              <TechCard className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-stroke-2 uppercase tracking-wider">
                    Shielded
                  </span>
                  <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                </div>
                <div className="font-heading text-2xl font-normal text-dust">
                  <AnimatedCounter end={48} suffix=" Notes" />
                </div>
                <ProgressGauge progressPercentage={78} className="mt-3" />
                <span className="text-[10px] text-stroke-3 font-mono mt-1.5 block">Anonymity Set</span>
              </TechCard>

              {/* Card 3: Proofs */}
              <TechCard className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-stroke-2 uppercase tracking-wider">
                    Proofs
                  </span>
                  <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                </div>
                <div className="font-heading text-2xl font-normal text-dust flex items-baseline gap-1.5">
                  <AnimatedCounter end={liveProofs} />
                  <span className="text-[10px] font-mono text-emerald-400">✓ live</span>
                </div>
                <ProgressGauge progressPercentage={84} className="mt-3" />
                <span className="text-[10px] text-stroke-3 font-mono mt-1.5 block">Synthesized</span>
              </TechCard>

              {/* Card 4: Folio Root */}
              <TechCard className="p-4" bracketColor="text-emerald-500">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-stroke-2 uppercase tracking-wider">
                    Folio Root
                  </span>
                  <span className="size-1.5 rounded-full bg-emerald-400"></span>
                </div>
                <div className="font-heading text-2xl font-normal text-emerald-400">Verified</div>
                <ProgressGauge progressPercentage={100} gradientFrom="#10b981" gradientTo="#34d399" className="mt-3" />
                <span className="text-[10px] text-stroke-3 font-mono mt-1.5 block">Depth 20 Merkle</span>
              </TechCard>

              {/* Card 5: ASP Root */}
              <TechCard className="p-4" bracketColor="text-sun">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-stroke-2 uppercase tracking-wider">
                    ASP Root
                  </span>
                  <span className="size-1.5 rounded-full bg-sun"></span>
                </div>
                <div className="font-heading text-2xl font-normal text-sun">Active</div>
                <ProgressGauge progressPercentage={92} gradientFrom="#ff8b3e" gradientTo="#fbefd6" className="mt-3" />
                <span className="text-[10px] text-stroke-3 font-mono mt-1.5 block">Magistrate Window</span>
              </TechCard>

              {/* Card 6: Chain ID */}
              <TechCard className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-stroke-2 uppercase tracking-wider">
                    Chain ID
                  </span>
                  <span className="size-1.5 rounded-full bg-white"></span>
                </div>
                <div className="font-heading text-2xl font-normal text-dust">46630</div>
                <ProgressGauge progressPercentage={100} className="mt-3" />
                <span className="text-[10px] text-stroke-3 font-mono mt-1.5 block">Robinhood Orbit L2</span>
              </TechCard>
            </div>
          </RevealMotion>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. THE PROBLEM SECTION (EXACT NOIRPAY ORBIT SHOWCASE WITH GLOW & ARCS) */}
      {/* ========================================================================= */}
      <section
        id="orbitshowcase"
        className="relative overflow-clip w-full bg-[linear-gradient(180deg,oklch(0.1415_0.0060_70.62)_58%,oklch(0.3898_0.1135_266.05)_100%)] pt-16 pb-36 text-white md:pt-20 lg:pt-32 lg:pb-64"
      >
        {/* Glowing Radial Blur Ellipse with Ambient Breathing Motion */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -bottom-42 left-1/2 h-[300px] w-[1500px] max-w-none -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,_white_0%,_white_55%,_transparent_85%)] blur-[50px] md:-bottom-48 md:h-[399px] md:w-[3840px] animate-glow-breathe"></div>
          <div className="absolute inset-x-0 bottom-0 z-50 h-20 bg-linear-to-t from-white via-white via-[30%] md:h-[180px]"></div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10 flex flex-col items-center">
          {/* Top Arc and Problem Header */}
          <div className="text-center mb-8">
            <div className="text-mono-s uppercase opacity-60 text-dust mb-3 tracking-widest">
              The Blockchain Dilemma
            </div>
            <div className="w-px h-16 bg-linear-to-b from-white opacity-50 mx-auto mb-6"></div>
          </div>

          <h2 className="text-heading-48 text-center text-dust max-w-3xl mb-8 leading-tight">
            Public Blockchains Expose Everything.
          </h2>

          <div className="text-heading-32 text-center text-dust/90 max-w-2xl mb-14 leading-relaxed font-light">
            <p>
              On Robinhood Chain, payroll-grade stablecoins and tokenized assets sit in public addresses. A single transaction leaks your balance, counterparties, and net worth all at once.
            </p>
            <p className="mt-6 text-base text-stroke-1 opacity-80 font-body">
              Every legacy privacy tool turns that capital into dead funds the moment you deposit. No yield, no compliance statements, and nothing you can show a regulator.
            </p>
          </div>

          {/* Problem vs Solution Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full items-stretch">
            {/* The Problem Card */}
            <RevealMotion direction="right" delay={0.1}>
              <div className="p-8 rounded-xs border border-rose-900/60 bg-night/95 relative flex flex-col justify-between h-full">
                <div className="absolute size-3 border-rose-700/80 top-0 left-0 border-t border-l" />
                <div className="absolute size-3 border-rose-700/80 top-0 right-0 border-t border-r" />
                <div className="absolute size-3 border-rose-700/80 bottom-0 left-0 border-b border-l" />
                <div className="absolute size-3 border-rose-700/80 bottom-0 right-0 border-b border-r" />

                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xs bg-rose-950/60 border border-rose-800/40 text-[11px] font-mono text-rose-300 mb-6">
                    <AlertTriangle className="size-3.5 text-rose-400" />
                    <span>THE STATUS QUO</span>
                  </div>
                  <h3 className="font-heading text-2xl text-dust mb-3">
                    Address → Amount → Transaction
                  </h3>
                  <p className="text-xs sm:text-sm text-stroke-1 font-body leading-relaxed mb-6">
                    Every transaction broadcasts your entire financial history. Balances, vendors, and payroll are permanently recorded on public block explorers.
                  </p>

                  <div className="p-4 rounded-xs bg-black/80 border border-dusk font-mono text-xs text-stroke-2 space-y-2">
                    <div className="flex items-center justify-between text-sun">
                      <span>Alice (0x7099...)</span>
                      <span>Public Sender</span>
                    </div>
                    <div className="text-center text-stroke-3">↓ 0.3 ETH (Visible on Explorer)</div>
                    <div className="flex items-center justify-between text-rose-400">
                      <span>Wallet B (0x3C44...)</span>
                      <span>Permanently Linked</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dusk text-[11px] font-mono text-rose-400">
                  ✗ Total loss of financial confidentiality
                </div>
              </div>
            </RevealMotion>

            {/* The Solution Card */}
            <RevealMotion direction="left" delay={0.15}>
              <div className="p-8 rounded-xs border border-sun/60 bg-night/95 relative flex flex-col justify-between h-full">
                <div className="absolute size-3 border-sun top-0 left-0 border-t border-l" />
                <div className="absolute size-3 border-sun top-0 right-0 border-t border-r" />
                <div className="absolute size-3 border-sun bottom-0 left-0 border-b border-l" />
                <div className="absolute size-3 border-sun bottom-0 right-0 border-b border-r" />

                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xs bg-midnight border border-sun/40 text-[11px] font-mono text-sun mb-6">
                    <Sparkles className="size-3.5 text-sun" />
                    <span>THE MARGINALIA SOLUTION</span>
                  </div>
                  <h3 className="font-heading text-2xl text-dust mb-3">
                    Prove Ownership Without Revealing The Note
                  </h3>
                  <p className="text-xs sm:text-sm text-stroke-1 font-body leading-relaxed mb-6">
                    Deposits enter the Folio privacy pool under a cryptographic commitment. When withdrawing, you submit a Groth16 zero-knowledge proof proving note ownership without revealing which note is yours.
                  </p>

                  <div className="p-4 rounded-xs bg-black/80 border border-dusk font-mono text-xs text-stroke-2 space-y-2">
                    <div className="flex items-center justify-between text-sun">
                      <span>Folio Anonymity Set (2²⁰)</span>
                      <span>Hidden Note in Tree</span>
                    </div>
                    <div className="text-center text-emerald-400 font-semibold">
                      ↓ Groth16 Proof (Publicly Verified)
                    </div>
                    <div className="flex items-center justify-between text-emerald-400">
                      <span>Clean Recipient</span>
                      <span>Unlinkable Payout ✓</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dusk text-[11px] font-mono text-sun">
                  ✓ The proof is public. The note remains secret.
                </div>
              </div>
            </RevealMotion>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. MARGINALIA IS AN ACCOUNT, NOT A MIXER (EXACT NOIRPAY ACCOUNT SHOWCASE) */}
      {/* ========================================================================= */}
      <section className="relative overflow-clip bg-linear-to-b from-white to-dust pb-24 text-black pt-20 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
          <div className="flex max-w-[46rem] flex-col items-center gap-y-4 mb-14">
            <img
              src="/marginalia.png"
              alt="Marginalia Logo"
              className="size-10 rounded-xs object-contain mb-2"
            />
            <h2 className="text-heading-48 text-pretty text-black">
              Marginalia is an account, not a mixer
            </h2>
            <p className="text-body-18-light text-night/80 max-w-[43rem] font-body leading-relaxed">
              Underneath the interface is a note-based shielded pool secured by Groth16 zero-knowledge proofs. Funds enter through licensed ramps, get screened by Association Set Providers (ASP) at the edge, and land as encrypted notes tied to your spending key. Balances stay shielded, withdrawals go to fresh addresses without link, and when you need compliance, you hand over a scoped Letter of Disclosure instead of your entire wallet history.
            </p>
          </div>

          {/* Exact Noirpay Mockup Dashboard SVG with Animated Graph & Progress Gauges */}
          <NoirpayAccountPreview />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. HOW IT WORKS (THE 5-STEP LIFECYCLE) */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="w-full border-t border-dusk bg-[#0a0807] py-24 text-dust">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealMotion direction="up">
            <div className="text-center mb-16">
              <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
                Section 02 • Verifiable State Transition
              </div>
              <h2 className="text-heading-48 text-dust">
                The 5-Step Lifecycle
              </h2>
              <p className="text-body-16-light text-stroke-2 mt-3 max-w-xl mx-auto">
                From deposit inscription to screened proof and clean payout on Robinhood Chain.
              </p>
            </div>
          </RevealMotion>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                title: "Deposit",
                desc: "Generate private secret (sk, ρ) locally and deposit ETH with precommitment. The pool assigns a label and writes the commitment into the Folio tree.",
                math: "cm = Poseidon(v, l, pre)",
              },
              {
                step: "02",
                title: "Screening",
                desc: "The Magistrate (Association Set Provider) screens the deposit against sanctions and exploit lists, publishing approved label roots to the register.",
                math: "aspRoot = latestRoot()",
              },
              {
                step: "03",
                title: "Generate Proof",
                desc: "Synthesize a Groth16 zk-SNARK proof locally in your browser (~3.6s) proving note ownership and ASP inclusion without revealing your note.",
                math: "24,236 Constraints",
              },
              {
                step: "04",
                title: "Withdraw",
                desc: "Submit the proof through the Mersenne Courier relayer to any clean recipient address. The Wax Seal nullifier is broken to prevent double spends.",
                math: "N = Poseidon(sk, ρ)",
              },
              {
                step: "05",
                title: "Change Note",
                desc: "The unspent balance automatically re-enters the Folio as a fresh change note with new entropy ρ', keeping the note approved for future spends.",
                math: "cm' = Poseidon(rem, l, pre')",
              },
            ].map((item, idx) => (
              <RevealMotion key={item.step} delay={0.1 + idx * 0.08} className="h-full">
                <TechCard className="h-full p-6 flex flex-col justify-between">
                  <div>
                    <span className="font-heading text-3xl font-light text-sun block mb-2">
                      {item.step}
                    </span>
                    <h4 className="font-heading text-lg text-dust mb-2">
                      {item.title}
                    </h4>
                    <p className="text-xs text-stroke-1 leading-relaxed font-body">
                      {item.desc}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-dusk font-mono text-[10px] text-stroke-3">
                    {item.math}
                  </div>
                </TechCard>
              </RevealMotion>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. THE PRIVACY LAYER & "THE FOLIO" VISUALIZATION (RADAR SWEEP) */}
      {/* ========================================================================= */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <RevealMotion direction="up">
          <div className="text-center mb-12">
            <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
              Section 03 • Signature Visual Architecture
            </div>
            <h2 className="text-heading-48 text-dust">
              The Privacy Layer
            </h2>
            <p className="text-body-16-light text-stroke-2 mt-3 max-w-xl mx-auto">
              The Folio acts as a cryptographic collective. Your note is one of over a million leaves in the tree.
            </p>
          </div>
        </RevealMotion>

        {/* Signature Folio Matrix Card with Live Radar Sweep Animation */}
        <RevealMotion delay={0.15}>
          <div className="p-8 sm:p-12 rounded-xs border border-dusk bg-night/95 max-w-3xl mx-auto shadow-2xl relative overflow-hidden">
            {/* 4-corner brackets */}
            <div className="absolute size-3 border-current text-stroke-3 top-0 left-0 border-t border-l" />
            <div className="absolute size-3 border-current text-stroke-3 top-0 right-0 border-t border-r" />
            <div className="absolute size-3 border-current text-stroke-3 bottom-0 left-0 border-b border-l" />
            <div className="absolute size-3 border-current text-stroke-3 bottom-0 right-0 border-b border-r" />

            {/* Animated Vertical Radar Sweep Beam */}
            <div className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#ff8b3e]/15 to-transparent animate-radar-sweep" />

            <div className="flex items-center justify-between mb-8 border-b border-dusk pb-4 font-mono text-xs relative z-10">
              <span className="text-sun font-semibold tracking-wider flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                MARGINALIA FOLIO (DEPTH 20)
              </span>
              <span className="text-stroke-2">CAPACITY: 1,048,576 NOTES</span>
            </div>

            {/* Interactive Note Grid with Animated Leaves */}
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-3 sm:gap-4 justify-items-center my-6 relative z-10">
              {dots.map((dot) => {
                const isSelected = dot === selectedNoteIndex;
                const isHovered = dot === hoveredDot;
                const isPulsingLeaf = dot === 7 || dot === 19 || dot === 28;
                return (
                  <motion.button
                    key={dot}
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    onClick={() => setSelectedNoteIndex(dot)}
                    onMouseEnter={() => setHoveredDot(dot)}
                    onMouseLeave={() => setHoveredDot(null)}
                    className={`w-8 h-8 rounded-xs flex items-center justify-center transition-colors duration-200 relative cursor-pointer ${
                      isSelected
                        ? "bg-sun text-night ring-4 ring-sun/40 shadow-lg shadow-sun/40 animate-beacon-ring"
                        : isPulsingLeaf
                        ? "bg-midnight text-sun animate-pulse-dot"
                        : "bg-[#14100e] hover:bg-midnight text-stroke-3"
                    }`}
                    title={
                      isSelected
                        ? "Your Secret Note (Private)"
                        : isPulsingLeaf
                        ? "Recent Inscribed Leaf (Real-time)"
                        : `Inscribed Leaf #${dot + 1042}`
                    }
                  >
                    <span
                      className={`text-xs font-mono ${
                        isSelected
                          ? "text-night font-bold"
                          : isPulsingLeaf
                          ? "text-sun"
                          : "text-stroke-3"
                      }`}
                    >
                      {isSelected ? "◉" : isPulsingLeaf ? "✦" : "●"}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <div className="text-center mt-8 pt-6 border-t border-dusk">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-sun mb-2">
                <span>↑ Note Leaf Index #{selectedNoteIndex + 1042}</span>
                <span className="wax-seal-badge text-[10px]">Your Secret Note</span>
              </div>

              <div className="font-heading text-2xl text-dust max-w-md mx-auto my-3">
                "I own a valid note."
              </div>

              <p className="text-xs text-stroke-2 font-mono">
                You prove ownership. You never reveal which note is yours.
              </p>

              <div className="mt-4 inline-block px-4 py-1.5 rounded-xs bg-midnight border border-dusk text-[11px] font-mono text-sun">
                PROOF ≠ DISCLOSURE
              </div>
            </div>
          </div>
        </RevealMotion>
      </section>

      {/* ========================================================================= */}
      {/* 8. WHAT THE PROOF GUARANTEES (5 INVARIANTS) */}
      {/* ========================================================================= */}
      <section className="w-full border-t border-dusk bg-[#0c0908] py-24 text-dust">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealMotion direction="up">
            <div className="text-center mb-14">
              <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
                Section 04 • Cryptographic Guarantees
              </div>
              <h2 className="text-heading-48 text-dust">
                What The Proof Guarantees
              </h2>
              <p className="text-body-16-light text-stroke-2 mt-3">
                The verifier contract checks 5 mathematical statements on-chain without learning anything about your identity.
              </p>
            </div>
          </RevealMotion>

          <RevealMotion delay={0.15}>
            <div className="p-8 sm:p-10 rounded-xs border border-dusk bg-night/95 space-y-4 relative">
              <div className="absolute size-3 border-current text-stroke-3 top-0 left-0 border-t border-l" />
              <div className="absolute size-3 border-current text-stroke-3 top-0 right-0 border-t border-r" />
              <div className="absolute size-3 border-current text-stroke-3 bottom-0 left-0 border-b border-l" />
              <div className="absolute size-3 border-current text-stroke-3 bottom-0 right-0 border-b border-r" />

              {[
                {
                  title: "Note Exists in the Folio",
                  desc: "The note commitment is proven to reside within the last 64 Merkle state roots.",
                },
                {
                  title: "Note is Approved by Magistrate",
                  desc: "The note's label belongs to the latest published Association Set Provider (ASP) root.",
                },
                {
                  title: "Wax Seal (Nullifier) is Unspent",
                  desc: "Double-spending is impossible: the unique nullifier N has never appeared on-chain.",
                },
                {
                  title: "Withdrawal Value is Valid",
                  desc: "Circuit enforces Num2Bits(128) overdraft lock; you cannot withdraw more than the note value.",
                },
                {
                  title: "Recipient & Fee Are Bound",
                  desc: "Proof is bound to keccak256(chainid, pool, recipient, relayer, fee); it cannot be front-run.",
                },
              ].map((item) => (
                <motion.div
                  key={item.title}
                  whileHover={{ x: 6, backgroundColor: "rgba(255, 139, 62, 0.05)" }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-3.5 p-3.5 rounded-xs bg-midnight/70 border border-dusk transition-colors"
                >
                  <CheckCircle2 className="size-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-mono text-sm font-semibold text-dust block">
                      {item.title}
                    </span>
                    <span className="text-xs text-stroke-2 font-body">{item.desc}</span>
                  </div>
                </motion.div>
              ))}

              <div className="pt-6 text-center border-t border-dusk">
                <span className="font-mono text-xs uppercase tracking-widest text-sun font-bold">
                  WITHOUT REVEALING THE NOTE
                </span>
              </div>
            </div>
          </RevealMotion>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 9. COMPLIANCE WITHOUT PUBLIC DISCLOSURE (ASP) */}
      {/* ========================================================================= */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-dust">
        <RevealMotion direction="up">
          <div className="text-center mb-16">
            <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
              Section 05 • Association Set Provider (ASP)
            </div>
            <h2 className="text-heading-48 text-dust">
              Compliance Without Public Disclosure
            </h2>
            <p className="text-body-16-light text-stroke-2 mt-3 max-w-xl mx-auto">
              Privacy without abandoning verification. Proving that your funds originate from clean association sets.
            </p>
          </div>
        </RevealMotion>

        {/* Diagram Flow */}
        <RevealMotion delay={0.15}>
          <div className="p-8 sm:p-12 rounded-xs border border-dusk bg-night/95 max-w-3xl mx-auto text-center relative">
            <div className="absolute size-3 border-current text-stroke-3 top-0 left-0 border-t border-l" />
            <div className="absolute size-3 border-current text-stroke-3 top-0 right-0 border-t border-r" />
            <div className="absolute size-3 border-current text-stroke-3 bottom-0 left-0 border-b border-l" />
            <div className="absolute size-3 border-current text-stroke-3 bottom-0 right-0 border-b border-r" />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs mb-8">
              <motion.div
                whileHover={{ y: -3 }}
                className={`p-3.5 rounded-xs transition-all duration-500 flex-1 w-full sm:w-auto border ${
                  activeStage === 1
                    ? "bg-midnight border-sun shadow-md shadow-sun/20 ring-1 ring-sun/30"
                    : "bg-midnight/60 border-dusk opacity-70"
                }`}
              >
                <span className={`block text-[10px] ${activeStage === 1 ? "text-sun font-bold" : "text-stroke-3"}`}>
                  STAGE 1 {activeStage === 1 && "●"}
                </span>
                <span className="text-dust font-semibold">Deposit Label</span>
              </motion.div>
              <span className={`transition-all duration-300 ${activeStage === 1 || activeStage === 2 ? "text-sun font-bold scale-110" : "text-stroke-3"}`}>
                →
              </span>
              <motion.div
                whileHover={{ y: -3 }}
                className={`p-3.5 rounded-xs transition-all duration-500 flex-1 w-full sm:w-auto border ${
                  activeStage === 2
                    ? "bg-midnight border-sun shadow-md shadow-sun/20 ring-1 ring-sun/30"
                    : "bg-midnight/60 border-dusk opacity-70"
                }`}
              >
                <span className={`block text-[10px] ${activeStage === 2 ? "text-sun font-bold" : "text-stroke-3"}`}>
                  STAGE 2 {activeStage === 2 && "●"}
                </span>
                <span className="text-dust font-semibold">Magistrate Screening</span>
              </motion.div>
              <span className={`transition-all duration-300 ${activeStage === 2 || activeStage === 3 ? "text-sun font-bold scale-110" : "text-stroke-3"}`}>
                →
              </span>
              <motion.div
                whileHover={{ y: -3 }}
                className={`p-3.5 rounded-xs transition-all duration-500 flex-1 w-full sm:w-auto border ${
                  activeStage === 3
                    ? "bg-midnight border-sun shadow-md shadow-sun/20 ring-1 ring-sun/30"
                    : "bg-midnight/60 border-dusk opacity-70"
                }`}
              >
                <span className={`block text-[10px] ${activeStage === 3 ? "text-sun font-bold" : "text-stroke-3"}`}>
                  STAGE 3 {activeStage === 3 && "●"}
                </span>
                <span className="text-dust font-semibold">Approved ASP Tree</span>
              </motion.div>
              <span className={`transition-all duration-300 ${activeStage === 3 || activeStage === 4 ? "text-emerald-400 font-bold scale-110" : "text-stroke-3"}`}>
                →
              </span>
              <motion.div
                whileHover={{ y: -3 }}
                className={`p-3.5 rounded-xs transition-all duration-500 flex-1 w-full sm:w-auto border ${
                  activeStage === 4
                    ? "bg-midnight border-emerald-400 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/30"
                    : "bg-midnight/60 border-dusk opacity-70"
                }`}
              >
                <span className={`block text-[10px] ${activeStage === 4 ? "text-emerald-400 font-bold" : "text-stroke-3"}`}>
                  STAGE 4 {activeStage === 4 && "●"}
                </span>
                <span className="text-emerald-300 font-semibold">ZK Proof Payout</span>
              </motion.div>
            </div>

            <p className="text-xs sm:text-sm text-stroke-1 leading-relaxed max-w-xl mx-auto font-body">
              Unlike legacy mixers that pool illicit and honest funds together, MARGINALIA enforces association set proofs. Users prove their note belongs to the approved whitelist of non-sanctioned deposits, stopping contagion while keeping individual wallets private.
            </p>
          </div>
        </RevealMotion>
      </section>

      {/* ========================================================================= */}
      {/* 10. TECHNOLOGY UNDER THE HOOD (4 PRIMITIVES) */}
      {/* ========================================================================= */}
      <section id="technology" className="w-full border-t border-dusk bg-[#0a0807] py-24 text-dust">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealMotion direction="up">
            <div className="text-center mb-16">
              <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
                Section 06 • Cryptographic Engine
              </div>
              <h2 className="text-heading-48 text-dust">
                Technology Under The Hood
              </h2>
              <p className="text-body-16-light text-stroke-2 mt-3 max-w-xl mx-auto">
                The mathematical primitives and zero-knowledge circuit components powering the protocol.
              </p>
            </div>
          </RevealMotion>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: "PROVING SYSTEM", title: "Groth16", sub: "circom 2.2.2 + snarkjs" },
              { label: "CURVE FIELD", title: "BN254", sub: "alt_bn128 scalar field" },
              { label: "HASH FUNCTION", title: "Poseidon", sub: "circomlib T3 / T4" },
              { label: "STATE STORAGE", title: "Merkle Tree", sub: "Depth 20 • 64 root ring" },
            ].map((tech, idx) => (
              <RevealMotion key={tech.title} delay={idx * 0.08} className="h-full">
                <TechCard className="h-full p-5">
                  <div className="text-xs font-mono text-sun mb-1">{tech.label}</div>
                  <h4 className="font-heading text-lg text-dust">
                    {tech.title}
                  </h4>
                  <p className="text-[11px] text-stroke-2 mt-1 font-mono">{tech.sub}</p>
                </TechCard>
              </RevealMotion>
            ))}
          </div>

          <RevealMotion delay={0.3} className="text-center">
            <Link
              href="/codex"
              className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-6 py-3 text-center whitespace-nowrap transition-colors select-none bg-midnight border-dusk text-white hover:bg-night font-medium text-xs tracking-wider uppercase font-mono"
            >
              <span>Explore Architecture & Public Signals</span>
              <ArrowRight className="size-3.5 ml-2" />
            </Link>
          </RevealMotion>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 11. SECURITY & TRANSPARENCY (HONEST DEV BRIEF POSTURE) */}
      {/* ========================================================================= */}
      <section id="security" className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-dust">
        <RevealMotion direction="up">
          <div className="text-center mb-14">
            <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
              Section 07 • Honest Engineering
            </div>
            <h2 className="text-heading-48 text-dust">
              Built To Be Verified
            </h2>
            <p className="text-body-16-light text-stroke-2 mt-3 max-w-xl mx-auto">
              We prioritize cryptographic honesty over marketing hype. All invariants are test-covered.
            </p>
          </div>
        </RevealMotion>

        <RevealMotion delay={0.15}>
          <div className="p-8 sm:p-10 rounded-xs border border-dusk bg-night/95 max-w-3xl mx-auto relative">
            <div className="absolute size-3 border-current text-stroke-3 top-0 left-0 border-t border-l" />
            <div className="absolute size-3 border-current text-stroke-3 top-0 right-0 border-t border-r" />
            <div className="absolute size-3 border-current text-stroke-3 bottom-0 left-0 border-b border-l" />
            <div className="absolute size-3 border-current text-stroke-3 bottom-0 right-0 border-b border-r" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-center">
              <motion.div whileHover={{ y: -3 }} className="p-4 rounded-xs bg-midnight border border-dusk">
                <span className="text-xs font-mono text-stroke-2 block mb-1">STATUS</span>
                <span className="font-heading text-lg text-sun">Prototype</span>
              </motion.div>

              <motion.div whileHover={{ y: -3 }} className="p-4 rounded-xs bg-midnight border border-dusk">
                <span className="text-xs font-mono text-stroke-2 block mb-1">ENVIRONMENT</span>
                <span className="font-heading text-lg text-dust">Testnet Only</span>
              </motion.div>

              <motion.div whileHover={{ y: -3 }} className="p-4 rounded-xs bg-midnight border border-rose-900/40">
                <span className="text-xs font-mono text-stroke-2 block mb-1">AUDIT NOTICE</span>
                <span className="font-heading text-lg text-rose-300">Not Audited</span>
              </motion.div>
            </div>

            <div className="p-4 rounded-xs bg-midnight border border-dusk flex items-center justify-between font-mono text-xs text-stroke-1 mb-8">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>Full CLI flow (deploy → deposit → approve → withdraw)</span>
              </span>
              <span className="text-emerald-400 font-bold">12 / 12 PASSING</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-xs">
              <Link
                href="/explorer"
                className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-4 py-2 text-center whitespace-nowrap transition-colors select-none bg-midnight border-dusk text-white hover:bg-night"
              >
                <ExternalLink className="size-3.5 mr-1.5 text-sun" />
                <span>View Contracts</span>
              </Link>
              <Link
                href="/app"
                className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-4 py-2 text-center whitespace-nowrap transition-colors select-none bg-midnight border-dusk text-white hover:bg-night"
              >
                <Terminal className="size-3.5 mr-1.5 text-sun" />
                <span>Run Browser Tests</span>
              </Link>
              <Link
                href="/codex"
                className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-4 py-2 text-center whitespace-nowrap transition-colors select-none bg-midnight border-dusk text-white hover:bg-night"
              >
                <BookOpen className="size-3.5 mr-1.5 text-sun" />
                <span>View Technical Docs</span>
              </Link>
            </div>
          </div>
        </RevealMotion>
      </section>

      {/* ========================================================================= */}
      {/* 12. THE MARGINALIA NOMENCLATURE (LORE MAP) */}
      {/* ========================================================================= */}
      <section className="w-full border-t border-dusk bg-[#0c0908] py-24 text-dust">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealMotion direction="up">
            <div className="text-center mb-16">
              <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
                Section 08 • The Nomenclature
              </div>
              <h2 className="text-heading-48 text-dust">
                The Marginalia System
              </h2>
            </div>
          </RevealMotion>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                tag: "NOTE COMMITMENT",
                title: "Marginal Note",
                desc: "The user's secret note holding private key sk, nullifier entropy ρ, and commitment cm.",
              },
              {
                tag: "STATE TREE",
                title: "The Folio",
                desc: "Incremental Merkle tree of depth 20 holding up to 1,048,576 notes on MarginaliaPool.",
              },
              {
                tag: "DOUBLE-SPEND GUARD",
                title: "Wax Seal",
                desc: "Single-use nullifier hash N = Poseidon(sk, ρ). Stored on-chain to prevent double spending.",
              },
              {
                tag: "COMPLIANCE SERVICE",
                title: "Magistrate",
                desc: "Association Set Provider publishing approved deposit label roots to the registry.",
              },
              {
                tag: "GAS RELAYER",
                title: "Mersenne Courier",
                desc: "Gas sponsorship relayer executing withdrawals to fresh addresses without gas link.",
              },
              {
                tag: "ANONYMITY SET",
                title: "The Circle",
                desc: "The collective set of all notes in the Folio among which your withdrawal is indistinguishable.",
              },
            ].map((lore, idx) => (
              <RevealMotion key={lore.title} delay={(idx % 3) * 0.08} className="h-full">
                <TechCard className="h-full p-6">
                  <div className="text-xs font-mono text-sun mb-1">{lore.tag}</div>
                  <h4 className="font-heading text-lg text-dust mb-2">
                    {lore.title}
                  </h4>
                  <p className="text-xs text-stroke-1 leading-relaxed font-body">{lore.desc}</p>
                </TechCard>
              </RevealMotion>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 13. PROTOCOL ROADMAP */}
      {/* ========================================================================= */}
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-dust">
        <RevealMotion direction="up">
          <div className="text-center mb-16">
            <div className="text-mono-s text-sun uppercase tracking-widest mb-3">
              Section 09 • Milestone Trajectory
            </div>
            <h2 className="text-heading-48 text-dust">
              Protocol Roadmap
            </h2>
          </div>
        </RevealMotion>

        <div className="space-y-4">
          <RevealMotion delay={0.05}>
            <motion.div
              whileHover={{ x: 6 }}
              className="p-5 rounded-xs bg-midnight border border-emerald-900/60 flex items-center justify-between font-mono text-xs relative"
            >
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-bold">01</span>
                <div>
                  <span className="text-dust font-semibold block">PROTOTYPE</span>
                  <span className="text-stroke-2 text-[11px]">Circuits, pool contract, register, CLI, 12 passing tests</span>
                </div>
              </div>
              <span className="text-emerald-400 font-semibold">COMPLETED ✓</span>
            </motion.div>
          </RevealMotion>

          <RevealMotion delay={0.1}>
            <motion.div
              whileHover={{ x: 6 }}
              className="p-5 rounded-xs bg-midnight border border-sun/60 flex items-center justify-between font-mono text-xs shadow-lg relative"
            >
              <div className="flex items-center gap-3">
                <span className="text-sun font-bold">02</span>
                <div>
                  <span className="text-dust font-semibold block">TESTNET ALPHA</span>
                  <span className="text-stroke-1 text-[11px]">Robinhood Chain 46630, Next.js WebApp, ragequit, encrypted vault</span>
                </div>
              </div>
              <span className="wax-seal-badge text-[10px]">ACTIVE ●</span>
            </motion.div>
          </RevealMotion>

          <RevealMotion delay={0.15}>
            <motion.div
              whileHover={{ x: 6 }}
              className="p-5 rounded-xs bg-midnight border border-dusk flex items-center justify-between font-mono text-xs text-stroke-2 relative"
            >
              <div className="flex items-center gap-3">
                <span>03</span>
                <div>
                  <span className="text-stroke-1 font-semibold block">HARDENING</span>
                  <span className="text-[11px]">Relayer fee quoting, multisig Magistrate, IPFS label lists, gas optimization</span>
                </div>
              </div>
              <span>UPCOMING ○</span>
            </motion.div>
          </RevealMotion>

          <RevealMotion delay={0.2}>
            <motion.div
              whileHover={{ x: 6 }}
              className="p-5 rounded-xs bg-midnight border border-dusk flex items-center justify-between font-mono text-xs text-stroke-2 relative"
            >
              <div className="flex items-center gap-3">
                <span>04</span>
                <div>
                  <span className="text-stroke-1 font-semibold block">AUDIT & CEREMONY</span>
                  <span className="text-[11px]">Circuit ZK audit, contract audit, public Phase-2 setup ceremony</span>
                </div>
              </div>
              <span>UPCOMING ○</span>
            </motion.div>
          </RevealMotion>

          <RevealMotion delay={0.25}>
            <motion.div
              whileHover={{ x: 6 }}
              className="p-5 rounded-xs bg-midnight border border-dusk flex items-center justify-between font-mono text-xs text-stroke-2 relative"
            >
              <div className="flex items-center gap-3">
                <span>05</span>
                <div>
                  <span className="text-stroke-1 font-semibold block">MAINNET</span>
                  <span className="text-[11px]">Deposit caps, guarded launch on Robinhood Chain (4663)</span>
                </div>
              </div>
              <span>UPCOMING ○</span>
            </motion.div>
          </RevealMotion>
        </div>
      </section>
    </div>
  );
}
