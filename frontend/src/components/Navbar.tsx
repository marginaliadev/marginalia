"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Wallet, CheckCircle, ArrowRight } from "lucide-react";

const RH_TESTNET_CHAIN_ID = "0xb626"; // 46630 in hex
const RH_TESTNET_CHAIN_ID_DEC = 46630;

export default function Navbar() {
  const pathname = usePathname();
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

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
      alert("No Web3 wallet found. Please install MetaMask or Rabby.");
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
      if (parseInt(currentChainId, 16) !== RH_TESTNET_CHAIN_ID_DEC) {
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: RH_TESTNET_CHAIN_ID }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: RH_TESTNET_CHAIN_ID,
                  chainName: "Robinhood Chain Testnet",
                  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
                  blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
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
          <Link aria-label="Home" className="block shrink-0 flex items-center gap-3 group" href="/">
            <div className="size-7 rounded-xs bg-dust text-night flex items-center justify-center font-heading text-sm font-bold">
              M
            </div>
            <span className="font-heading text-2xl tracking-[-0.03em] font-normal text-dust group-hover:text-sun transition-colors">
              marginalia
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
        <div className="flex shrink-0 items-center gap-x-3">
          <div className="relative max-lg:hidden">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-x-2 rounded-xs border bg-transparent px-3.5 py-[0.5625rem] whitespace-nowrap transition-colors select-none border-white/25 text-white hover:border-white/60 hover:bg-white/5 font-mono text-[0.75rem]"
            >
              <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
              <span>CHAIN 46630</span>
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
        </div>
      </div>
    </header>
  );
}
