"use client";

import React, { useState, useEffect } from "react";
import { Terminal, Activity } from "lucide-react";

const PROTOCOL_EVENTS = [
  { tag: "MERKLE", text: "Folio leaf #1043 inscribed at root 0x73fa...b91c", time: "just now" },
  { tag: "CIRCUIT", text: "Prover generated Groth16 zk-SNARK witness (24,236 constraints)", time: "2s ago" },
  { tag: "MAGISTRATE", text: "ASP sanction window refreshed · 48 deposit labels verified clean", time: "5s ago" },
  { tag: "COURIER", text: "Mersenne relayer sponsored gas withdrawal to fresh destination", time: "8s ago" },
  { tag: "PRIVACY", text: "Wax Seal nullifier N=0x904a... consumed · 100% unlinkable payout", time: "12s ago" },
];

export default function LiveProtocolTicker() {
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % PROTOCOL_EVENTS.length);
        setIsTransitioning(false);
      }, 300);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const event = PROTOCOL_EVENTS[index];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 my-6">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-[#110d0a]/90 border border-[#2b221a] text-xs font-mono-code shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex items-center gap-1.5 text-[#d4af37] font-semibold shrink-0">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] tracking-wider uppercase">FOLIO STREAM</span>
          </span>
          <span className="text-[#3d3328]">|</span>
          <div
            className={`flex items-center gap-2 text-[#eae5d9] text-[11px] truncate transition-all duration-300 ${
              isTransitioning ? "opacity-0 -translate-y-1.5" : "opacity-100 translate-y-0"
            }`}
          >
            <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-[#221a14] border border-[#3b2e23] text-[#FFAA5B]">
              {event.tag}
            </span>
            <span className="truncate">{event.text}</span>
          </div>
        </div>
        <span className="text-[10px] text-[#6b6051] shrink-0 hidden sm:inline">
          {event.time}
        </span>
      </div>
    </div>
  );
}
