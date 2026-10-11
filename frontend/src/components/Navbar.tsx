"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Wallet, CheckCircle, ArrowRight, Menu, X } from "lucide-react";

import MarginaliaLogo from "@/components/MarginaliaLogo";
import { CHAIN } from "@/lib/chain";


// Links of the mobile / tablet menu (below the lg breakpoint the inline nav is hidden). Ceremony lives here and in the footer.
const MENU_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/app", label: "Shielded App" },
  { href: "/explorer", label: "Explorer" },
  { href: "/compliance", label: "Compliance" },
  { href: "/codex", label: "Codex" },
  { href: "/ceremony", label: "Trusted Setup Ceremony" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // close the menu after navigating, on Escape, and when the viewport grows to the desktop layout
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onChange);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind the open menu does not scroll
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onChange);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    // DO NOT eagerly trigger wallet popup unless user previously clicked connect
    if (typeof window === "undefined") return;
    const wasConnected = localStorage.getItem("marginalia_wallet_connected") === "true";
    if (!wasConnected) return;

    if ((window as any).ethereum) {
      const eth = (window as any).ethereum;
      eth
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            setAccount(accounts[0]);
          } else {
            localStorage.removeItem("marginalia_wallet_connected");
          }
        })
        .catch(() => {});

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          localStorage.setItem("marginalia_wallet_connected", "true");
        } else {
          setAccount(null);
          localStorage.removeItem("marginalia_wallet_connected");
        }
      };

      eth.on("accountsChanged", handleAccountsChanged);
      return () => {
        eth.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, []);

  const connectWallet = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setWalletError("No Web3 wallet detected. Please install MetaMask or Rabby.");
      setTimeout(() => setWalletError(null), 4000);
      return;
    }
    setIsConnecting(true);
    try {
      const eth = (window as any).ethereum;
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        localStorage.setItem("marginalia_wallet_connected", "true");
      }
      const currentChainId = await eth.request({ method: "eth_chainId" });
      if (parseInt(currentChainId, 16) !== CHAIN.chainId) {
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CHAIN.chainIdHex }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: CHAIN.chainIdHex,
                  chainName: CHAIN.name,
                  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                  rpcUrls: [CHAIN.rpcUrl],
                  blockExplorerUrls: [CHAIN.explorerUrl],
                },
              ],
            });
          }
        }
      }
    } catch (err) {
      console.error("Wallet connection error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <header className="sticky inset-x-0 top-0 z-50 h-(--header-height) bg-black text-white border-b border-white/10 transition-[background-color,color,box-shadow,height] duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-x-6">
        <div className="flex min-w-0 flex-1 items-center gap-x-8 xl:gap-x-14">
          {/* Logo */}
          <Link aria-label="Home" className="shrink-0 flex items-center gap-3.5 group" href="/">
            <MarginaliaLogo
              variant="white"
              className="size-8.5 rounded-lg border border-white/20 shadow-md group-hover:scale-105 transition-all duration-300"
            />
            <span className="font-cinzel text-base min-[400px]:text-xl sm:text-[22px] tracking-[0.1em] min-[400px]:tracking-[0.14em] font-semibold text-dust group-hover:text-sun transition-colors uppercase">
              Marginalia
            </span>
          </Link>

          {/* Exact Noirpay Nav Links */}
          <nav className="hidden items-center gap-x-6 lg:flex xl:gap-x-8">
            <Link
              className={`text-nav-link inline-block py-1 transition-colors ${
                pathname === "/" ? "text-sun font-medium" : "text-white/70 hover:text-sun"
              }`}
              href="/"
            >
              Overview
            </Link>
            <a
              className="text-nav-link inline-block py-1 transition-colors text-white/70 hover:text-sun"
              href="/#how-it-works"
            >
              How It Works
            </a>
            <Link
              className={`text-nav-link inline-block py-1 transition-colors ${
                pathname === "/app" ? "text-sun font-medium" : "text-white/70 hover:text-sun"
              }`}
              href="/app"
            >
              Shielded App
            </Link>
            <Link
              className={`text-nav-link inline-block py-1 transition-colors ${
                pathname === "/explorer" ? "text-sun font-medium" : "text-white/70 hover:text-sun"
              }`}
              href="/explorer"
            >
              Explorer
            </Link>
            <Link
              className={`text-nav-link inline-block py-1 transition-colors ${
                pathname === "/compliance" ? "text-sun font-medium" : "text-white/70 hover:text-sun"
              }`}
              href="/compliance"
            >
              Compliance
            </Link>
            <Link
              className={`text-nav-link inline-block py-1 transition-colors ${
                pathname === "/codex" ? "text-sun font-medium" : "text-white/70 hover:text-sun"
              }`}
              href="/codex"
            >
              Codex
            </Link>
          </nav>
        </div>

        {/* Right Action Buttons */}
        <div className="flex shrink-0 items-center gap-x-2 sm:gap-x-3">
          {/* Official X (Twitter) Account */}
          <a
            href="https://x.com/MarginaliaZK"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Official X Account"
            title="Follow @MarginaliaZK on X"
            className="max-sm:hidden inline-flex cursor-pointer items-center justify-center size-9 rounded-xs border border-white/20 bg-transparent text-white/80 hover:text-sun hover:border-sun/60 hover:bg-white/5 transition-all duration-200"
          >
            <svg className="size-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          <div className="relative max-lg:hidden">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-x-2 rounded-xs border bg-transparent px-3.5 py-[0.5625rem] whitespace-nowrap transition-colors select-none border-white/25 text-white hover:border-white/60 hover:bg-white/5 font-mono text-[0.75rem]"
            >
              <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
              <span>CHAIN {CHAIN.chainId}</span>
            </button>
          </div>

          {pathname === "/app" ? (
            account ? (
              <div className="inline-flex items-center gap-x-2 rounded-xs border border-white/20 bg-night px-3.5 py-[0.5625rem] text-xs font-mono text-dust">
                <CheckCircle className="size-3.5 text-emerald-400" />
                <span>
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-3.5 py-[0.5625rem] text-center whitespace-nowrap transition-colors select-none bg-dust border-dust text-night hover:bg-sand font-medium text-xs"
              >
                <Wallet className="size-3.5 mr-1.5" />
                <span>{isConnecting ? "Connecting..." : "Connect"}</span>
              </button>
            )
          ) : (
            <Link
              href="/app"
              className="inline-flex cursor-pointer items-center justify-center rounded-xs border px-3.5 py-[0.5625rem] text-center whitespace-nowrap transition-colors select-none bg-dust border-dust text-night hover:bg-sand font-medium text-xs"
            >
              dApp access
            </Link>
          )}

          {/* Hamburger: only below the lg breakpoint, where the inline nav is hidden */}
          <button
            type="button"
            className="lg:hidden inline-flex cursor-pointer items-center justify-center size-9 rounded-xs border border-white/20 bg-transparent text-white/80 hover:text-sun hover:border-sun/60 transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      {menuOpen && (
        <nav
          id="mobile-menu"
          aria-label="Main"
          className="lg:hidden absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-5.375rem)] overflow-y-auto border-b border-white/10 bg-black/98 backdrop-blur-sm"
        >
          <ul className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
            {MENU_LINKS.map((l) => {
              const active = l.href === pathname;
              return (
                <li key={l.href} className="border-b border-white/5 last:border-0">
                  <Link
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between py-3.5 text-nav-link transition-colors ${active ? "text-sun font-medium" : "text-white/80 hover:text-sun"}`}
                  >
                    <span>{l.label}</span>
                    <ArrowRight className="size-4 opacity-50" />
                  </Link>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 pt-4 pb-2">
              <span className="inline-flex items-center gap-x-2 text-xs font-mono text-white/70">
                <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                CHAIN {CHAIN.chainId}
              </span>
              <a
                href="https://x.com/MarginaliaZK"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-mono text-white/70 hover:text-sun"
              >
                @MarginaliaZK on X <ArrowRight className="size-3.5" />
              </a>
            </li>
          </ul>
        </nav>
      )}

      {/* Wallet Error In-App Banner */}
      {walletError && (
        <div className="bg-[#1b1613] border-b border-sun/40 px-4 py-2 text-center text-xs font-mono text-sun animate-fade-in flex items-center justify-center gap-2">
          <span>{walletError}</span>
        </div>
      )}
    </header>
  );
}
