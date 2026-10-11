import type { NextConfig } from "next";
import path from "path";

const dev = process.env.NODE_ENV !== "production";

// Origins the BROWSER may call besides this site: the public Robinhood RPC and the RPC configured for the build.
// Server-side calls (Supabase, Alchemy, IPFS, the relayer) never run in the browser and are not listed.
const originOf = (u?: string) => {
  try { return u ? new URL(u).origin : null; } catch { return null; }
};
const connectOrigins = Array.from(new Set([
  "https://rpc.testnet.chain.robinhood.com",
  originOf(process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL),
].filter(Boolean) as string[]));

// Content-Security-Policy. 'unsafe-inline' for scripts/styles is required by Next's inline bootstrap and fonts (no nonce
// pipeline yet), so the main protection here is: no foreign script origins, no eval, no framing, no plugins, and
// connections only to this site and the RPC. 'wasm-unsafe-eval' is needed for snarkjs (WebAssembly), blob: workers for its prover.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${connectOrigins.join(" ")}${dev ? " ws: http:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
