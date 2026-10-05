"use client";

import React from "react";

export interface MarginaliaLogoProps {
  className?: string;
  variant?: "black" | "white" | "pure";
  mColor?: string;
  strokeColor?: string;
  bracketColor?: string;
  showBrackets?: boolean;
  width?: number | string;
  height?: number | string;
  rounded?: boolean;
}

export default function MarginaliaLogo({
  className = "size-7",
  variant = "black",
  mColor,
  strokeColor,
  bracketColor,
  showBrackets = false,
  width,
  height,
  rounded = true,
}: MarginaliaLogoProps) {
  const isBlack = variant === "black";
  const isWhite = variant === "white";
  const isPure = variant === "pure";

  const fillColor = mColor || (isWhite ? "#131313" : isBlack ? "#FFFFFF" : "currentColor");
  const stroke = strokeColor || (isWhite ? "#131313" : isBlack ? "#F5F5F5" : "none");
  const strokeWidth = isPure && !strokeColor ? 0 : 1.5;

  return (
    <svg
      viewBox="0 0 320 300"
      className={className}
      width={width}
      height={height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Marginalia Official Logo"
    >
      {/* Background card if variant is black or white */}
      {!isPure && (
        <rect
          width="320"
          height="300"
          rx={rounded ? "52" : "0"}
          fill={isWhite ? "#FFFFFF" : "#131313"}
        />
      )}

      {/* Optional Marginalia Margin Brackets */}
      {showBrackets && (
        <g fill={bracketColor || "#FF8B3E"} className="transition-colors duration-200">
          <path d="M17 36H54V42H23V69H17V36Z" />
          <path d="M303 36H266V42H297V69H303V36Z" />
          <path d="M17 264H54V258H23V231H17V264Z" />
          <path d="M303 264H266V258H297V231H303V264Z" />
        </g>
      )}

      {/* Pure Vector Geometric M Monogram from Official SVG */}
      <g className="transition-colors duration-200">
        {/* Left facet */}
        <path
          d="M162.5 126.5L56 216V126.5L106.5 80H114L162.5 126.5Z"
          fill={fillColor}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {/* Right facet */}
        <path
          d="M192 207L262 136.5L140 233H109V193.5C112.6 195.5 126.167 183.667 132.5 178L192 126.5L247 75H264L261 196.5L226 234H192V207Z"
          fill={fillColor}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </g>
    </svg>
  );
}
