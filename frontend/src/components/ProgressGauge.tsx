import React from "react";

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
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${clamped}%`,
          background: `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`,
        }}
      />
    </div>
  );
}
