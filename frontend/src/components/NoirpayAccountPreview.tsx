"use client";

import React, { useState, useEffect, useRef } from "react";
import { useInView } from "framer-motion";

export default function NoirpayAccountPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-50px" });

  const [visibleStep, setVisibleStep] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [cursorBlink, setCursorBlink] = useState<boolean>(true);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  // Blinking terminal cursor
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setCursorBlink((prev) => !prev);
    }, 450);
    return () => clearInterval(blinkInterval);
  }, []);

  // Sequenced terminal log animation & balance counter
  useEffect(() => {
    if (!isInView) {
      setVisibleStep(0);
      setBalance(0);
      setTerminalLines([]);
      return;
    }

    // 1. Balance Counter: 0.000 -> 12.400 ETH
    let startTimestamp: number | null = null;
    let animId: number;
    const countDuration = 2200;

    const countStep = (ts: number) => {
      if (!startTimestamp) startTimestamp = ts;
      const progress = Math.min((ts - startTimestamp) / countDuration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setBalance(ease * 12.4);
      if (progress < 1) {
        animId = requestAnimationFrame(countStep);
      } else {
        setBalance(12.4);
      }
    };
    animId = requestAnimationFrame(countStep);

    // 2. Sequential Terminal Log Stream: Items appear one-by-one
    const t0 = setTimeout(() => {
      setVisibleStep(0);
      setTerminalLines(["[INIT] BN254 GROTH16 ENCLAVE READY"]);
    }, 200);

    const t1 = setTimeout(() => {
      setVisibleStep(1);
      setTerminalLines((prev) => [...prev, "[LOG 1] DECRYPTED PAYOUT -0.300 ETH"]);
    }, 850);

    const t2 = setTimeout(() => {
      setVisibleStep(2);
      setTerminalLines((prev) => [...prev, "[LOG 2] FOLIO LEAF #1042 +10.000 ETH"]);
    }, 1650);

    const t3 = setTimeout(() => {
      setVisibleStep(3);
      setTerminalLines((prev) => [...prev, "[LOG 3] RELAYER SPONSORED -0.000003 ETH"]);
    }, 2450);

    const t4 = setTimeout(() => {
      setVisibleStep(4);
      setTerminalLines((prev) => [...prev, "[LOG 4] RESIDUAL CHANGE +2.400 ETH"]);
    }, 3250);

    const t5 = setTimeout(() => {
      setTerminalLines((prev) => [...prev, "[OK] ZERO-KNOWLEDGE PROOF VERIFIED"]);
    }, 3950);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [isInView]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[1164px] [mask-image:linear-gradient(to_bottom,#000_0%,#000_34%,rgba(0,0,0,0.92)_46%,rgba(0,0,0,0.72)_58%,rgba(0,0,0,0.46)_70%,rgba(0,0,0,0.22)_82%,rgba(0,0,0,0.06)_92%,transparent_100%)]"
    >
      <svg
        viewBox="0 0 1164 663"
        className="w-full text-dust"
        role="img"
        aria-label="The Marginalia shielded account: shielded balance, vaults, activity, card and viewing keys"
      >
        {/* Background Canvas */}
        <rect
          x="0.5"
          y="0.5"
          width="1163"
          height="662"
          rx="12"
          fill="#0F0C0B"
          stroke="#3F3630"
        ></rect>

        {/* Header App Bar */}
        <text
          x="32"
          y="38"
          className="font-heading"
          fill="currentColor"
          fontSize="22"
          letterSpacing="-0.03em"
        >
          marginalia
        </text>

        {/* Tab 1: OVERVIEW */}
        <g>
          <circle cx="178" cy="31" r="2.5" fill="#ff8b3e"></circle>
          <text
            x="190"
            y="35"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.9"
            fontSize="10"
            letterSpacing="0.08em"
          >
            OVERVIEW
          </text>
        </g>

        {/* Tab 2: SHIELD */}
        <g>
          <text
            x="286"
            y="35"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.4"
            fontSize="10"
            letterSpacing="0.08em"
          >
            SHIELD
          </text>
        </g>

        {/* Tab 3: PAY */}
        <g>
          <text
            x="382"
            y="35"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.4"
            fontSize="10"
            letterSpacing="0.08em"
          >
            WITHDRAW
          </text>
        </g>

        {/* Tab 4: COURIER */}
        <g>
          <text
            x="490"
            y="35"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.4"
            fontSize="10"
            letterSpacing="0.08em"
          >
            COURIER
          </text>
        </g>

        {/* Tab 5: DISCLOSE */}
        <g>
          <text
            x="590"
            y="35"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.4"
            fontSize="10"
            letterSpacing="0.08em"
          >
            DISCLOSE
          </text>
        </g>

        {/* User Handle Pill */}
        <rect
          x="1004"
          y="18"
          width="60"
          height="26"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
        ></rect>
        <text
          x="1034"
          y="35"
          textAnchor="middle"
          className="font-mono"
          fill="currentColor"
          fillOpacity="0.8"
          fontSize="10"
          letterSpacing="0.08em"
        >
          @you
        </text>

        {/* Testnet Badge */}
        <rect
          x="1074"
          y="18"
          width="58"
          height="26"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
        ></rect>
        <text
          x="1103"
          y="35"
          textAnchor="middle"
          className="font-mono text-sun"
          fill="#ff8b3e"
          fillOpacity="1"
          fontSize="9"
          letterSpacing="0.08em"
        >
          PREVIEW
        </text>

        <path d="M0 60 H1164" stroke="currentColor" strokeOpacity="0.12"></path>

        {/* LEFT COLUMN: SHIELDED BALANCE */}
        <g>
          <rect x="32" y="84" width="392" height="262" fill="currentColor" fillOpacity="0.025"></rect>
          <path
            d="M32 94 V84 H42 M414 84 H424 V94 M32 336 V346 H42 M414 346 H424 V336"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.5"
          ></path>
          <text
            x="48"
            y="108"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.5"
            fontSize="10"
            letterSpacing="0.08em"
          >
            SHIELDED BALANCE
          </text>
        </g>

        <text
          x="48"
          y="160"
          className="font-heading"
          fill="currentColor"
          fontSize="44"
          letterSpacing="-0.03em"
        >
          {balance.toFixed(3)} ETH
        </text>
        <text
          x="48"
          y="182"
          textAnchor="start"
          className="font-mono"
          fill="currentColor"
          fillOpacity="0.5"
          fontSize="10"
          letterSpacing="0.08em"
        >
          FOLIO NOTE #1042 · VISIBLE ONLY TO YOU
        </text>

        <g className="text-sun">
          <text
            x="48"
            y="214"
            textAnchor="start"
            className="font-mono text-sun"
            fill="#ff8b3e"
            fillOpacity="1"
            fontSize="10"
            letterSpacing="0.08em"
          >
            ASP ROOT VERIFIED
          </text>
        </g>
        <text
          x="190"
          y="214"
          textAnchor="start"
          className="font-mono"
          fill="currentColor"
          fillOpacity="0.5"
          fontSize="10"
          letterSpacing="0.08em"
        >
          · MAGISTRATE WHITELIST ACTIVE
        </text>

        {/* Animated Golden Growth Curve */}
        <path
          d="M32 318 C 80 314, 120 306, 170 300 S 260 284, 300 268 S 370 246, 400 238"
          fill="none"
          stroke="#ff8b3e"
          strokeWidth="1.5"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset="1"
        >
          <animate attributeName="stroke-dashoffset" from="1" to="0" dur="3s" fill="freeze"></animate>
        </path>
        {/* Continuous Traveling Photon along Growth Path */}
        <circle r="3" fill="#ff8b3e" opacity="0.9">
          <animateMotion
            dur="3.6s"
            repeatCount="indefinite"
            path="M32 318 C 80 314, 120 306, 170 300 S 260 284, 300 268 S 370 246, 400 238"
          />
          <animate attributeName="opacity" values="0;0.9;0.9;0" dur="3.6s" repeatCount="indefinite" />
        </circle>

        {/* VAULT / NOTE INVENTORY */}
        <g>
          <rect x="32" y="362" width="392" height="268" fill="currentColor" fillOpacity="0.025"></rect>
          <path
            d="M32 372 V362 H42 M414 362 H424 V372 M32 620 V630 H42 M414 630 H424 V620"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.5"
          ></path>
          <text
            x="48"
            y="386"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.5"
            fontSize="10"
            letterSpacing="0.08em"
          >
            NOTES IN VAULT
          </text>
        </g>

        {/* Gauge 1: Primary Folio Note */}
        <g>
          <text x="48" y="412" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Folio Note #1042
          </text>
          <text x="408" y="412" textAnchor="end" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            10.0 ETH · APPROVED
          </text>
          <rect x="48" y="422" width="360" height="4" fill="currentColor" fillOpacity="0.08"></rect>
          <rect x="48" y="422" width="280" height="4" fill="#ff8b3e" fillOpacity="0.8"></rect>
        </g>

        {/* Gauge 2: Change Note */}
        <g>
          <text x="48" y="464" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Change Note #1043
          </text>
          <text x="408" y="464" textAnchor="end" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            2.4 ETH · UNSPENT
          </text>
          <rect x="48" y="474" width="360" height="4" fill="currentColor" fillOpacity="0.08"></rect>
          <rect x="48" y="474" width="120" height="4" fill="currentColor" fillOpacity="0.4"></rect>
        </g>

        {/* Gauge 3: Encrypted Precommitment */}
        <g>
          <text x="48" y="516" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Precommitment Vault
          </text>
          <text x="408" y="516" textAnchor="end" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            EIP-712 SYMMETRIC AES-GCM
          </text>
          <rect x="48" y="526" width="360" height="4" fill="currentColor" fillOpacity="0.08"></rect>
          <rect x="48" y="526" width="220" height="4" fill="currentColor" fillOpacity="0.4"></rect>
        </g>

        {/* Gauge 4: Wax Seal Nullifier */}
        <g>
          <text x="48" y="568" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Wax Seal Nullifier
          </text>
          <text x="408" y="568" textAnchor="end" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            INTACT (UNSPENT)
          </text>
          <rect x="48" y="578" width="360" height="4" fill="currentColor" fillOpacity="0.08"></rect>
          <rect x="48" y="578" width="360" height="4" fill="#10b981" fillOpacity="0.7"></rect>
        </g>

        {/* RIGHT COLUMN: RECENT ZERO-KNOWLEDGE ACTIVITY */}
        <g>
          <rect x="448" y="84" width="368" height="546" fill="currentColor" fillOpacity="0.025"></rect>
          <path
            d="M448 94 V84 H458 M806 84 H816 V94 M448 620 V630 H458 M806 630 H816 V620"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.5"
          ></path>
          <text
            x="464"
            y="108"
            textAnchor="start"
            className="font-mono"
            fill="currentColor"
            fillOpacity="0.5"
            fontSize="10"
            letterSpacing="0.08em"
          >
            ACTIVITY
          </text>
        </g>

        <text
          x="800"
          y="108"
          textAnchor="end"
          className="font-mono"
          fill="currentColor"
          fillOpacity="0.45"
          fontSize="9"
          letterSpacing="0.08em"
        >
          DECRYPTED IN YOUR BROWSER
        </text>

        {/* Item 1: Groth16 Shielded Payout */}
        <g
          style={{
            opacity: visibleStep >= 1 ? 1 : 0,
            transform: visibleStep >= 1 ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <rect x="464" y="136" width="28" height="28" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.2"></rect>
          <path d="M472 154 L484 142 M476 142 H484 V150" stroke="currentColor" strokeOpacity="0.7" fill="none"></path>
          <text x="504" y="149" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Groth16 Shielded Payout
          </text>
          <text x="504" y="167" textAnchor="start" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            MERSENNE RELAYER
          </text>
          <text x="800" y="154" textAnchor="end" className="font-mono" fill="currentColor" fillOpacity="0.85" fontSize="13">
            −0.300 ETH
          </text>
          <path d="M464 182 H800" stroke="currentColor" strokeOpacity="0.08"></path>
        </g>

        {/* Item 2: Deposit Inscription */}
        <g
          style={{
            opacity: visibleStep >= 2 ? 1 : 0,
            transform: visibleStep >= 2 ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <rect x="464" y="214" width="28" height="28" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.2"></rect>
          <path d="M484 220 L472 232 M472 224 V232 H480" stroke="#ff8b3e" fill="none"></path>
          <text x="504" y="227" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Deposit Inscription
          </text>
          <text x="504" y="245" textAnchor="start" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            LEAF #1042 · FOLIO TREE
          </text>
          <text x="800" y="232" textAnchor="end" className="font-mono text-sun" fill="#ff8b3e" fontSize="13">
            +10.000 ETH
          </text>
          <path d="M464 260 H800" stroke="currentColor" strokeOpacity="0.08"></path>
        </g>

        {/* Item 3: Relayer Sponsorship */}
        <g
          style={{
            opacity: visibleStep >= 3 ? 1 : 0,
            transform: visibleStep >= 3 ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <rect x="464" y="292" width="28" height="28" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.2"></rect>
          <path d="M472 310 L484 298 M476 298 H484 V306" stroke="currentColor" strokeOpacity="0.7" fill="none"></path>
          <text x="504" y="305" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Relayer Sponsorship
          </text>
          <text x="504" y="323" textAnchor="start" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            GASLESS COURIER
          </text>
          <text x="800" y="310" textAnchor="end" className="font-mono" fill="currentColor" fillOpacity="0.85" fontSize="13">
            −0.000003 ETH
          </text>
          <path d="M464 338 H800" stroke="currentColor" strokeOpacity="0.08"></path>
        </g>

        {/* Item 4: Change Note Split */}
        <g
          style={{
            opacity: visibleStep >= 4 ? 1 : 0,
            transform: visibleStep >= 4 ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <rect x="464" y="370" width="28" height="28" rx="2" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.2"></rect>
          <path d="M484 376 L472 388 M472 380 V388 H480" stroke="#ff8b3e" fill="none"></path>
          <text x="504" y="383" textAnchor="start" className="font-body" fill="currentColor" fillOpacity="0.85" fontSize="13" fontWeight="400">
            Change Note Split
          </text>
          <text x="504" y="401" textAnchor="start" className="font-mono" fill="currentColor" fillOpacity="0.45" fontSize="9" letterSpacing="0.08em">
            AUTOMATIC RE-INSCRIBE
          </text>
          <text x="800" y="388" textAnchor="end" className="font-mono text-sun" fill="#ff8b3e" fontSize="13">
            +2.400 ETH
          </text>
          <path d="M464 414 H800" stroke="currentColor" strokeOpacity="0.08"></path>
        </g>

        {/* LIVE TERMINAL LOG STREAM CONSOLE */}
        <g>
          {/* Terminal Box Frame */}
          <rect x="464" y="432" width="336" height="182" rx="4" fill="#080706" stroke="#3F3630" strokeOpacity="0.7"></rect>
          {/* Terminal Header */}
          <rect x="464" y="432" width="336" height="24" rx="4" fill="#14110E"></rect>
          <circle cx="478" cy="444" r="3" fill="#ef4444" fillOpacity="0.8"></circle>
          <circle cx="488" cy="444" r="3" fill="#f59e0b" fillOpacity="0.8"></circle>
          <circle cx="498" cy="444" r="3" fill="#10b981" fillOpacity="0.8"></circle>
          <text x="512" y="448" className="font-mono" fill="#fbefd6" fillOpacity="0.6" fontSize="9" letterSpacing="0.06em">
            ENCLAVE-STREAM · SECURE ZERO-KNOWLEDGE LOG
          </text>

          {/* Terminal Log Lines */}
          {terminalLines.map((line, idx) => (
            <text
              key={idx}
              x="476"
              y={476 + idx * 22}
              className="font-mono"
              fill={idx === terminalLines.length - 1 ? "#ff8b3e" : "#fbefd6"}
              fillOpacity={idx === terminalLines.length - 1 ? 0.95 : 0.65}
              fontSize="9.5"
              letterSpacing="0.04em"
            >
              &gt; {line}
            </text>
          ))}

          {/* Terminal Blinking Cursor */}
          <text
            x="476"
            y={476 + terminalLines.length * 22}
            className="font-mono"
            fill="#10b981"
            fontSize="10"
            fontWeight="bold"
          >
            &gt; {cursorBlink ? "█" : " "}
          </text>
        </g>
      </svg>
    </div>
  );
}
