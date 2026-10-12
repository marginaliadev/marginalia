"use client";

// Pool page for the UNMODIFIED 0xbow core (migration plan step M3). It uses the upstream circuits and keys (pinned by SHA-256, bow-zk.ts), the
// Entrypoint for deposits, the Courier (/api/relay/bow) or the wallet itself for withdrawals, and ragequit. Secrets never leave the browser:
// a deposit secret is journalled BEFORE the transaction is sent, notes live in an encrypted vault, and the roots the server reports are
// recomputed here and compared with the chain before any proof is built.
import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import { CHAIN } from "@/lib/chain";
import { NATIVE_ASSET, bowClientConfig } from "@/lib/bow-config";
import { leanRoot } from "@/lib/bow-tree";
import {
  bowCommitment, bowNullifierHash, buildBowWithdrawInput, newBowSecrets, parseBowNote, proveBowRagequit, proveBowWithdrawal, randomField,
  serializeBowNote, withdrawalContext, type BowNote,
} from "@/lib/bow-zk";
import { encodeRelayData } from "@/lib/bow-relay";
import { decryptVaultData, deriveVaultKey, encryptVaultData, type VaultNote } from "@/lib/client-vault";

const CFG = bowClientConfig();
const VAULT_STORAGE = `marginalia.bow.vault.v1:${CFG.entrypoint.toLowerCase()}:`;
const PENDING_DEPOSIT = `marginalia.bow.pending-deposit.v1:${CFG.entrypoint.toLowerCase()}`;
const PENDING_CHANGE = `marginalia.bow.pending-change.v1:${CFG.entrypoint.toLowerCase()}`;
const hash2 = (a: bigint, b: bigint) => poseidon2([a, b]);

const ENTRY_ABI = ["function deposit(uint256 precommitment) payable returns (uint256)"];
const POOL_ABI = [
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "function withdraw((address processooor, bytes data) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) p)",
  "function ragequit((uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[4] pubSignals) p)",
  "function currentRoot() view returns (uint256)",
  "function nullifierHashes(uint256) view returns (bool)",
];
const ENTRY_VIEW_ABI = ["function latestRoot() view returns (uint256)"];
const ERROR_TEXT: Record<string, string> = {
  NullifierAlreadySpent: "This note was already spent.",
  IncorrectASPRoot: "The approved list changed while you were proving. Prove again against the latest list.",
  UnknownStateRoot: "The pool state moved too far while you were proving. Refresh and prove again.",
  InvalidProof: "The proof was rejected by the verifier.",
  ContextMismatch: "The proof does not match this withdrawal (recipient, fee or pool).",
  OnlyOriginalDepositor: "Only the wallet that made the deposit can ragequit it.",
  PoolIsDead: "This pool was wound down: deposits are closed, withdrawals still work.",
  MinimumDepositAmount: "The amount is below the pool minimum.",
  RelayFeeGreaterThanMax: "The relay fee is above the pool cap.",
  InvalidProcessooor: "A direct withdrawal must be sent by the wallet named in the proof.",
  PrecommitmentAlreadyUsed: "This secret was already used. Create a new deposit.",
};
const errText = (e: any, fallback: string) => {
  const n = e?.revert?.name || e?.errorName;
  if (n && ERROR_TEXT[n]) return ERROR_TEXT[n];
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "You rejected the request in your wallet.";
  return e?.shortMessage || e?.reason || e?.message || fallback;
};

type Chain = {
  scope: bigint; minimumDeposit: bigint; maxRelayFeeBps: bigint; stateLeaves: bigint[]; stateRoot: bigint; aspRoot: bigint | null; aspLabels: bigint[];
  deposits: Record<string, { label: string; value: string; precommitment: string }>; verified: { state: boolean; asp: boolean | null };
};
type View = { id: string; note: BowNote; inState: boolean; approved: boolean; spent: boolean };
type Log = { t: string; msg: string; bad?: boolean };

export default function PoolPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const [syncMsg, setSyncMsg] = useState<string>("");
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [views, setViews] = useState<View[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const [amount, setAmount] = useState("0.01");
  const [selected, setSelected] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [mode, setMode] = useState<"courier" | "self">("courier");
  const keyRef = useRef<CryptoKey | null>(null);
  const ownerRef = useRef<string>("");

  const say = (msg: string, bad = false) => setLog((l) => [{ t: new Date().toLocaleTimeString(), msg, bad }, ...l].slice(0, 40));
  const eth = (): any => (typeof window !== "undefined" ? (window as any).ethereum : undefined);
  const readProvider = () => (eth() ? new ethers.BrowserProvider(eth()) : new ethers.JsonRpcProvider(CHAIN.rpcUrl));
  const txLink = (h: string) => `${CHAIN.explorerUrl}/tx/${h}`;

  // ---------------------------------------------------------------- wallet
  const connect = async (): Promise<ethers.JsonRpcSigner | null> => {
    if (!CFG.configured || !CHAIN.configured) { say("This deployment is not configured for the 0xbow pool: no transaction can be sent.", true); return null; }
    const e = eth();
    if (!e) { say("No wallet found. Install MetaMask or Rabby.", true); return null; }
    try {
      await e.request({ method: "eth_requestAccounts" });
      if ((await e.request({ method: "eth_chainId" })) !== CHAIN.chainIdHex) await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.chainIdHex }] });
      const s = await new ethers.BrowserProvider(e).getSigner();
      setAccount(await s.getAddress());
      return s;
    } catch (err: any) { say(errText(err, "Could not connect the wallet."), true); return null; }
  };

  // ---------------------------------------------------------------- chain state, verified in the browser
  const loadState = async () => {
    setSyncMsg("reading the pool...");
    for (let i = 0; i < 90; i++) {
      const r = await fetch("/api/bow/state", { cache: "no-store" });
      if (r.status === 202) { const j = await r.json(); setSyncMsg(`indexing the pool: block ${j.scannedUpTo} of ${j.head}`); await new Promise((x) => setTimeout(x, 1500)); continue; }
      const j = await r.json();
      if (!r.ok) { setSyncMsg(""); say(j.error || "The pool state is unavailable.", true); return null; }
      const rp = readProvider();
      const pool = new ethers.Contract(CFG.pool, POOL_ABI, rp);
      const entry = new ethers.Contract(CFG.entrypoint, ENTRY_VIEW_ABI, rp);
      const leaves: bigint[] = j.stateLeaves.map((x: string) => BigInt(x));
      const labels: bigint[] = j.aspLabels.map((x: string) => BigInt(x));
      const localState = leanRoot(leaves, hash2).root;
      const onState: bigint = await pool.currentRoot({ blockTag: j.head }); // the same block the server indexed up to
      let aspOk: boolean | null = null;
      let aspRoot: bigint | null = null;
      try {
        aspRoot = await entry.latestRoot();
        aspOk = labels.length > 0 && leanRoot(labels, hash2).root === aspRoot;
      } catch { aspRoot = null; aspOk = null; } // no root published yet
      const stateOk = localState === onState && localState === BigInt(j.stateRoot);
      const c: Chain = {
        scope: BigInt(j.scope), minimumDeposit: BigInt(j.minimumDeposit), maxRelayFeeBps: BigInt(j.maxRelayFeeBps), stateLeaves: leaves, stateRoot: onState,
        aspRoot, aspLabels: aspOk ? labels : [], deposits: j.deposits || {}, verified: { state: stateOk, asp: aspOk },
      };
      setChain(c); setSyncMsg("");
      if (!stateOk) say("The pool state reported by the server does NOT match the chain. Proving is disabled until it matches.", true);
      return c;
    }
    setSyncMsg(""); say("Still indexing the pool; try again in a minute.", true);
    return null;
  };

  // ---------------------------------------------------------------- vault
  const unlock = async (): Promise<boolean> => {
    if (keyRef.current) return true;
    const s = await connect();
    if (!s) return false;
    try {
      const owner = await s.getAddress();
      const sig = await s.signTypedData(
        { name: "MARGINALIA Vault", version: "1", chainId: CHAIN.chainId },
        { Unlock: [{ name: "purpose", type: "string" }, { name: "owner", type: "address" }] },
        { purpose: "Derive the key that encrypts my MARGINALIA note vault. Gas-free.", owner },
      );
      const key = await deriveVaultKey(sig);
      const blob = localStorage.getItem(VAULT_STORAGE + owner.toLowerCase());
      const list = blob ? await decryptVaultData(blob, key) : [];
      keyRef.current = key; ownerRef.current = owner; setNotes(list);
      say(`Vault unlocked (${list.length} note${list.length === 1 ? "" : "s"}).`);
      return true;
    } catch (err: any) { say(errText(err, "Could not unlock the vault."), true); return false; }
  };
  const persist = async (list: VaultNote[]) => {
    if (!keyRef.current) throw new Error("vault is locked");
    localStorage.setItem(VAULT_STORAGE + ownerRef.current.toLowerCase(), await encryptVaultData(list, keyRef.current));
    setNotes(list);
  };
  const addNote = async (n: BowNote) => {
    const entry: VaultNote = { id: n.commitment.toString(), commitment: n.commitment.toString(), valueEth: ethers.formatEther(n.value), timestamp: new Date().toISOString(), noteString: serializeBowNote(n) };
    await persist([entry, ...notes.filter((x) => x.id !== entry.id)]);
  };

  // ---------------------------------------------------------------- views of the notes against the chain
  useEffect(() => {
    (async () => {
      if (!chain) { setViews([]); return; }
      const pool = new ethers.Contract(CFG.pool, POOL_ABI, readProvider());
      const labels = new Set(chain.aspLabels.map(String));
      const inState = new Set(chain.stateLeaves.map(String));
      const out: View[] = [];
      for (const v of notes) {
        try {
          const n = parseBowNote(v.noteString);
          out.push({ id: v.id, note: n, inState: inState.has(n.commitment.toString()), approved: labels.has(n.label.toString()), spent: await pool.nullifierHashes(bowNullifierHash(n.nullifier)) });
        } catch { /* an unreadable entry is shown by the vault count, not here */ }
      }
      setViews(out);
    })();
  }, [chain, notes]);

  // recover an interrupted deposit or change note once the chain state is known
  useEffect(() => {
    (async () => {
      if (!chain || !keyRef.current) return;
      try {
        const p = localStorage.getItem(PENDING_DEPOSIT);
        if (p) {
          const o = JSON.parse(p);
          const pre = poseidon2([BigInt(o.nullifier), BigInt(o.secret)]).toString();
          const hit = Object.entries(chain.deposits).find(([, d]) => d.precommitment === pre);
          if (hit) {
            const n: BowNote = { chainId: CHAIN.chainId, asset: NATIVE_ASSET, scope: chain.scope, value: BigInt(hit[1].value), label: BigInt(hit[1].label), nullifier: BigInt(o.nullifier), secret: BigInt(o.secret), precommitment: BigInt(pre), commitment: BigInt(hit[0]) };
            await addNote(n); localStorage.removeItem(PENDING_DEPOSIT); say("Recovered an interrupted deposit into your vault.");
          } else if (Date.now() - Number(o.at) > 24 * 3600 * 1000) localStorage.removeItem(PENDING_DEPOSIT);
        }
        const c = localStorage.getItem(PENDING_CHANGE);
        if (c) {
          const o = JSON.parse(c);
          const cm = bowCommitment(BigInt(o.value), BigInt(o.label), BigInt(o.nullifier), BigInt(o.secret));
          if (chain.stateLeaves.some((l) => l === cm)) {
            const n: BowNote = { chainId: CHAIN.chainId, asset: NATIVE_ASSET, scope: chain.scope, value: BigInt(o.value), label: BigInt(o.label), nullifier: BigInt(o.nullifier), secret: BigInt(o.secret), precommitment: poseidon2([BigInt(o.nullifier), BigInt(o.secret)]), commitment: cm };
            await addNote(n); localStorage.removeItem(PENDING_CHANGE); say("Recovered a change note into your vault.");
          } else if (Date.now() - Number(o.at) > 24 * 3600 * 1000) localStorage.removeItem(PENDING_CHANGE);
        }
      } catch { /* ignore a corrupt journal */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, notes.length]);

  useEffect(() => { if (CFG.configured) loadState(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ---------------------------------------------------------------- actions
  const doDeposit = async () => {
    setBusy(true);
    try {
      if (!(await unlock())) return;
      const s = await connect(); if (!s) return;
      const c = chain || (await loadState()); if (!c) return;
      let value: bigint;
      try { value = ethers.parseEther(amount); } catch { say("Enter the amount in ETH.", true); return; }
      if (value < c.minimumDeposit) { say(`The minimum deposit is ${ethers.formatEther(c.minimumDeposit)} ETH.`, true); return; }
      const sec = newBowSecrets();
      localStorage.setItem(PENDING_DEPOSIT, JSON.stringify({ nullifier: sec.nullifier.toString(), secret: sec.secret.toString(), value: value.toString(), at: Date.now() }));
      say("Sending the deposit... confirm in your wallet.");
      const tx = await new ethers.Contract(CFG.entrypoint, ENTRY_ABI, s).deposit(sec.precommitment, { value });
      const rc = await tx.wait();
      const iface = new ethers.Interface(POOL_ABI);
      const ev = rc.logs.map((l: ethers.Log) => { try { return iface.parseLog(l); } catch { return null; } }).find((x: ethers.LogDescription | null) => x && x.name === "Deposited");
      if (!ev) throw new Error("Deposit mined but the pool event was not found; it will be recovered from the journal.");
      const n: BowNote = { chainId: CHAIN.chainId, asset: NATIVE_ASSET, scope: c.scope, value: ev.args._value, label: ev.args._label, nullifier: sec.nullifier, secret: sec.secret, precommitment: sec.precommitment, commitment: ev.args._commitment, block: rc.blockNumber, tx: tx.hash };
      await addNote(n); localStorage.removeItem(PENDING_DEPOSIT);
      say(`Deposited ${ethers.formatEther(n.value)} ETH. ${txLink(tx.hash)}`);
      await loadState();
    } catch (e: any) { say(errText(e, "Deposit failed."), true); } finally { setBusy(false); }
  };

  const doWithdraw = async () => {
    setBusy(true);
    try {
      const v = views.find((x) => x.id === selected);
      if (!v) { say("Choose a note.", true); return; }
      const c = await loadState(); if (!c) return;
      if (!c.verified.state) { say("The pool state is not verified: not proving.", true); return; }
      if (!v.inState) { say("This note is not in the pool state yet; wait a moment and refresh.", true); return; }
      if (v.spent) { say("This note was already spent.", true); return; }
      if (!v.approved) { say("The Magistrate has not approved this deposit yet. You can wait for the next list, or ragequit to take your funds back publicly.", true); return; }
      const s = await connect(); if (!s) return;
      let amountWei: bigint;
      try { amountWei = wAmount ? ethers.parseEther(wAmount) : v.note.value; } catch { say("Enter the amount in ETH.", true); return; }
      if (amountWei <= BigInt(0) || amountWei > v.note.value) { say("The amount must be between 0 and the note value.", true); return; }

      let withdrawal: { processooor: string; data: string };
      if (mode === "courier") {
        if (!ethers.isAddress(recipient)) { say("Enter the recipient address.", true); return; }
        const q = await (await fetch("/api/relay/bow/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: amountWei.toString() }) })).json();
        if (!q.relayerAvailable) { say(`The Courier is unavailable (${q.relayerReason || q.error || "unknown"}). Use self-relay.`, true); return; }
        if (!q.relayable) { say("This amount is too small for the Courier to be repaid within the pool cap. Use self-relay or a larger amount.", true); return; }
        const bps = BigInt(q.minRelayFeeBps) + BigInt(2); // small buffer for a gas-price move between quote and relay
        if (bps > BigInt(q.maxRelayFeeBps)) { say("The quoted fee is at the pool cap; try again later.", true); return; }
        withdrawal = { processooor: q.entrypoint, data: encodeRelayData(recipient, q.relayer, bps) };
        say(`Courier fee: ${bps} BPS (${ethers.formatEther((amountWei * bps) / BigInt(10000))} ETH).`);
      } else {
        withdrawal = { processooor: await s.getAddress(), data: "0x" };
        say("Self-relay: the funds go to your connected wallet, which is visible on-chain as the depositor's address if it is the same one.");
      }

      const newNullifier = randomField(), newSecret = randomField();
      const context = withdrawalContext(withdrawal, c.scope);
      const built = buildBowWithdrawInput({ note: v.note, stateLeaves: c.stateLeaves, aspLabels: c.aspLabels, withdrawnValue: amountWei, context, newNullifier, newSecret });
      if (built.aspRoot !== c.aspRoot) { say("The approved list changed; try again.", true); return; }
      // journal the change note BEFORE anything is sent, so it can be recovered if the tab closes
      const remaining = v.note.value - amountWei;
      if (remaining > BigInt(0)) localStorage.setItem(PENDING_CHANGE, JSON.stringify({ value: remaining.toString(), label: v.note.label.toString(), nullifier: newNullifier.toString(), secret: newSecret.toString(), at: Date.now() }));
      say("Proving in your browser... this takes a few seconds.");
      const t0 = Date.now();
      const { relayProof } = await proveBowWithdrawal(built.input);
      say(`Proof ready in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

      let hash: string;
      if (mode === "courier") {
        const r = await fetch("/api/relay/bow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ withdrawal, proof: relayProof, scope: c.scope.toString() }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "The Courier refused the request.");
        hash = j.txHash;
      } else {
        const p = { pA: relayProof.pA.map(BigInt), pB: relayProof.pB.map((r2: string[]) => r2.map(BigInt)), pC: relayProof.pC.map(BigInt), pubSignals: relayProof.pubSignals.map(BigInt) };
        const tx = await new ethers.Contract(CFG.pool, POOL_ABI, s).withdraw(withdrawal, p);
        await tx.wait(); hash = tx.hash;
      }
      say(`Withdrawn ${ethers.formatEther(amountWei)} ETH. ${txLink(hash)}`);
      if (remaining > BigInt(0)) {
        const change: BowNote = { ...v.note, value: remaining, nullifier: newNullifier, secret: newSecret, precommitment: poseidon2([newNullifier, newSecret]), commitment: bowCommitment(remaining, v.note.label, newNullifier, newSecret), block: undefined, tx: hash };
        await addNote(change); localStorage.removeItem(PENDING_CHANGE);
        say(`A change note of ${ethers.formatEther(remaining)} ETH was saved to your vault.`);
      }
      await loadState();
    } catch (e: any) { say(errText(e, "Withdrawal failed."), true); } finally { setBusy(false); }
  };

  const doRagequit = async () => {
    setBusy(true);
    try {
      const v = views.find((x) => x.id === selected);
      if (!v) { say("Choose a note.", true); return; }
      if (v.spent) { say("This note was already spent.", true); return; }
      const s = await connect(); if (!s) return;
      say("Proving in your browser...");
      const { ragequitProof } = await proveBowRagequit(v.note);
      const p = { pA: ragequitProof.pA.map(BigInt), pB: ragequitProof.pB.map((r2: string[]) => r2.map(BigInt)), pC: ragequitProof.pC.map(BigInt), pubSignals: ragequitProof.pubSignals.map(BigInt) };
      const tx = await new ethers.Contract(CFG.pool, POOL_ABI, s).ragequit(p);
      await tx.wait();
      say(`Ragequit done: ${ethers.formatEther(v.note.value)} ETH returned to the depositing wallet. This link between your deposit and your wallet is public. ${txLink(tx.hash)}`);
      await loadState();
    } catch (e: any) { say(errText(e, "Ragequit failed."), true); } finally { setBusy(false); }
  };

  // ---------------------------------------------------------------- view
  const box = "border border-dusk bg-night p-5 rounded-xs";
  const btn = "px-4 py-2 border border-sun text-sun hover:bg-sun hover:text-night disabled:opacity-40 text-sm";
  const input = "w-full bg-midnight border border-dusk px-3 py-2 text-dust text-sm font-mono";
  return (
    <div className="min-h-screen bg-[#0B0907] text-dust">
      <div className="max-w-[56rem] mx-auto px-4 sm:px-6 py-10 space-y-6">
        <h1 className="text-heading-40">Pool · 0xbow core</h1>
        <p className="text-sm text-dust/70">
          The unmodified 0xbow Privacy Pools core on {CHAIN.name}. Read this before you deposit: amounts are public, so unusual amounts can be linked;
          there is no deposit cap and no pause (the only brake is a permanent wind-down, which keeps withdrawals open); ragequit returns your funds
          to the depositing wallet and publicly links the two; the entrypoint can be upgraded by the project&apos;s multisig.
        </p>
        {!CFG.configured && <div className={box} id="not-configured">This deployment has no 0xbow pool configured, so nothing can be sent from this page.</div>}

        <div className={box + " space-y-2"}>
          <div className="flex flex-wrap gap-3 items-center">
            <button id="connect" className={btn} onClick={() => connect()} disabled={busy}>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect wallet"}</button>
            <button id="unlock" className={btn} onClick={() => unlock()} disabled={busy}>Unlock vault</button>
            <button id="refresh" className={btn} onClick={() => loadState()} disabled={busy}>Refresh pool</button>
          </div>
          <div id="status" className="text-xs font-mono text-dust/70">
            {syncMsg || (chain ? `${chain.stateLeaves.length} commitments · state ${chain.verified.state ? "verified against the chain" : "NOT VERIFIED"} · approved list ${chain.verified.asp === null ? "none published yet" : chain.verified.asp ? `verified (${chain.aspLabels.length} labels)` : "NOT VERIFIED"} · min deposit ${ethers.formatEther(chain.minimumDeposit)} ETH`: "not loaded")}
          </div>
        </div>

        <div className={box + " space-y-3"}>
          <h2 className="text-heading-28">Deposit</h2>
          <input id="deposit-amount" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount in ETH" />
          <button id="deposit" className={btn} onClick={doDeposit} disabled={busy || !CFG.configured}>Deposit</button>
        </div>

        <div className={box + " space-y-3"}>
          <h2 className="text-heading-28">Your notes</h2>
          {views.length === 0 && <p className="text-sm text-dust/60">{notes.length ? "Reading the chain..." : "Unlock the vault to see your notes."}</p>}
          {views.map((v) => (
            <label key={v.id} className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="radio" name="note" checked={selected === v.id} onChange={() => setSelected(v.id)} className="mt-1" />
              <span className="font-mono">
                {ethers.formatEther(v.note.value)} ETH · {v.spent ? "spent" : !v.inState ? "not in the pool yet" : v.approved ? "approved, ready" : "waiting for approval"}
                <span className="text-dust/50"> · {v.id.slice(0, 10)}…</span>
              </span>
            </label>
          ))}
        </div>

        <div className={box + " space-y-3"}>
          <h2 className="text-heading-28">Withdraw</h2>
          <div className="flex gap-4 text-sm">
            <label><input type="radio" name="mode" checked={mode === "courier"} onChange={() => setMode("courier")} /> Courier (pays gas, takes a % fee)</label>
            <label><input type="radio" name="mode" checked={mode === "self"} onChange={() => setMode("self")} /> Self-relay (funds go to your wallet)</label>
          </div>
          <input id="withdraw-amount" className={input} value={wAmount} onChange={(e) => setWAmount(e.target.value)} placeholder="Amount in ETH (empty = the whole note)" inputMode="decimal" />
          {mode === "courier" && <input id="recipient" className={input} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient address" />}
          <button id="withdraw" className={btn} onClick={doWithdraw} disabled={busy || !selected}>Prove and withdraw</button>
          <button id="ragequit" className={btn + " ml-3"} onClick={doRagequit} disabled={busy || !selected}>Ragequit (public)</button>
        </div>

        <div className={box}>
          <h2 className="text-heading-28 mb-2">Activity</h2>
          <ul id="log" className="space-y-1 text-xs font-mono">
            {log.map((l, i) => <li key={i} className={l.bad ? "text-rose-300" : "text-dust/80"}>{l.t} · {l.msg}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
