"use client";

// Public status of the Phase-2 trusted-setup ceremony (plan B1, task E3).
// Data: /ceremony/status.json, written by `node scripts/ceremony/coordinator.js publish` (contacts are never exported).
// Nothing on this page is trusted by itself: every hash shown here is checkable with docs/ceremony/VERIFY.md.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck, Timer } from "lucide-react";

type Slot = { slot: number; name: string; status: "pending" | "done" | "rejected" | "skipped" };
type Round = { index: number; contributor: string; contributionHash: string; sha256: string; blake2b: string; attestation: string | null; receivedAt: string };
type Circuit = {
  circuit: string;
  startedAt: string;
  zkey0Blake2b: string;
  accepted: number;
  lastGood: string;
  slots: Slot[];
  rounds: Round[];
  sealed: null | {
    finalZkeyBlake2b: string | null;
    vkeyHash: string;
    verifierHash: string;
    contractName: string;
    beacon: { hash: string; source: string; iterationsExp: number };
  };
};
type Status = {
  schema: number;
  updatedAt: string;
  phase: "recruiting" | "started" | "contributing" | "sealed";
  minContributors: number;
  window: string | null;
  beacon: null | { source?: string; chain?: string; round?: number; expectedAt?: string; iterationsExp?: number; announcement?: string };
  phase1: null | { file: string; blake2b: string | null; sizeBytes: number | null; status: string | null; sources: { name: string; url: string; checkedOn: string }[] };
  circuits: Circuit[];
};

const REPO = "https://github.com/marginaliadev/marginalia";
const PHASES: { key: Status["phase"]; label: string }[] = [
  { key: "recruiting", label: "Recruiting" },
  { key: "started", label: "Chain opened" },
  { key: "contributing", label: "Contributions" },
  { key: "sealed", label: "Beacon + sealed" },
];

// Links come from a JSON file edited by the coordinator: only plain https URLs are ever rendered as links.
const safeHttpUrl = (u: string | null | undefined): string | null => {
  try {
    const x = new URL(String(u));
    return x.protocol === "https:" ? x.href : null;
  } catch {
    return null;
  }
};

const short = (h: string | null | undefined, n = 10) => (!h ? "—" : h.length <= 2 * n + 1 ? h : `${h.slice(0, n)}…${h.slice(-n)}`);
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "—";

function CopyHash({ value, n = 10 }: { value: string | null | undefined; n?: number }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="text-stroke-2">—</span>;
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="group inline-flex items-center gap-1.5 font-mono-code text-[12px] text-dust/85 hover:text-sun transition-colors"
    >
      <span className="break-all text-left">{short(value, n)}</span>
      {done ? <Check className="size-3.5 shrink-0 text-sun" /> : <Copy className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100" />}
    </button>
  );
}

const STATUS_STYLE: Record<Slot["status"], string> = {
  done: "text-[#9bd59b] border-[#2f4a2f] bg-[#142014]",
  pending: "text-dust/70 border-[#2b221a] bg-[#14100e]",
  rejected: "text-[#f29b8f] border-[#4a2a26] bg-[#201311]",
  skipped: "text-stroke-2 border-[#2b221a] bg-[#14100e]",
};

function Countdown({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(at).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return <span>published (round time passed)</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return <span className="tabular-nums">{d > 0 ? `${d}d ` : ""}{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}</span>;
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#2b221a] py-10 md:py-14">
      <div className="text-mono-s uppercase tracking-wider text-sun mb-2">{eyebrow}</div>
      <h2 className="text-heading-28 font-light text-dust mb-6">{title}</h2>
      {children}
    </section>
  );
}

function CircuitBlock({ c, min }: { c: Circuit; min: number }) {
  const pct = Math.min(100, Math.round((c.accepted / Math.max(1, min)) * 100));
  return (
    <div className="min-w-0 rounded-xs border border-[#2b221a] bg-[#100c0a]">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#2b221a] px-4 py-4 sm:px-5">
        <div>
          <div className="font-mono-code text-[12px] uppercase tracking-[0.08em] text-stroke-2">circuit</div>
          <div className="text-heading-28 font-light text-dust">{c.circuit}</div>
        </div>
        <div className="text-right">
          <div className="text-heading-28 font-light text-dust tabular-nums">
            {c.accepted}
            <span className="text-stroke-2"> / {min}</span>
          </div>
          <div className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">accepted · minimum</div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1f1915]" aria-label={`${c.accepted} of ${min} contributions`}>
          <div className="h-full bg-sun transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">
            <tr className="border-b border-[#2b221a]">
              <th className="px-4 py-3 font-normal sm:px-5">#</th>
              <th className="px-4 py-3 font-normal">Contributor</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal">Contribution hash</th>
              <th className="px-4 py-3 font-normal">Attestation</th>
            </tr>
          </thead>
          <tbody>
            {c.slots.map((s) => {
              const r = c.rounds.find((x) => x.contributor.toLowerCase() === s.name.toLowerCase());
              return (
                <tr key={s.slot} className="border-b border-[#1d1814] last:border-0">
                  <td className="px-4 py-3 font-mono-code text-stroke-2 sm:px-5">{r ? r.index : "·"}</td>
                  <td className="px-4 py-3 text-dust">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 font-mono-code text-[11px] uppercase tracking-[0.06em] ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">{r ? <CopyHash value={r.contributionHash} n={8} /> : <span className="text-stroke-3">—</span>}</td>
                  <td className="px-4 py-3">
                    {safeHttpUrl(r?.attestation) ? (
                      <a href={safeHttpUrl(r?.attestation)!} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-dust/80 hover:text-sun">
                        post <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <span className="text-stroke-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="grid gap-x-6 gap-y-3 border-t border-[#2b221a] px-4 py-4 text-[13px] sm:grid-cols-2 sm:px-5">
        <div>
          <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">zkey #0 (blake2b)</dt>
          <dd><CopyHash value={c.zkey0Blake2b} /></dd>
        </div>
        <div>
          <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">latest accepted file</dt>
          <dd className="font-mono-code text-[12px] text-dust/85">{c.lastGood}</dd>
        </div>
        {c.sealed && (
          <>
            <div>
              <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">final.zkey (blake2b)</dt>
              <dd><CopyHash value={c.sealed.finalZkeyBlake2b} /></dd>
            </div>
            <div>
              <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">{c.sealed.contractName}.sol hash</dt>
              <dd><CopyHash value={c.sealed.verifierHash} /></dd>
            </div>
            <div>
              <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">verification key hash</dt>
              <dd><CopyHash value={c.sealed.vkeyHash} /></dd>
            </div>
            <div>
              <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">beacon applied</dt>
              <dd className="text-dust/85">
                {c.sealed.beacon.source} · 2^{c.sealed.beacon.iterationsExp} · <CopyHash value={c.sealed.beacon.hash} n={6} />
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}

export default function CeremonyPage() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/ceremony/status.json", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`status ${r.status}`);
          return r.json();
        })
        .then((j: Status) => alive && (setData(j), setError(null)))
        .catch((e: Error) => alive && setError(e.message));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const phaseIdx = data ? PHASES.findIndex((p) => p.key === data.phase) : -1;

  return (
    <div className="min-h-screen bg-[#0B0907] text-white">
      <div className="mx-auto max-w-[80rem] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {/* HERO */}
        <header className="py-8 lg:py-12">
          <div className="mb-3 flex items-center gap-x-2 text-mono-s uppercase tracking-wider text-sun">
            <span className="size-1.5 rounded-full bg-sun animate-pulse" />
            <span>Phase-2 trusted setup · B1</span>
          </div>
          <h1 className="text-heading-56 font-light text-dust text-pretty max-w-[46rem]">The proving key is only as honest as its most honest contributor</h1>
          <p className="text-body-18-light mt-4 max-w-[40rem] text-dust/80">
            Before mainnet, independent people each add secret randomness to the <span className="font-mono-code text-[15px]">withdraw</span> and{" "}
            <span className="font-mono-code text-[15px]">ragequit</span> proving keys, then discard it. If even one of them is honest, nobody can forge a
            proof. Every hash on this page can be checked without trusting us.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`${REPO}/blob/main/docs/ceremony/VERIFY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xs border border-dust bg-dust px-4 py-2.5 text-sm font-medium text-night transition-colors hover:bg-sand"
            >
              <ShieldCheck className="size-4" /> Verify it yourself
            </a>
            <a
              href={`${REPO}/blob/main/docs/ceremony_guide.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xs border border-stroke-3 px-4 py-2.5 text-sm font-medium text-dust transition-colors hover:border-sun hover:text-sun"
            >
              Contributor guide <ExternalLink className="size-4" />
            </a>
          </div>
        </header>

        {error && !data && (
          <div className="rounded-xs border border-[#4a2a26] bg-[#201311] px-4 py-3 text-sm text-[#f29b8f]">Ceremony status is unavailable right now ({error}).</div>
        )}

        {data && (
          <>
            {/* PHASE TRACK */}
            <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xs border border-[#2b221a] bg-[#2b221a] sm:grid-cols-4">
              {PHASES.map((p, i) => {
                const state = i < phaseIdx ? "done" : i === phaseIdx ? "now" : "next";
                return (
                  <li key={p.key} className={`px-4 py-4 ${state === "now" ? "bg-[#1a120c]" : "bg-[#100c0a]"}`}>
                    <div className={`font-mono-code text-[11px] uppercase tracking-[0.08em] ${state === "now" ? "text-sun" : "text-stroke-2"}`}>
                      {String(i + 1).padStart(2, "0")} · {state === "done" ? "done" : state === "now" ? "now" : "next"}
                    </div>
                    <div className={`mt-1 text-[15px] ${state === "next" ? "text-dust/50" : "text-dust"}`}>{p.label}</div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">
              updated {fmtDate(data.updatedAt)}
              {data.window ? ` · window ${data.window}` : ""} · minimum {data.minContributors} independent contributors per circuit
            </p>

            {/* CONTRIBUTIONS */}
            <Section eyebrow="Contributions" title={data.circuits.length ? "Chain of contributions" : "Contributor slots open soon"}>
              {data.circuits.length === 0 ? (
                <p className="max-w-[40rem] text-body-16-light text-dust/75">
                  The ceremony starts only after the external audit is fixed and the circuits are frozen, so a later change cannot void it. We are recruiting
                  contributors now: about 45 minutes, once, on a machine you trust. Write to us on{" "}
                  <a href="https://x.com/MarginaliaZK" target="_blank" rel="noopener noreferrer" className="text-sun hover:underline">X @MarginaliaZK</a> to take a slot.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {data.circuits.map((c) => (
                    <CircuitBlock key={c.circuit} c={c} min={data.minContributors} />
                  ))}
                </div>
              )}
            </Section>

            {/* BEACON */}
            <Section eyebrow="Random beacon" title="Public randomness, announced in advance">
              {data.beacon ? (
                <dl className="grid gap-4 rounded-xs border border-[#2b221a] bg-[#100c0a] p-4 text-[14px] sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
                  <div>
                    <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">source</dt>
                    <dd className="text-dust">{data.beacon.source || "drand"}{data.beacon.chain ? ` · ${data.beacon.chain}` : ""}</dd>
                  </div>
                  <div>
                    <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">round</dt>
                    <dd className="font-mono-code text-dust">{data.beacon.round ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">iterations</dt>
                    <dd className="font-mono-code text-dust">2^{data.beacon.iterationsExp ?? 10}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2"><Timer className="size-3.5" /> expected</dt>
                    <dd className="text-dust">{data.beacon.expectedAt ? <><span>{fmtDate(data.beacon.expectedAt)}</span><br /><span className="text-sun"><Countdown at={data.beacon.expectedAt} /></span></> : "—"}</dd>
                  </div>
                  {safeHttpUrl(data.beacon.announcement) && (
                    <div className="sm:col-span-2 lg:col-span-4">
                      <a href={safeHttpUrl(data.beacon.announcement)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-dust/80 hover:text-sun">
                        announcement <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="max-w-[40rem] text-body-16-light text-dust/75">
                  Not announced yet. One week before the first slot we publish the exact drand round, which is issued only after the last contributor submits.
                  That stops the final contributor from choosing their randomness after seeing everyone else&apos;s.
                </p>
              )}
            </Section>

            {/* PHASE 1 */}
            {data.phase1 && (
              <Section eyebrow="Phase 1" title="Powers of Tau file we build on">
                <div className="rounded-xs border border-[#2b221a] bg-[#100c0a] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono-code text-[13px] text-dust">{data.phase1.file}</span>
                    {data.phase1.status && (
                      <span className={`rounded-full border px-2.5 py-0.5 font-mono-code text-[11px] uppercase tracking-[0.06em] ${data.phase1.status === "VERIFIED" ? STATUS_STYLE.done : STATUS_STYLE.pending}`}>
                        {data.phase1.status}
                      </span>
                    )}
                    {data.phase1.sizeBytes && <span className="font-mono-code text-[12px] text-stroke-2">{data.phase1.sizeBytes.toLocaleString("en-US")} bytes</span>}
                  </div>
                  <div className="mt-3 font-mono-code text-[11px] uppercase tracking-[0.08em] text-stroke-2">blake2b-512</div>
                  <p className="mt-1 break-all font-mono-code text-[12px] text-dust/85">{data.phase1.blake2b || "not pinned"}</p>
                  {data.phase1.sources.length > 0 && (
                    <ul className="mt-4 space-y-1 text-[13px]">
                      {data.phase1.sources.filter((s) => safeHttpUrl(s.url)).map((s) => (
                        <li key={s.url}>
                          <a href={safeHttpUrl(s.url)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-dust/80 hover:text-sun">
                            {s.name} <ExternalLink className="size-3.5" />
                          </a>
                          <span className="text-stroke-2"> · checked {s.checkedOn}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
