"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import MarginaliaLogo from "@/components/MarginaliaLogo";

export default function IntroSequence() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phaseText, setPhaseText] = useState("INITIALIZING BN254 PAIRING...");

  useEffect(() => {
    // Only display intro sequence on the main landing page
    if (pathname !== "/") {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    setProgress(0);

    // Progress counter calibrated to run smoothly over ~2.9s
    const startTime = Date.now();
    const TARGET_DURATION = 2900; // 2.9 seconds to reach 100%

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / TARGET_DURATION) * 100));
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [pathname]);

  // Update status messages according to progress phases
  useEffect(() => {
    if (progress < 25) {
      setPhaseText("SYNTHESIZING BN254 WITNESS...");
    } else if (progress < 55) {
      setPhaseText("FETCHING FOLIO ROOTS · ROBINHOOD CHAIN...");
    } else if (progress < 85) {
      setPhaseText("ESTABLISHING ZERO-KNOWLEDGE PROVING KEY...");
    } else {
      setPhaseText("PROVEN. NOT REVEALED.");
    }
  }, [progress]);

  // Hold for ~650ms after reaching 100% (Total sequence duration = ~3.5 to 3.6 seconds)
  useEffect(() => {
    if (progress === 100) {
      const dismissTimer = setTimeout(() => {
        handleDismiss();
      }, 650);
      return () => clearTimeout(dismissTimer);
    }
  }, [progress]);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  // Keyboard shortcut: Press Escape to skip intro immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          onClick={handleDismiss}
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.04,
            transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
          }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-between bg-[#080706] text-white p-6 sm:p-12 select-none pointer-events-auto cursor-pointer"
        >
          {/* Subtle Ambient Background Gradients & Noise Grid */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,139,62,0.12)_0%,transparent_70%)] blur-3xl"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#3f3630_1px,transparent_1px)] [background-size:32px_32px] opacity-20"></div>
          </div>

          {/* Top Bar: Chain Identity */}
          <div className="w-full max-w-4xl flex items-center justify-between text-mono-s text-dust/60 relative z-10 pt-2">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
              <span className="tracking-widest uppercase">MARGINALIA CORE · PROTOCOL V1</span>
            </div>
            <button
              onClick={handleDismiss}
              className="text-[11px] font-mono text-dust/40 hover:text-sun transition-colors cursor-pointer uppercase tracking-wider px-2 py-1 rounded border border-white/10 hover:border-sun/40"
            >
              Skip [ESC]
            </button>
          </div>

          {/* Centerpiece: Cryptographic Glyph & Fermat Creed */}
          <div className="flex flex-col items-center justify-center text-center max-w-xl mx-auto my-auto relative z-10 px-4">
            {/* Geometric Rotating Circle with Crosshairs */}
            <div className="relative size-24 sm:size-28 mb-8 flex items-center justify-center">
              {/* Outer dashed spinning ring */}
              <div className="absolute inset-0 rounded-full border border-dashed border-sun/40 animate-orbit-rotate"></div>
              {/* Middle reverse spinning ring */}
              <div
                className="absolute inset-2 rounded-full border border-dust/20 animate-orbit-rotate-fast"
                style={{ animationDirection: "reverse" }}
              ></div>
              {/* Corner brackets */}
              <div className="absolute size-3 border-sun top-0 left-0 border-t border-l"></div>
              <div className="absolute size-3 border-sun top-0 right-0 border-t border-r"></div>
              <div className="absolute size-3 border-sun bottom-0 left-0 border-b border-l"></div>
              <div className="absolute size-3 border-sun bottom-0 right-0 border-b border-r"></div>

              {/* Core Emblem */}
              <MarginaliaLogo
                className="size-13 drop-shadow-[0_0_20px_rgba(255,139,62,0.4)]"
                bracketColor="#ff8b3e"
                mColor="#fbf6ec"
              />
            </div>

            {/* Main Typographic Reveal */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-heading-56 font-light text-dust tracking-tight mb-3"
            >
              PROVEN. NOT REVEALED.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="font-heading italic text-base sm:text-lg text-sun/90 font-light mb-8"
            >
              "Hanc marginis exiguitas non caperet."
            </motion.p>

            {/* Technical Progress Gauge & Live Ticker */}
            <div className="w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between font-mono text-[11px] text-dust/60">
                <span className="truncate pr-2">{phaseText}</span>
                <span className="text-sun font-semibold">{progress}%</span>
              </div>

              {/* Precision 1px Gauge Bar */}
              <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden relative">
                <motion.div
                  className="h-full bg-gradient-to-r from-dust via-sun to-sand"
                  style={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut", duration: 0.15 }}
                />
              </div>
            </div>
          </div>

          {/* Bottom Bar: Cryptographic Parameters */}
          <div className="w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-2 text-mono-s text-dust/40 relative z-10 pb-2">
            <div>ROBINHOOD CHAIN TESTNET (46630) · ARBITRUM ORBIT L2</div>
            <div>GROTH16 · POSEIDON T3/T4 · 24,236 R1CS</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
