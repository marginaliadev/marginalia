"use client";

import React, { useState, useEffect } from "react";

export default function NoirpayCircuitCard() {
  const [activeJobIndex, setActiveJobIndex] = useState(0);

  const jobs = [
    {
      label: "SHIELD",
      desc: "SCREENED AT THE EDGE · WHOSE BALANCE GREW STAYS HIDDEN",
      stat: "0",
      statDesc: "Balances, positions or counterparties left on the public explorer",
    },
    {
      label: "TRANSFER",
      desc: "PRIVATE STEALTH ADDRESSES · RELAYED VIA MERSENNE COURIER",
      stat: "24,236",
      statDesc: "R1CS constraints verified per Groth16 zk-SNARK proof",
    },
    {
      label: "EARN",
      desc: "YIELD ACCRUAL ON-CHAIN · CREDITED PER SHIELDED NOTE",
      stat: "~7%",
      statDesc: "Target yield accrued on Robinhood Chain, invisible on-chain",
    },
    {
      label: "SPEND",
      desc: "CARD SETTLEMENT VIA CLIENT-SIDE ZERO-KNOWLEDGE PROOFS",
      stat: "100%",
      statDesc: "Unlinkable card settlement straight from shielded balance",
    },
    {
      label: "DISCLOSE",
      desc: "SCOPED TIME-BOUND VIEWING KEYS FOR AUDIT & COMPLIANCE",
      stat: "X25519",
      statDesc: "Authenticated ephemeral ciphertexts for auditor inspection",
    },
  ];

  // Auto-motion: cycle primitive every 3.8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveJobIndex((prev) => (prev + 1) % jobs.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [jobs.length]);

  const handleNextJob = () => {
    setActiveJobIndex((prev) => (prev + 1) % jobs.length);
  };

  const progressPct = ((activeJobIndex + 1) / jobs.length) * 100;


  return (
    <div className="flex w-full shrink-0 flex-col gap-y-5 sm:gap-y-8 md:min-h-[33.75rem] md:w-5/12 md:max-w-[34.125rem] lg:min-h-[39.125rem]">
      {/* Top Bar with Progress Gauge */}
      <div className="relative flex flex-col justify-between">
        <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>
        <div className="flex items-center gap-x-4 px-4 py-1">
          <div className="shrink-0 font-mono text-[0.6875rem] leading-none tracking-[-0.02em] opacity-80 text-dust">
            One protocol, five primitives
          </div>
          <div className="h-1 flex-1 overflow-hidden rounded-[1px] bg-dust/20">
            <div
              className="h-full bg-dust/60 transition-[width] duration-700"
              style={{ width: `${progressPct}%` }}
            ></div>
          </div>
        </div>
        <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
      </div>

      {/* Main Card with Exact Noirpay 4-Corner Brackets and Animated SVG Pipeline */}
      <div className="relative flex flex-col justify-between flex-1 bg-night/90 border border-dusk/60">
        <div className="relative h-3 text-stroke-3">
          <div className="absolute size-3 border-current top-0 left-0 border-t border-l"></div>
          <div className="absolute size-3 border-current top-0 right-0 border-t border-r"></div>
        </div>

        <div className="flex h-full flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-x-3">
              <div className="size-1.5 shrink-0 rounded-full bg-sun animate-pulse"></div>
              <div className="font-mono text-[0.75rem] leading-none tracking-[0.05em] text-dust opacity-90">
                {jobs[activeJobIndex].label}
              </div>
            </div>
            <button
              onClick={handleNextJob}
              className="font-mono text-[10px] text-stroke-2 hover:text-sun transition-colors uppercase tracking-wider cursor-pointer"
            >
              NEXT PRIMITIVE →
            </button>
          </div>

          <button
            type="button"
            onClick={handleNextJob}
            aria-label="Next primitive illustration"
            className="flex min-h-[20rem] flex-1 cursor-pointer flex-col justify-center text-dust group"
          >
            <svg
              viewBox="0 0 640 360"
              className="aspect-video w-full text-dust"
              role="img"
              aria-label="ZK Shield Pipeline Illustration"
            >
              <g>
                {/* LICENSED RAMP BOX */}
                <g>
                  <text
                    x="40"
                    y="112"
                    textAnchor="start"
                    className="font-mono opacity-50"
                    fill="currentColor"
                    fontSize="10"
                    letterSpacing="0.08em"
                  >
                    LICENSED RAMP
                  </text>
                  <rect
                    x="40"
                    y="120"
                    width="120"
                    height="60"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                  ></rect>
                  <rect x="38.5" y="118.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="158.5" y="118.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="38.5" y="178.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="158.5" y="178.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                </g>
                <text
                  x="100"
                  y="155"
                  textAnchor="middle"
                  className="font-mono opacity-80"
                  fill="currentColor"
                  fontSize="10"
                  letterSpacing="0.08em"
                >
                  FIAT → ETH
                </text>

                {/* ROBINHOOD CHAIN / BRIDGE BOX */}
                <g>
                  <text
                    x="40"
                    y="212"
                    textAnchor="start"
                    className="font-mono opacity-50"
                    fill="currentColor"
                    fontSize="10"
                    letterSpacing="0.08em"
                  >
                    CHAIN 46630
                  </text>
                  <rect
                    x="40"
                    y="220"
                    width="120"
                    height="60"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                  ></rect>
                  <rect x="38.5" y="218.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="158.5" y="218.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="38.5" y="278.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="158.5" y="278.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                </g>
                <text
                  x="100"
                  y="255"
                  textAnchor="middle"
                  className="font-mono opacity-80"
                  fill="currentColor"
                  fontSize="10"
                  letterSpacing="0.08em"
                >
                  ETH · USDG
                </text>

                {/* CONNECTING PIPELINES */}
                <path
                  d="M160 150 H240 Q270 150 270 180 H300"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.3"
                ></path>
                <path
                  d="M160 250 H240 Q270 250 270 220 H300"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.3"
                ></path>

                {/* SCREEN GATE WITH SUN PULSE */}
                <g>
                  <text
                    x="330"
                    y="112"
                    textAnchor="middle"
                    className="font-mono opacity-50"
                    fill="currentColor"
                    fontSize="10"
                    letterSpacing="0.08em"
                  >
                    SCREEN
                  </text>
                  <path d="M312 130 V270 M348 130 V270" stroke="currentColor" strokeOpacity="0.6"></path>
                  <path
                    d="M312 130 H322 M338 130 H348 M312 270 H322 M338 270 H348"
                    stroke="currentColor"
                    strokeOpacity="0.6"
                  ></path>
                  <rect x="326" y="196" width="8" height="8" fill="#ff8b3e">
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite"></animate>
                  </rect>
                </g>

                <path d="M348 200 H420" fill="none" stroke="currentColor" strokeOpacity="0.3"></path>

                {/* SHIELDED POOL (THE FOLIO) */}
                <g>
                  <text
                    x="420"
                    y="92"
                    textAnchor="start"
                    className="font-mono opacity-50"
                    fill="currentColor"
                    fontSize="10"
                    letterSpacing="0.08em"
                  >
                    SHIELDED POOL
                  </text>
                  <rect
                    x="420"
                    y="100"
                    width="180"
                    height="180"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                  ></rect>
                  <rect x="418.5" y="98.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="598.5" y="98.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="418.5" y="278.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                  <rect x="598.5" y="278.5" width="3" height="3" fill="currentColor" fillOpacity="0.6"></rect>
                </g>

                {/* ENCRYPTED NOTES MATRIX WITH INDIVIDUAL PULSES */}
                <g>
                  <rect x="442" y="128" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="474" y="128" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.25">
                    <animate attributeName="fill-opacity" values="0.55;0.85;0.55" dur="2.4s" begin="0.4s" repeatCount="indefinite"></animate>
                  </rect>
                  <rect x="506" y="128" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="538" y="128" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="442" y="151.2" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.25">
                    <animate attributeName="fill-opacity" values="0.55;0.85;0.55" dur="2.4s" begin="1.6s" repeatCount="indefinite"></animate>
                  </rect>
                  <rect x="474" y="151.2" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="506" y="151.2" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.25">
                    <animate attributeName="fill-opacity" values="0.55;0.85;0.55" dur="2.4s" begin="0.4s" repeatCount="indefinite"></animate>
                  </rect>
                  <rect x="538" y="151.2" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="442" y="174.4" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="474" y="174.4" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.25">
                    <animate attributeName="fill-opacity" values="0.55;0.85;0.55" dur="2.4s" begin="1.6s" repeatCount="indefinite"></animate>
                  </rect>
                  <rect x="506" y="174.4" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25"></rect>
                  <rect x="538" y="174.4" width="22" height="13.2" rx="1" fill="currentColor" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.25">
                    <animate attributeName="fill-opacity" values="0.55;0.85;0.55" dur="2.4s" begin="0.4s" repeatCount="indefinite"></animate>
                  </rect>
                </g>
                <text
                  x="510"
                  y="262"
                  textAnchor="middle"
                  className="font-mono opacity-80"
                  fill="currentColor"
                  fontSize="10"
                  letterSpacing="0.08em"
                >
                  ENCRYPTED NOTES
                </text>

                {/* EXACT TRAVELING PARTICLES (ANIMATEMOTION) */}
                <circle r="3.5" fill="#ff8b3e">
                  <animateMotion
                    dur="3.2s"
                    begin="0s"
                    repeatCount="indefinite"
                    path="M160 150 H240 Q270 150 270 180 H300 M300 180 V200 H420"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="linear"
                  ></animateMotion>
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.1;0.9;1"
                    dur="3.2s"
                    begin="0s"
                    repeatCount="indefinite"
                  ></animate>
                </circle>

                <circle r="3.5" fill="#ff8b3e">
                  <animateMotion
                    dur="3.2s"
                    begin="1.6s"
                    repeatCount="indefinite"
                    path="M160 250 H240 Q270 250 270 220 H300 M300 220 V200 H420"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="linear"
                  ></animateMotion>
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.1;0.9;1"
                    dur="3.2s"
                    begin="1.6s"
                    repeatCount="indefinite"
                  ></animate>
                </circle>

                <text
                  x="320"
                  y="338"
                  textAnchor="middle"
                  className="font-mono opacity-50"
                  fill="currentColor"
                  fontSize="10"
                  letterSpacing="0.08em"
                >
                  {jobs[activeJobIndex].desc}
                </text>
              </g>
            </svg>
          </button>
        </div>

        <div className="relative h-3 text-stroke-3">
          <div className="absolute size-3 border-current bottom-0 left-0 border-b border-l"></div>
          <div className="absolute size-3 border-current bottom-0 right-0 border-b border-r"></div>
        </div>
      </div>

      {/* Noirpay Exact Bottom "BY THE NUMBERS" Metric Box */}
      <div className="space-y-4 border border-dusk bg-night p-4 text-dust transition-all duration-300">
        <div className="flex items-center gap-x-3">
          <div className="font-mono text-[0.75rem] leading-none tracking-[-0.02em] uppercase text-dust/80">
            BY THE NUMBERS
          </div>
          <div className="rounded-[0.1875rem] border border-white/10 px-2 py-[0.1875rem] text-[0.625rem] leading-[1.2] tracking-[0.02em] text-sun flex items-center gap-1">
            <span className="size-1 rounded-full bg-sun animate-pulse"></span>
            <span>LIVE METRIC</span>
          </div>
        </div>
        <div>
          <div className="font-heading text-[2.125rem] leading-none tracking-[-0.03em] text-dust transition-all duration-300">
            {jobs[activeJobIndex].stat}
          </div>
          <div className="mt-2 text-[0.9375rem] leading-normal opacity-80 font-sans-ui text-stroke-1 transition-all duration-300">
            {jobs[activeJobIndex].statDesc}
          </div>
        </div>
      </div>
    </div>
  );
}
