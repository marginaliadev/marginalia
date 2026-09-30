"use client";

import { useState, useEffect } from "react";
import { Compass, ShieldCheck, ShieldAlert, Search, RefreshCw, ExternalLink, Activity } from "lucide-react";

export default function ExplorerPage() {
  const [telemetry, setTelemetry] = useState<{
    folioNotesCount: number | string;
    aspApprovedCount: string;
    poolBalance: string;
    blockNumber: number | string;
  }>({
    folioNotesCount: "--",
    aspApprovedCount: "--",
    poolBalance: "--",
    blockNumber: "--",
  });

  const [nullifierInput, setNullifierInput] = useState("");
  const [sealResult, setSealResult] = useState<{
    statusText: string;
    isSpent: boolean;
    nullifier: string;
    checkedAt: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setTelemetry({
        folioNotesCount: data.database.leavesCount,
        aspApprovedCount: `${data.database.aspCount} / 2`,
        poolBalance: `${data.telemetry.poolBalanceEth}`,
        blockNumber: data.telemetry.blockNumber ?? "Live",
      });
    } catch (_) {}
  };

  const handleNullifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nullifierInput.trim()) return;

    setIsVerifying(true);
    try {
      const res = await fetch("/api/nullifier/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nullifier: nullifierInput.trim() }),
      });
      const data = await res.json();

      setSealResult({
        nullifier: nullifierInput.trim(),
        isSpent: data.isSpent,
        statusText: data.isSpent ? "WAX SEAL BROKEN (SPENT)" : "WAX SEAL INTACT (UNSPENT)",
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch (_) {
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0907] text-white">
      {/* HERO SECTION */}
      <section className="relative overflow-clip pb-8 pt-8">
        <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex flex-col justify-between">
            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-6 lg:py-8">
              <div>
                <div className="flex items-center gap-2.5 text-mono-s uppercase tracking-wider text-sun mb-2">
                  <span className="size-1.5 rounded-full bg-sun animate-pulse"></span>
                  <span>On-Chain Telemetry & Ledger Inspector</span>
                </div>
                <h1 className="text-heading-48 text-dust font-light">
                  Folio Explorer & Wax Seal Verifier
                </h1>
                <p className="text-body-16-light text-dust/70 mt-2 max-w-[38rem]">
                  Inspect public state parameters, verify inscribed Merkle tree leaves, and audit single-use wax seals without decrypting private balances.
                </p>
              </div>

              <button
                onClick={fetchTelemetry}
                className="cursor-pointer rounded-xs border px-3.5 py-2 text-xs font-mono transition-colors select-none bg-midnight border-dusk text-white hover:bg-night flex items-center gap-2 self-start md:self-auto"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sun" />
                <span>Refresh Telemetry</span>
              </button>
            </div>

            <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b"></div>
          </div>
        </div>
      </section>

      {/* METRICS ROW */}
      <main className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          {/* Metric 1 */}
          <div className="border border-dusk bg-night p-6 rounded-xs relative">
            <div className="relative h-2 text-stroke-3 -mt-2 mb-3">
              <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
              <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
            </div>
            <div className="text-mono-s text-dust/50 uppercase tracking-wider mb-2">
              Inscribed Folio Notes
            </div>
            <div id="folioNotesCount" className="font-heading text-4xl text-dust font-light">
              {telemetry.folioNotesCount}
            </div>
            <div className="text-[11px] font-mono text-sun mt-2 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-sun"></span>
              <span>Poseidon BN254 Leaves</span>
            </div>
          </div>

          {/* Metric 2 */}
          <div className="border border-dusk bg-night p-6 rounded-xs relative">
            <div className="relative h-2 text-stroke-3 -mt-2 mb-3">
              <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
              <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
            </div>
            <div className="text-mono-s text-dust/50 uppercase tracking-wider mb-2">
              Magistrate ASP Active Roots
            </div>
            <div id="aspApprovedCount" className="font-heading text-4xl text-dust font-light">
              {telemetry.aspApprovedCount}
            </div>
            <div className="text-[11px] font-mono text-emerald-400 mt-2 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400"></span>
              <span>Sliding Window: 16 roots</span>
            </div>
          </div>

          {/* Metric 3 */}
          <div className="border border-dusk bg-night p-6 rounded-xs relative">
            <div className="relative h-2 text-stroke-3 -mt-2 mb-3">
              <div className="absolute size-2.5 border-current top-0 left-0 border-t border-l"></div>
              <div className="absolute size-2.5 border-current top-0 right-0 border-t border-r"></div>
            </div>
            <div className="text-mono-s text-dust/50 uppercase tracking-wider mb-2">
              Pool Balance (TVL)
            </div>
            <div className="font-heading text-4xl text-dust font-light">
              <span id="poolBalance">{telemetry.poolBalance}</span> ETH
            </div>
            <div className="text-[11px] font-mono text-sun mt-2 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-sun"></span>
              <span>Robinhood Orbit L2</span>
            </div>
          </div>
        </div>

        {/* WAX SEAL (NULLIFIER) VERIFIER PANEL */}
        <div className="border border-dusk bg-night p-6 sm:p-10 rounded-xs relative">
          <div className="bracket-x h-3 md:h-4 text-stroke-3 border-t -mt-6 sm:-mt-10 mb-6"></div>

          <div className="border-b border-dusk/60 pb-6 mb-8">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-sun" />
              <h2 className="text-heading-28 text-dust">
                Wax Seal (Nullifier) Verifier
              </h2>
            </div>
            <p className="text-body-16-light text-dust/70 mt-1 max-w-[42rem]">
              In the MARGINALIA protocol, nullifiers act as digital wax seals. Enter a nullifier hash to verify whether it has already been consumed on-chain or remains intact in the unspent set.
            </p>
          </div>

          <form onSubmit={handleNullifierSubmit} className="space-y-4 max-w-[48rem]">
            <div>
              <label className="block text-mono-s text-dust/80 uppercase mb-2">
                Nullifier Hash (Decimal or Hex)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="nullifierHashInput"
                  type="text"
                  placeholder="Enter nullifier hash (e.g. 999888...)..."
                  value={nullifierInput}
                  onChange={(e) => setNullifierInput(e.target.value)}
                  className="flex-1 bg-[#14100e] border border-dusk rounded-xs px-4 py-3 text-sm font-mono text-dust focus:outline-none focus:border-sun transition-colors placeholder:text-dust/30"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="cursor-pointer rounded-xs border px-6 py-3 text-xs font-mono transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isVerifying ? "Querying State..." : "Verify Wax Seal"}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Verification Result Badge & Card */}
          {sealResult && (
            <div id="sealCheckResult" className="mt-8 p-6 rounded-xs bg-[#14100e] border border-dusk max-w-[48rem]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-[10px] font-mono text-dust/50 uppercase mb-1.5">Status on Robinhood Chain</div>
                  <div
                    id="sealStatusBadge"
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xs text-xs font-mono font-semibold border ${
                      sealResult.isSpent
                        ? "bg-rose-950/80 text-rose-300 border-rose-500/40"
                        : "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                    }`}
                  >
                    {sealResult.isSpent ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>{sealResult.statusText}</span>
                  </div>
                </div>

                <div className="text-xs font-mono text-dust/40">
                  Checked at: {sealResult.checkedAt}
                </div>
              </div>

              <div className="text-xs font-mono text-dust/80 break-all bg-[#0c0908] p-3.5 rounded-xs border border-dusk/60">
                Hash: {sealResult.nullifier}
              </div>
            </div>
          )}

          <div className="bracket-x h-3 md:h-4 text-stroke-3 border-b -mb-6 sm:-mb-10 mt-8"></div>
        </div>
      </main>
    </div>
  );
}
