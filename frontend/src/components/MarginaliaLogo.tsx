"use client";

import React from "react";

interface MarginaliaLogoProps {
  className?: string;
  bracketColor?: string;
  mColor?: string;
  width?: number | string;
  height?: number | string;
}

export default function MarginaliaLogo({
  className = "size-7",
  bracketColor = "currentColor",
  mColor = "currentColor",
  width,
  height,
}: MarginaliaLogoProps) {
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
      {/* 4 Precision Corner Margin Brackets */}
      <g fill={bracketColor} className="transition-colors duration-200">
        {/* Top-Left */}
        <path d="M17 36H54V42H23V69H17V36Z" />
        {/* Top-Right */}
        <path d="M303 36H266V42H297V69H303V36Z" />
        {/* Bottom-Left */}
        <path d="M17 264H54V258H23V231H17V264Z" />
        {/* Bottom-Right */}
        <path d="M303 264H266V258H297V231H303V264Z" />
      </g>

      {/* Pure Vector Geometric M Monogram */}
      <g fill={mColor} className="transition-colors duration-200">
        {/* Left geometric facet */}
        <path d="M105 80L114 80L162 126L56 215L56 125L105 80Z" />
        {/* Right & center geometric facet with precision slit */}
        <path d="M246 75L263 75L260 197L226 233L192 233L192 206L250 148L249 146L142 231L109 232L109 193L114 192L133 177L193 125L246 75Z" />
      </g>
    </svg>
  );
}
