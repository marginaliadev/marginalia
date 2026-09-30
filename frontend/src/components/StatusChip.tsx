import React from "react";

interface StatusChipProps {
  label: string;
  dotColor?: string;
  className?: string;
  pulse?: boolean;
}

export default function StatusChip({
  label,
  dotColor = "bg-[#FFAA5B]",
  className = "",
  pulse = true,
}: StatusChipProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14100e] border border-[#2b221a] text-[11px] font-mono-code tracking-[0.08em] uppercase text-[#e8e2d5]/90 shadow-sm ${className}`}
    >
      <span
        className={`size-1.5 rounded-full ${dotColor} ${
          pulse ? "animate-pulse" : ""
        }`}
      />
      <span>{label}</span>
    </div>
  );
}
