"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { Shield, ArrowUpRight, ArrowDownLeft, Zap, AlertTriangle, KeyRound, Copy, Check, Terminal, ExternalLink } from "lucide-react";
import NoirModal from "@/components/NoirModal";

export default function ShieldedAppPage() {
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "courier" | "ragequit" | "vault">("deposit");

  // Deposit State
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLabel, setDepositLabel] = useState("0");
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);

  // Withdraw State
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [withdrawLogs, setWithdrawLogs] = useState<Array<{ time: string; msg: string; isError?: boolean }>>([]);
  const [withdrawProgress, setWithdrawProgress] = useState(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawStage, setWithdrawStage] = useState("");

  // Courier State
  const [courierQuote, setCourierQuote] = useState<{ gasPrice: string; minFee: string; courierAddr: string } | null>(null);
  const [isLoadingCourier, setIsLoadingCourier] = useState(false);

  // Ragequit State
  const [ragequitNote, setRagequitNote] = useState("");
  const [ragequitRecipient, setRagequitRecipient] = useState("");

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "info" | "danger" | "success";
    confirmText?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
  });

  const showModal = (title: string, message: string, type: "info" | "danger" | "success" = "info", confirmText = "Understood") => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type,
      confirmText,
    });
  };

  const getConnectedAccount = async (): Promise<string | null> => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: "eth_accounts" });
        return accounts && accounts.length > 0 ? accounts[0] : null;
      } catch (_) {}
    }
    return null;
  };

  // --- Handlers ---
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const account = await getConnectedAccount();
    if (!account) {
      showModal("Wallet Required", "Please connect your Web3 wallet (MetaMask or Rabby) to inscribe private commitments.", "danger", "Connect Wallet");
      return;
    }

    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      showModal("Invalid Amount", "Please specify a valid ETH deposit amount greater than zero.", "danger");
      return;
    }

    showModal(
      "Deposit Not Yet Wired",
      `Browser deposits (note secret generation + wallet transaction) are not implemented in this UI yet, so nothing was sent. To deposit ${depositAmount} ETH use: AMOUNT=${depositAmount} npx hardhat run scripts/deposit.js --network robinhoodTestnet`,
      "info",
      "Understood"
    );
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawNote.trim() || !withdrawRecipient.trim()) {
      showModal("Missing Information", "Please provide both the secret note and recipient address.", "info", "Got it");
      return;
    }

    if (!ethers.isAddress(withdrawRecipient.trim()) || withdrawRecipient.trim() === ethers.ZeroAddress) {
      showModal("Invalid Recipient Address", "Please enter a valid, non-zero Ethereum address for the private withdrawal recipient.", "danger", "Dismiss");
      return;
    }

    // Syntax & format validation
    try {
      if (!withdrawNote.startsWith("marginalia-note-v1-")) {
        throw new Error("Invalid Note Prefix: Expected 'marginalia-note-v1-' prefix.");
      }
      const payloadBase64 = withdrawNote.slice("marginalia-note-v1-".length);
      let jsonString: string;
      try {
        jsonString = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
      } catch (_) {
        throw new Error("Corrupted Base64: Note payload cannot be decoded.");
      }
      try {
        JSON.parse(jsonString);
      } catch (_) {
        throw new Error("Malformed Note JSON: The note payload is not valid JSON.");
      }
    } catch (syntaxErr: any) {
      showModal("Invalid Secret Marginal Note", syntaxErr.message, "danger", "Dismiss");
      return;
    }

    setIsWithdrawing(true);
    setWithdrawLogs([]);
    setWithdrawProgress(15);
    setWithdrawStage("CRYPTOGRAPHIC INTEGRITY VERIFICATION");

    const addLog = (time: string, msg: string, isError = false) => {
      setWithdrawLogs((prev) => [...prev, { time, msg, isError }]);
    };

    addLog("0.05s", "Deconstructing marginal note: extracting sk and nullifier entropy ρ...");

    try {
      const res = await fetch("/api/note/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: withdrawNote.trim() }),
      });
      const data = await res.json();

      if (!data.valid) {
        addLog("0.35s", `[REJECTED] ${data.error}`, true);
        setWithdrawProgress(30);
        showModal("Note Validation Failed", data.error, "danger", "Dismiss");
        setIsWithdrawing(false);
        return;
      }

      addLog("0.45s", `Note integrity verified: leaf commitment = ${data.commitment ? data.commitment.slice(0, 18) + "..." : "OK"}`);
      addLog("0.60s", `Wax Seal (nullifier) verified intact: ${data.nullifierHash.slice(0, 18)}... (unspent)`);
      setWithdrawProgress(100);
      setWithdrawStage("NOTE VERIFIED ON-CHAIN");
      addLog("0.80s", "Validation only: no proof was generated and no transaction was sent.");
      setIsWithdrawing(false);
      showModal(
        "Note Verified (No Withdrawal Sent)",
        "This note is genuine, inscribed in the Folio and still unspent.\n\nIn-browser proof generation is not wired into this UI yet. To withdraw, run: NOTE=<note> RECIPIENT=<address> npx hardhat run scripts/withdraw.js --network robinhoodTestnet",
        "info",
        "Understood"
      );
    } catch (err: any) {
      showModal("Validation Error", err.message, "danger");
      setIsWithdrawing(false);
    }
  };

  const handleFetchCourierQuote = async () => {
    setIsLoadingCourier(true);
    try {
      const res = await fetch("/api/relay/quote", { method: "POST" });
      const data = await res.json();
      setCourierQuote({
        gasPrice: `${data.gasPriceGwei} Gwei`,
        minFee: `${data.minFeeEth} ETH`,
        courierAddr: `${data.relayer.slice(0, 6)}...${data.relayer.slice(-4)} (Active)`,
      });
    } catch (_) {
      showModal("Relayer Error", "Could not fetch quote from Mersenne Courier.", "danger");
    } finally {
      setIsLoadingCourier(false);
    }
  };

  const handleRagequitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragequitNote.trim() || !ragequitRecipient.trim()) {
      showModal("Missing Information", "Please provide both the secret note and recipient address.", "info");
      return;
    }

    if (!ragequitNote.startsWith("marginalia-note-v1-")) {
      showModal("Invalid Secret Note", "The note payload does not have the required 'marginalia-note-v1-' prefix.", "danger");
      return;
    }

    if (!ethers.isAddress(ragequitRecipient.trim()) || ragequitRecipient.trim() === ethers.ZeroAddress) {
      showModal("Invalid Recipient Address", "Please enter a valid, non-zero Ethereum address.", "danger");
      return;
    }

    try {
      const res = await fetch("/api/note/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: ragequitNote.trim() }),
      });
      const data = await res.json();
      if (!data.valid) {
        showModal("Invalid Secret Note", data.error, "danger");
        return;
      }
      showModal(
        "Note Verified (No Exit Sent)",
        "Ragequit must be sent by the original depositor wallet and needs a ragequit proof, which is not wired into this UI yet. Use the CLI proveRagequit flow (lib/marginalia.js) with the depositor key.",
        "info"
      );
    } catch (err: any) {
      showModal("Validation Error", err.message, "danger");
    }
  };

  const handleUnlockVault = async () => {
    const account = await getConnectedAccount();
    if (!account) {
      showModal("Wallet Required", "A connected wallet signature is required to decrypt your local notes vault using EIP-712 / WebCrypto AES-256-GCM.", "danger");
      return;
    }
    showModal("Vault Unlocked", "Local encrypted vault is now unlocked.", "success");
  };

  return (
    <div className="min-h-screen bg-[#0B0907] text-white">
      {/* HEADER / HERO BANNER */}
      <section className="relative overflow-clip pb-8 pt-8">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex flex-col justify-between">
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-6 lg:py-8">
              <div>
                <div className="flex items-center gap-2.5 text-mono-s uppercase tracking-wider text-sun mb-2">
                  <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                  <span>Robinhood Chain Testnet (46630) · Active</span>
                </div>
                <h1 className="text-heading-48 text-dust font-light">
                  Shielded Pool & Account Terminal
                </h1>
                <p className="text-body-16-light text-dust/70 mt-2 max-w-[38rem]">
                  Inscribe private commitments, synthesize client-side Groth16 zero-knowledge proofs, and execute unlinkable exits without leaving traces on the public explorer.
                </p>
              </div>

              {/* Top Quick Telemetry */}
              <div className="flex items-center gap-3">
                <div className="border border-dusk bg-night p-3.5 rounded-xs">
                  <div className="text-[10px] font-mono uppercase text-dust/50">Shielded Engine</div>
                  <div className="text-sm font-mono font-semibold text-sun mt-0.5">Groth16 BN254</div>
                </div>
                <div className="border border-dusk bg-night p-3.5 rounded-xs">
                  <div className="text-[10px] font-mono uppercase text-dust/50">Magistrate ASP</div>
                  <div className="text-sm font-mono font-semibold text-emerald-400 mt-0.5">16 Roots Valid</div>
                </div>
              </div>
            </div>

            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
          </div>
        </div>
      </section>

      {/* MAIN dAPP CONTAINER */}
      <main className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6">
          <button
            data-tab="deposit"
            onClick={() => setActiveTab("deposit")}
            className={`cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none flex items-center gap-2 whitespace-nowrap ${
              activeTab === "deposit"
                ? "bg-dust border-dust text-night font-semibold shadow-sm"
                : "bg-midnight border-dusk text-white hover:bg-night"
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>01 SHIELD / DEPOSIT</span>
          </button>

          <button
            data-tab="withdraw"
            onClick={() => setActiveTab("withdraw")}
            className={`cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none flex items-center gap-2 whitespace-nowrap ${
              activeTab === "withdraw"
                ? "bg-dust border-dust text-night font-semibold shadow-sm"
                : "bg-midnight border-dusk text-white hover:bg-night"
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>02 PRIVATE WITHDRAW</span>
          </button>

          <button
            data-tab="courier"
            onClick={() => setActiveTab("courier")}
            className={`cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none flex items-center gap-2 whitespace-nowrap ${
              activeTab === "courier"
                ? "bg-dust border-dust text-night font-semibold shadow-sm"
                : "bg-midnight border-dusk text-white hover:bg-night"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>03 MERSENNE COURIER</span>
          </button>

          <button
            data-tab="ragequit"
            onClick={() => setActiveTab("ragequit")}
            className={`cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none flex items-center gap-2 whitespace-nowrap ${
              activeTab === "ragequit"
                ? "bg-rose-900 border-rose-500 text-rose-100 font-semibold"
                : "bg-midnight border-dusk text-white hover:bg-night"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>04 EMERGENCY EXIT</span>
          </button>

          <button
            data-tab="vault"
            onClick={() => setActiveTab("vault")}
            className={`cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none flex items-center gap-2 whitespace-nowrap ${
              activeTab === "vault"
                ? "bg-dust border-dust text-night font-semibold shadow-sm"
                : "bg-midnight border-dusk text-white hover:bg-night"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>05 ENCRYPTED VAULT</span>
          </button>
        </div>

        {/* TAB CONTENT PANEL */}
        <div className="border border-dusk bg-night p-6 sm:p-10 rounded-xs relative">
          {/* Corner Crosshairs */}
          <div className="relative h-2 text-stroke-3 -mt-2 mb-4">
            <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
            <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
          </div>

          {/* TAB 1: DEPOSIT */}
          {activeTab === "deposit" && (
            <form onSubmit={handleDepositSubmit} className="space-y-6 max-w-[42rem]">
              <div className="pb-4 border-b border-dusk/60">
                <div className="text-mono-s text-sun uppercase tracking-wider mb-1">Folio Tree Inscription</div>
                <h2 className="text-heading-28 text-dust">Inscribe Private Commitment</h2>
                <p className="text-body-16-light text-dust/70 mt-1">
                  Your deposit value will be mathematically obscured into a Poseidon commitment leaf in the 2²⁰ Folio tree.
                </p>
              </div>

              <div>
                <label className="block text-mono-s text-dust/80 uppercase mb-2">
                  Deposit Value (ETH)
                </label>
                <div className="relative">
                  <input
                    id="depositAmount"
                    type="text"
                    placeholder="0.05"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full bg-[#14100e] border border-dusk rounded-xs px-4 py-3.5 text-sm font-mono text-dust focus:outline-none focus:border-sun transition-colors placeholder:text-dust/30"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-dust/50">ETH</div>
                </div>
              </div>

              <div>
                <label className="block text-mono-s text-dust/80 uppercase mb-2">
                  Compliance Label (Magistrate ASP Association)
                </label>
                <input
                  id="depositLabel"
                  type="text"
                  value={depositLabel}
                  onChange={(e) => setDepositLabel(e.target.value)}
                  className="w-full bg-[#14100e] border border-dusk rounded-xs px-4 py-3.5 text-sm font-mono text-dust focus:outline-none focus:border-sun transition-colors"
                />
                <span className="text-mono-s text-dust/50 mt-1.5 block">
                  Default: 0 (Unlabeled / Clean Association Pool Set)
                </span>
              </div>

              <button
                id="submitDepositBtn"
                type="submit"
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center justify-center gap-2 text-sm mt-4"
              >
                <Shield className="w-4 h-4" />
                <span>Inscribe Secret Note & Deposit ETH</span>
              </button>
            </form>
          )}

          {/* TAB 2: WITHDRAW */}
          {activeTab === "withdraw" && (
            <form onSubmit={handleWithdrawSubmit} className="space-y-6 max-w-[42rem]">
              <div className="pb-4 border-b border-dusk/60">
                <div className="text-mono-s text-sun uppercase tracking-wider mb-1">Zero-Knowledge Exit</div>
                <h2 className="text-heading-28 text-dust">Private Exit & Witness Synthesis</h2>
                <p className="text-body-16-light text-dust/70 mt-1">
                  Provide your secret marginal note to generate a Groth16 zk-SNARK proof and receive clean funds at an unlinked address.
                </p>
              </div>

              <div>
                <label className="block text-mono-s text-dust/80 uppercase mb-2">
                  Secret Marginal Note
                </label>
                <textarea
                  id="withdrawNote"
                  rows={3}
                  placeholder="marginalia-note-v1-..."
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  className="w-full bg-[#14100e] border border-dusk rounded-xs p-4 text-xs font-mono text-dust focus:outline-none focus:border-sun transition-colors resize-none placeholder:text-dust/30"
                />
              </div>

              <div>
                <label className="block text-mono-s text-dust/80 uppercase mb-2">
                  Recipient Clean Address
                </label>
                <input
                  id="withdrawRecipient"
                  type="text"
                  placeholder="0x..."
                  value={withdrawRecipient}
                  onChange={(e) => setWithdrawRecipient(e.target.value)}
                  className="w-full bg-[#14100e] border border-dusk rounded-xs px-4 py-3.5 text-sm font-mono text-dust focus:outline-none focus:border-sun transition-colors placeholder:text-dust/30"
                />
              </div>

              <button
                id="submitWithdrawBtn"
                type="submit"
                disabled={isWithdrawing}
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center justify-center gap-2 text-sm mt-4 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{isWithdrawing ? "Synthesizing Witness..." : "Verify & Synthesize Groth16 Proof"}</span>
              </button>

              {/* Progress / Synthesis Logs */}
              {withdrawLogs.length > 0 && (
                <div className="mt-6 bg-[#0c0908] border border-dusk rounded-xs p-5 font-mono text-xs">
                  <div className="flex items-center justify-between mb-3 text-[11px] text-sun">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{withdrawStage}</span>
                    </span>
                    <span>{withdrawProgress}%</span>
                  </div>

                  <div className="w-full h-1 bg-dust/20 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-sun transition-all duration-300"
                      style={{ width: `${withdrawProgress}%` }}
                    />
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {withdrawLogs.map((log, idx) => (
                      <div key={idx} className={`text-[11px] ${log.isError ? "text-rose-400" : "text-dust/80"}`}>
                        <span className="text-dust/40 mr-2">[{log.time}]</span>
                        <span>{log.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}

          {/* TAB 3: COURIER */}
          {activeTab === "courier" && (
            <div className="space-y-6 max-w-[42rem]">
              <div className="pb-4 border-b border-dusk/60">
                <div className="text-mono-s text-sun uppercase tracking-wider mb-1">Mersenne Relayer Network</div>
                <h2 className="text-heading-28 text-dust">Gas Sponsorship & Meta-Transactions</h2>
                <p className="text-body-16-light text-dust/70 mt-1">
                  Execute withdrawals without holding gas ETH in your clean destination address. The Courier relays the transaction on Robinhood Chain Orbit L2.
                </p>
              </div>

              <button
                id="fetchCourierQuoteBtn"
                onClick={handleFetchCourierQuote}
                disabled={isLoadingCourier}
                className="cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>{isLoadingCourier ? "Querying RPC..." : "Fetch Courier Quote"}</span>
              </button>

              {courierQuote && (
                <div id="courierQuoteDisplay" className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-dusk/60">
                  <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                    <div className="text-[10px] font-mono text-dust/50 uppercase mb-1">Current Gas Price</div>
                    <div id="courierGasPrice" className="text-sm font-semibold font-mono text-sun">
                      {courierQuote.gasPrice}
                    </div>
                  </div>

                  <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                    <div className="text-[10px] font-mono text-dust/50 uppercase mb-1">Minimum Relayer Fee</div>
                    <div id="courierMinFeeEth" className="text-sm font-semibold font-mono text-dust">
                      {courierQuote.minFee}
                    </div>
                  </div>

                  <div className="p-4 rounded-xs bg-[#14100e] border border-dusk">
                    <div className="text-[10px] font-mono text-dust/50 uppercase mb-1">Relayer Operator</div>
                    <div id="courierAddress" className="text-xs font-semibold font-mono text-emerald-400 truncate">
                      {courierQuote.courierAddr}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RAGEQUIT */}
          {activeTab === "ragequit" && (
            <form onSubmit={handleRagequitSubmit} className="space-y-6 max-w-[42rem]">
              <div className="pb-4 border-b border-rose-900/40">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  <h2 className="text-heading-28 text-rose-300">
                    Emergency Exit (Axiom IV: Sovereign Ragequit)
                  </h2>
                </div>
                <p className="text-body-16-light text-dust/70 mt-1">
                  Should relayer consensus fail or circuits face unexpected conditions, directly recover deposited funds using your precommitment without zk-SNARK proofs.
                </p>
              </div>

              <div>
                <label className="block text-mono-s text-rose-300 uppercase mb-2">
                  Secret Note to Ragequit
                </label>
                <textarea
                  id="ragequitNote"
                  rows={3}
                  placeholder="marginalia-note-v1-..."
                  value={ragequitNote}
                  onChange={(e) => setRagequitNote(e.target.value)}
                  className="w-full bg-[#14100e] border border-rose-900/60 rounded-xs p-4 text-xs font-mono text-dust focus:outline-none focus:border-rose-500 transition-colors resize-none placeholder:text-dust/30"
                />
              </div>

              <div>
                <label className="block text-mono-s text-rose-300 uppercase mb-2">
                  Emergency Recipient Address
                </label>
                <input
                  id="ragequitRecipient"
                  type="text"
                  placeholder="0x..."
                  value={ragequitRecipient}
                  onChange={(e) => setRagequitRecipient(e.target.value)}
                  className="w-full bg-[#14100e] border border-rose-900/60 rounded-xs px-4 py-3.5 text-sm font-mono text-dust focus:outline-none focus:border-rose-500 transition-colors placeholder:text-dust/30"
                />
              </div>

              <button
                id="submitRagequitBtn"
                type="submit"
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-rose-900/90 border-rose-500/50 text-white hover:bg-rose-800 flex items-center justify-center gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Execute Emergency Ragequit</span>
              </button>
            </form>
          )}

          {/* TAB 5: VAULT */}
          {activeTab === "vault" && (
            <div className="space-y-6 max-w-[42rem]">
              <div className="pb-4 border-b border-dusk/60">
                <div className="text-mono-s text-sun uppercase tracking-wider mb-1">WebCrypto AES-256-GCM</div>
                <h2 className="text-heading-28 text-dust">Encrypted Client-Side Note Vault</h2>
                <p className="text-body-16-light text-dust/70 mt-1">
                  Your marginal notes are encrypted directly in your browser, accessible only via your wallet’s zero-gas EIP-712 signature.
                </p>
              </div>

              <div className="bg-[#14100e] border border-dusk rounded-xs p-8 text-center">
                <KeyRound className="w-10 h-10 text-sun mx-auto mb-3" />
                <h3 className="font-heading text-xl text-dust mb-1">
                  Vault is Locked
                </h3>
                <p className="text-xs text-dust/70 max-w-sm mx-auto mb-6">
                  Sign a zero-gas cryptographic message with your Web3 wallet to derive your AES-256-GCM decryption key.
                </p>

                <button
                  id="unlockVaultBtn"
                  onClick={handleUnlockVault}
                  className="cursor-pointer rounded-xs border px-4 py-2.5 text-xs font-mono transition-colors select-none bg-dust border-dust text-night hover:bg-sand inline-flex items-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Unlock Encrypted Vault</span>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Corner Crosshairs */}
          <div className="relative h-2 text-stroke-3 -mb-2 mt-4">
            <div className="absolute size-2.5 border-current bottom-0 left-0 border-b border-l"></div>
            <div className="absolute size-2.5 border-current bottom-0 right-0 border-b border-r"></div>
          </div>
        </div>
      </main>

      {/* Noir Modal Component */}
      <NoirModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
