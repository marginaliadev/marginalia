"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";

interface TechCardProps {
  children: React.ReactNode;
  className?: string;
  bracketColor?: string;
  hoverGlow?: boolean;
}

export default function TechCard({
  children,
  className = "",
  bracketColor = "text-stroke-3",
  hoverGlow = true,
}: TechCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -3, scale: 1.008 }}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-xs bg-night border border-dusk p-6 text-dust overflow-hidden ${
        hoverGlow
          ? "hover:border-white/30 hover:shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
          : ""
      } ${className}`}
    >
      {/* Interactive Cursor Spotlight Glow (#ff8b3e Sun Glow) */}
      {isHovered && hoverGlow && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300"
          style={{
            background: `radial-gradient(380px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 139, 62, 0.16), transparent 70%)`,
          }}
        />
      )}

      {/* Noirpay Exact 4-Corner Bracket Crosshairs */}
      <div
        className={`pointer-events-none absolute size-3 border-current top-0 left-0 border-t border-l ${bracketColor} transition-colors`}
      />
      <div
        className={`pointer-events-none absolute size-3 border-current top-0 right-0 border-t border-r ${bracketColor} transition-colors`}
      />
      <div
        className={`pointer-events-none absolute size-3 border-current bottom-0 left-0 border-b border-l ${bracketColor} transition-colors`}
      />
      <div
        className={`pointer-events-none absolute size-3 border-current bottom-0 right-0 border-b border-r ${bracketColor} transition-colors`}
      />

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
