"use client";

import React from "react";
import { motion } from "framer-motion";

interface ProgressGaugeProps {
  progressPercentage: number;
  gradientFrom?: string;
  gradientTo?: string;
  className?: string;
}

export default function ProgressGauge({
  progressPercentage,
  gradientFrom = "#d4af37",
  gradientTo = "#FFAA5B",
  className = "",
}: ProgressGaugeProps) {
  const clamped = Math.min(100, Math.max(0, progressPercentage));

  return (
    <div className={`w-full h-1 bg-[#1a1410] rounded-full overflow-hidden ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
        }}
        initial={{ width: "0%" }}
        whileInView={{ width: `${clamped}%` }}
        viewport={{ once: false }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
