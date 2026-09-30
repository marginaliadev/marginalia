import React from "react";
import StatusChip from "./StatusChip";

export default function CircuitFlowDiagram() {
  return (
    <div className="w-full relative py-6 my-10 px-4 sm:px-6 rounded-2xl bg-[#0c0907] border border-[#261f18] bracket-box overflow-hidden shadow-2xl">
      {/* Corner Brackets */}
      <div className="pointer-events-none absolute -top-px -left-px size-2.5 border-t-1.5 border-l-1.5 border-[#d4af37]/60" />
      <div className="pointer-events-none absolute -top-px -right-px size-2.5 border-t-1.5 border-r-1.5 border-[#d4af37]/60" />
      <div className="pointer-events-none absolute -bottom-px -left-px size-2.5 border-b-1.5 border-l-1.5 border-[#d4af37]/60" />
      <div className="pointer-events-none absolute -bottom-px -right-px size-2.5 border-b-1.5 border-r-1.5 border-[#d4af37]/60" />

      {/* Header Strip */}
      <div className="flex items-center justify-between mb-4 border-b border-[#1f1813] pb-3 font-mono-code text-[11px]">
        <StatusChip label="ZK Circuit Flow Pipeline" dotColor="bg-[#FFAA5B]" />
        <span className="text-[#736859] tracking-wider uppercase text-[10px] hidden sm:inline">
          Zero-Knowledge State Machine · Groth16
        </span>
      </div>

      {/* Desktop SVG Pipeline with Animated Traveling Particles */}
      <div className="relative w-full h-28 hidden md:block">
        <svg
          className="w-full h-full"
          viewBox="0 0 1000 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Base track */}
          <path
            d="M 100 55 H 900"
            stroke="#1f1813"
            strokeWidth="2"
            strokeDasharray="4 4"
          />

          {/* Glowing Animated Dash Track */}
          <path
            d="M 100 55 H 900"
            stroke="url(#noirpayGradient)"
            strokeWidth="2"
            className="animate-flow-dash opacity-70"
          />

          <defs>
            <linearGradient
              id="noirpayGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#d4af37" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#FFAA5B" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4ade80" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* Animated Traveling Particle 1 */}
          <circle
            r="4"
            fill="#FFAA5B"
            className="filter drop-shadow-[0_0_8px_#FFAA5B]"
          >
            <animateMotion
              path="M 100 55 H 900"
              dur="5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Animated Traveling Particle 2 (Staggered) */}
          <circle
            r="3.5"
            fill="#f5eedc"
            className="filter drop-shadow-[0_0_6px_#f5eedc]"
          >
            <animateMotion
              path="M 100 55 H 900"
              dur="5s"
              begin="2.5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Stage 1: Inscribe */}
          <g transform="translate(100, 55)">
            <circle r="18" fill="#120f0d" stroke="#d4af37" strokeWidth="1.5" />
            <circle r="5" fill="#d4af37" />
            <text
              y="34"
              textAnchor="middle"
              fill="#f5eedc"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono)"
              fontWeight="600"
            >
              01. INSCRIBE
            </text>
            <text
              y="46"
              textAnchor="middle"
              fill="#8e8473"
              fontSize="8.5"
              fontFamily="var(--font-jetbrains-mono)"
            >
              Deposit Leaf
            </text>
          </g>

          {/* Stage 2: Screen */}
          <g transform="translate(300, 55)">
            <circle r="18" fill="#120f0d" stroke="#d4af37" strokeWidth="1.5" />
            <circle r="5" fill="#FFAA5B" />
            <text
              y="34"
              textAnchor="middle"
              fill="#f5eedc"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono)"
              fontWeight="600"
            >
              02. SCREEN
            </text>
            <text
              y="46"
              textAnchor="middle"
              fill="#8e8473"
              fontSize="8.5"
              fontFamily="var(--font-jetbrains-mono)"
            >
              ASP Merkle
            </text>
          </g>

          {/* Stage 3: Shielded Folio */}
          <g transform="translate(500, 55)">
            <circle r="22" fill="#181310" stroke="#f3db88" strokeWidth="2" />
            <circle r="6" fill="#d4af37" className="animate-pulse" />
            <text
              y="38"
              textAnchor="middle"
              fill="#f3db88"
              fontSize="11"
              fontFamily="var(--font-jetbrains-mono)"
              fontWeight="700"
            >
              03. SHIELD
            </text>
            <text
              y="50"
              textAnchor="middle"
              fill="#8e8473"
              fontSize="8.5"
              fontFamily="var(--font-jetbrains-mono)"
            >
              Folio 2²⁰ Pool
            </text>
          </g>

          {/* Stage 4: Prove */}
          <g transform="translate(700, 55)">
            <circle r="18" fill="#120f0d" stroke="#d4af37" strokeWidth="1.5" />
            <circle r="5" fill="#FFAA5B" />
            <text
              y="34"
              textAnchor="middle"
              fill="#f5eedc"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono)"
              fontWeight="600"
            >
              04. PROVE
            </text>
            <text
              y="46"
              textAnchor="middle"
              fill="#8e8473"
              fontSize="8.5"
              fontFamily="var(--font-jetbrains-mono)"
            >
              Groth16 24k
            </text>
          </g>

          {/* Stage 5: Clean Payout */}
          <g transform="translate(900, 55)">
            <circle r="18" fill="#120f0d" stroke="#4ade80" strokeWidth="1.5" />
            <circle r="5" fill="#4ade80" />
            <text
              y="34"
              textAnchor="middle"
              fill="#4ade80"
              fontSize="10"
              fontFamily="var(--font-jetbrains-mono)"
              fontWeight="600"
            >
              05. PAYOUT
            </text>
            <text
              y="46"
              textAnchor="middle"
              fill="#8e8473"
              fontSize="8.5"
              fontFamily="var(--font-jetbrains-mono)"
            >
              Clean Receiver
            </text>
          </g>
        </svg>
      </div>

      {/* Mobile Flow Track */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:hidden pt-2 font-mono-code text-[11px]">
        <div className="p-2.5 rounded bg-[#120f0d] border border-[#261f19] text-center">
          <span className="text-[#d4af37] block font-bold">01. INSCRIBE</span>
          <span className="text-[10px] text-[#8e8473]">Deposit Leaf</span>
        </div>
        <div className="p-2.5 rounded bg-[#120f0d] border border-[#261f19] text-center">
          <span className="text-[#FFAA5B] block font-bold">02. SCREEN</span>
          <span className="text-[10px] text-[#8e8473]">ASP Merkle</span>
        </div>
        <div className="p-2.5 rounded bg-[#14100d] border border-[#d4af37]/40 text-center col-span-2 sm:col-span-1">
          <span className="text-[#f3db88] block font-bold">03. SHIELD</span>
          <span className="text-[10px] text-[#8e8473]">Folio 2²⁰ Pool</span>
        </div>
        <div className="p-2.5 rounded bg-[#120f0d] border border-[#261f19] text-center">
          <span className="text-[#FFAA5B] block font-bold">04. PROVE</span>
          <span className="text-[10px] text-[#8e8473]">Groth16 24k</span>
        </div>
        <div className="p-2.5 rounded bg-[#120f0d] border border-emerald-900/50 text-center">
          <span className="text-emerald-400 block font-bold">05. PAYOUT</span>
          <span className="text-[10px] text-[#8e8473]">Clean Receiver</span>
        </div>
      </div>
    </div>
  );
}
