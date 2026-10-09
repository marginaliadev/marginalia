import { ImageResponse } from "next/og";

// Generated at request time: the previous static /images/marginalia-hero.webp never existed (404), so link previews had no image.
export const alt = "MARGINALIA: Compliant Shielded Pool on Robinhood Chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0B0907",
          color: "#F5EEDC",
          padding: 72,
          border: "2px solid #3a322b",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: "#FF7A3D" }}>ROBINHOOD CHAIN TESTNET · 46630</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 128, fontWeight: 700, letterSpacing: 10 }}>MARGINALIA</div>
          <div style={{ display: "flex", fontSize: 44, marginTop: 24, color: "#cfc7b6" }}>Proven. Not revealed.</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#a8a092" }}>Zero-knowledge shielded pool with provable compliance (Groth16, Poseidon, ASP)</div>
      </div>
    ),
    { ...size }
  );
}
