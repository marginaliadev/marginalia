import Link from "next/link";
import MarginaliaLogo from "@/components/MarginaliaLogo";
import { ArrowLeft, Home, Compass } from "lucide-react";

export const metadata = {
  title: "404: Page Not Found | MARGINALIA",
  description: "The requested route does not exist in the Marginalia Folio.",
};

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-sun/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center">
        {/* Logo Emblem */}
        <div className="mb-6 p-2 rounded-xl bg-white border border-white/20 shadow-xl drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
          <MarginaliaLogo variant="white" className="size-12" />
        </div>

        {/* Status Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xs border border-sun/30 bg-sun/10 text-sun font-mono text-xs uppercase tracking-widest mb-4">
          <span>Error 404 · Uninscribed Page</span>
        </div>

        {/* Headline */}
        <h1 className="font-cinzel text-4xl sm:text-5xl font-light text-dust tracking-tight mb-3">
          Margin Not Found
        </h1>

        {/* Fermat Lore Quote */}
        <blockquote className="font-heading italic text-lg sm:text-xl text-dust/80 mb-3 max-w-md">
          "Hanc marginis exiguitas non caperet."
        </blockquote>
        <p className="text-xs sm:text-sm font-body text-dust/60 max-w-sm mb-8 leading-relaxed">
          The requested leaf index does not exist in the current Folio Merkle Tree, or this margin was too narrow to contain it.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-all select-none bg-dust border-dust text-night hover:bg-sand font-medium inline-flex items-center gap-2"
          >
            <Home className="size-3.5" />
            <span>Return to Overview</span>
          </Link>
          <Link
            href="/app"
            className="cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-all select-none border-white/20 bg-transparent text-dust hover:text-white hover:border-sun hover:bg-white/5 inline-flex items-center gap-2"
          >
            <Compass className="size-3.5 text-sun" />
            <span>Open Shielded dApp</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
