import type { Metadata } from "next";
import { Cinzel, Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import IntroSequence from "@/components/IntroSequence";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // The public origin, so canonical / og:url / og:image resolve to the real domain (override per deployment).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://marginaliazk.tech"),
  title: {
    default: "MARGINALIA: Compliant Shielded Pool on Robinhood Chain",
    template: "%s | MARGINALIA",
  },
  description: "Mathematical privacy on Robinhood Orbit L2. Zero-Knowledge Groth16 proofs, association set providers, and cryptographic disclosure.",
  applicationName: "Marginalia",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "MARGINALIA: Compliant Shielded Pool on Robinhood Chain",
    description: "Mathematical privacy on Robinhood Orbit L2. Zero-Knowledge Groth16 proofs, association set providers, and cryptographic disclosure.",
    url: "/",
    siteName: "MARGINALIA Protocol",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MARGINALIA: Compliant Shielded Pool on Robinhood Chain",
    description: "Mathematical privacy on Robinhood Orbit L2. Zero-Knowledge Groth16 proofs, association set providers, and cryptographic disclosure.",
    site: "@MarginaliaZK",
    creator: "@MarginaliaZK",
  },
  icons: {
    icon: [
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/logo-bg-white.svg?v=3", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg?v=3",
    apple: "/favicon.svg?v=3",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen flex flex-col bg-[#080706] text-[#eae5d9] antialiased selection:bg-[#3b2812] selection:text-[#f5eedc]">
        {/* Cinematic Preloader & Intro Sequence */}
        <IntroSequence />

        {/* Ambient Grid and Radial Glow */}
        <div className="bg-grid-overlay" />
        <div className="ambient-glow-sun" />

        {/* Global Navigation */}
        <Navbar />

        {/* Main Content Area */}
        <main className="flex-1 relative z-10">{children}</main>

        {/* Global Footer */}
        <Footer />
      </body>
    </html>
  );
}
