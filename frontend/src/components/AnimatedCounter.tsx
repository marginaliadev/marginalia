"use client";

import React, { useState, useEffect } from "react";

interface AnimatedCounterProps {
  end: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

export default function AnimatedCounter({
  end,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1600,
  className = "",
}: AnimatedCounterProps) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease-out cubic formula
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(easeOut * end);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [end, duration]);

  const formatted = decimals > 0 ? count.toFixed(decimals) : Math.floor(count).toString();

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
