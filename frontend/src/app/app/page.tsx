"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Shield, ArrowUpRight, ArrowDownLeft, Zap, AlertTriangle, KeyRound, Copy, Check, Terminal, ExternalLink } from "lucide-react";
import NoirModal from "@/components/NoirModal";
import { RH_TESTNET, POOL_ABI, REGISTER_ABI, POOL_EVENTS_ABI, POOL_ERROR_TEXT } from "@/lib/constants";
import { MerkleTree, DEPTH, ASP_DEPTH, newSecret, nullifierOf, recoverNote, parseNote, serializeNote, proveWithdraw, proveRagequit } from "@/lib/zk";
import { deriveVaultKey, encryptVaultData, decryptVaultData, type VaultNote } from "@/lib/client-vault";

const VAULT_STORAGE = "marginalia.vault.v1:";
// A deposit secret is written here BEFORE the tx is sent, so a closed tab / crash / reload between "mined" and
// "note shown" can never strand funds: on the next load the note is rebuilt from the secret and the Folio.
const PENDING_KEY = "marginalia.pending.v1";
const PENDING_MAX_AGE_MS = 24 * 3600 * 1000;

const errText = (err: any, fallback: string): string => {
  const name = err?.revert?.name || err?.errorName;
  if (name && POOL_ERROR_TEXT[name]) return POOL_ERROR_TEXT[name];
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return "You rejected the request in your wallet.";
  return err?.shortMessage || err?.reason || err?.message || fallback;
};

type LogLine = { time: string; msg: string; isError?: boolean };

export default function ShieldedAppPage() {
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "courier" | "ragequit" | "vault">("deposit");

  // Wallet
  const [account, setAccount] = useState<string | null>(null);

  // Live telemetry (read from the chain by /api/status)
  const [poolLeaves, setPoolLeaves] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setPoolLeaves(d?.database?.leavesCount ?? null))
      .catch(() => {});
  }, []);

  // Deposit State
  const [depositAmount, setDepositAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  const [depositTx, setDepositTx] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Withdraw State
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMode, setWithdrawMode] = useState<"wallet" | "relay">("wallet");
  const [withdrawLogs, setWithdrawLogs] = useState<LogLine[]>([]);
  const [withdrawProgress, setWithdrawProgress] = useState(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawStage, setWithdrawStage] = useState("");
  const [changeNote, setChangeNote] = useState<string | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);

  // Courier State
  const [courierQuote, setCourierQuote] = useState<{ gasPrice: string; minFee: string; courierAddr: string } | null>(null);
  const [isLoadingCourier, setIsLoadingCourier] = useState(false);

  // Ragequit State
  const [ragequitNote, setRagequitNote] = useState("");
  const [ragequitRecipient, setRagequitRecipient] = useState("");
  const [isRagequitting, setIsRagequitting] = useState(false);
  const [ragequitTx, setRagequitTx] = useState<string | null>(null);

  // Vault State
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [vaultOwner, setVaultOwner] = useState<string | null>(null);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [vaultImport, setVaultImport] = useState("");
  const [vaultStatus, setVaultStatus] = useState<Record<string, string>>({});

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
    setModalConfig({ isOpen: true, title, message, type, confirmText });
  };

  // ------------------------------------------------------------------ wallet helpers
  const getEthereum = (): any => (typeof window !== "undefined" ? (window as any).ethereum : undefined);

  /** Connect the wallet and make sure it is on Robinhood Chain Testnet. Returns a signer, or null (a modal is shown). */
  const connectWallet = async (): Promise<ethers.JsonRpcSigner | null> => {
    const eth = getEthereum();
    if (!eth) {
      showModal("Wallet Required", "Please connect your Web3 wallet (MetaMask or Rabby) to continue.", "danger", "Connect Wallet");
      return null;
    }
    try {
      await eth.request({ method: "eth_requestAccounts" });
      const chainId = await eth.request({ method: "eth_chainId" });
      if (chainId !== RH_TESTNET.chainIdHex) {
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: RH_TESTNET.chainIdHex }] });
        } catch (switchErr: any) {
          if (switchErr?.code === 4902 || /unrecognized|not added/i.test(switchErr?.message || "")) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: RH_TESTNET.chainIdHex,
                chainName: RH_TESTNET.name,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [RH_TESTNET.rpcUrl],
                blockExplorerUrls: [RH_TESTNET.explorerUrl],
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }
      const signer = await new ethers.BrowserProvider(eth).getSigner();
      setAccount(await signer.getAddress());
      return signer;
    } catch (err: any) {
      showModal("Wallet Error", err?.shortMessage || err?.message || "Could not connect to the wallet.", "danger");
      return null;
    }
  };

  const readProvider = (): ethers.Provider => {
    const eth = getEthereum();
    return eth ? new ethers.BrowserProvider(eth) : new ethers.JsonRpcProvider(RH_TESTNET.rpcUrl);
  };

  const txLink = (hash: string) => `${RH_TESTNET.explorerUrl}/tx/${hash}`;

  // ------------------------------------------------------------------ vault helpers
  const persistVault = async (key: CryptoKey, owner: string, notes: VaultNote[]) => {
    try {
      localStorage.setItem(VAULT_STORAGE + owner.toLowerCase(), await encryptVaultData(notes, key));
    } catch {}
  };

  const saveToVault = async (noteString: string, valueWei: bigint, commitment: bigint) => {
    if (!vaultKey || !vaultOwner) return false;
    const entry: VaultNote = {
      id: commitment.toString(),
      commitment: commitment.toString(),
      valueEth: ethers.formatEther(valueWei),
      timestamp: new Date().toISOString(),
      noteString,
    };
    const next = [entry, ...vaultNotes.filter((n) => n.id !== entry.id)];
    setVaultNotes(next);
    await persistVault(vaultKey, vaultOwner, next);
    return true;
  };

  const recordTx = async (txHash: string) => {
    try {
      await fetch("/api/folio/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
    } catch {}
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // ------------------------------------------------------------------ pending-deposit crash recovery
  const savePending = (p: { sk: bigint; rho: bigint; value: bigint }) => {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ sk: p.sk.toString(), rho: p.rho.toString(), value: p.value.toString(), at: Date.now() }));
    } catch {}
  };
  const clearPending = () => {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(PENDING_KEY);
      } catch {}
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        const secret = { sk: BigInt(p.sk), rho: BigInt(p.rho), value: BigInt(p.value) };
        const folio = await (await fetch("/api/folio")).json();
        if (cancelled || !Array.isArray(folio.leaves)) return;
        if (String(folio.pool).toLowerCase() !== RH_TESTNET.poolAddress.toLowerCase()) return; // server on another pool: never match leaves from it
        const note = recoverNote(secret, folio.leaves.map((l: string) => BigInt(l)), RH_TESTNET.chainId, RH_TESTNET.poolAddress);
        if (note) {
          const noteString = serializeNote(note);
          setActiveTab("deposit");
          setGeneratedNote(noteString);
          clearPending();
          showModal(
            "Pending Deposit Recovered",
            `A deposit of ${ethers.formatEther(note.value)} ETH was confirmed on-chain, but this page was closed before the note was shown.

Your note has been rebuilt below. SAVE IT NOW.`,
            "success"
          );
        } else if (Date.now() - Number(p.at || 0) > PENDING_MAX_AGE_MS) {
          clearPending(); // the tx never made it on-chain
        }
        // otherwise: tx may still be confirming; try again on the next load
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ deposit
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!getEthereum()) {
      showModal("Wallet Required", "Please connect your Web3 wallet (MetaMask or Rabby) to inscribe private commitments.", "danger", "Connect Wallet");
      return;
    }

    let value: bigint;
    try {
      value = ethers.parseEther(depositAmount.trim() || "0");
    } catch {
      value = BigInt(0);
    }
    if (value <= BigInt(0)) {
      showModal("Invalid Amount", "Please specify a valid ETH deposit amount greater than zero.", "danger");
      return;
    }

    const signer = await connectWallet();
    if (!signer) return;

    setIsDepositing(true);
    setGeneratedNote(null);
    setDepositTx(null);
    let sent = false;
    try {
      const secret = newSecret();
      // persist BEFORE sending: if anything dies after the tx is mined, the note is still recoverable
      savePending({ sk: secret.sk, rho: secret.rho, value });
      const pool = new ethers.Contract(RH_TESTNET.poolAddress, POOL_ABI, signer);
      const tx = await pool.deposit(secret.precommitment, { value });
      sent = true;
      const receipt = await tx.wait();

      const iface = new ethers.Interface(POOL_EVENTS_ABI);
      let label: bigint | null = null;
      let commitment: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== RH_TESTNET.poolAddress.toLowerCase()) continue;
        try {
          const ev = iface.parseLog(log);
          if (ev && ev.name === "Deposited") {
            label = BigInt(ev.args.label);
            commitment = BigInt(ev.args.commitment);
          }
        } catch {}
      }
      if (label === null || commitment === null) throw new Error("Deposited event not found in the receipt.");

      const noteString = serializeNote({ sk: secret.sk, rho: secret.rho, value, label, commitment });
      setGeneratedNote(noteString);
      setDepositTx(tx.hash);
      const saved = await saveToVault(noteString, value, commitment);
      clearPending();
      recordTx(tx.hash);
      showModal(
        "Deposit Inscribed",
        `${ethers.formatEther(value)} ETH was deposited on-chain.\n\nSAVE YOUR SECRET NOTE NOW. Anyone holding it can withdraw the funds, and it cannot be recovered.${saved ? "\n\nIt was also saved to your encrypted vault." : "\n\nTip: unlock the Encrypted Vault first to store notes automatically."}\n\nThe Magistrate must approve this deposit before it can be withdrawn privately (ragequit is always available).`,
        "success"
      );
    } catch (err: any) {
      // the tx was never broadcast (wallet rejection / pre-flight failure): nothing to recover
      if (!sent) clearPending();
      showModal("Deposit Failed", errText(err, "Transaction failed."), "danger");
    } finally {
      setIsDepositing(false);
    }
  };

  // ------------------------------------------------------------------ withdraw
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

    let note;
    try {
      note = parseNote(withdrawNote);
    } catch (syntaxErr: any) {
      showModal("Invalid Secret Marginal Note", syntaxErr.message, "danger", "Dismiss");
      return;
    }

    let amount = note.value;
    if (withdrawAmount.trim()) {
      try {
        amount = ethers.parseEther(withdrawAmount.trim());
      } catch {
        showModal("Invalid Amount", "Please enter a valid ETH amount, or leave it empty to withdraw the whole note.", "danger");
        return;
      }
      if (amount <= BigInt(0) || amount > note.value) {
        showModal("Invalid Amount", `The amount must be between 0 and the note value (${ethers.formatEther(note.value)} ETH).`, "danger");
        return;
      }
    }

    let signer: ethers.JsonRpcSigner | null = null;

    const t0 = Date.now();
    const log = (msg: string, isError = false) =>
      setWithdrawLogs((prev) => [...prev, { time: `${((Date.now() - t0) / 1000).toFixed(1)}s`, msg, isError }]);
    const fail = (title: string, msg: string) => {
      log(`[REJECTED] ${msg}`, true);
      showModal(title, msg, "danger", "Dismiss");
      setIsWithdrawing(false);
    };

    setIsWithdrawing(true);
    setWithdrawLogs([]);
    setChangeNote(null);
    setWithdrawTx(null);
    setWithdrawProgress(10);
    setWithdrawStage("CRYPTOGRAPHIC INTEGRITY VERIFICATION");

    try {
      log("Deconstructing marginal note: checking commitment, Wax Seal and label on-chain...");
      const vres = await fetch("/api/note/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: withdrawNote.trim() }),
      });
      const vdata = await vres.json();
      if (!vdata.valid) return fail("Note Validation Failed", vdata.error);
      log(`Note verified: Wax Seal intact (${vdata.nullifierHash.slice(0, 14)}...), value ${ethers.formatEther(note.value)} ETH.`);

      if (withdrawMode === "wallet") {
        signer = await connectWallet();
        if (!signer) {
          setIsWithdrawing(false);
          return;
        }
      }

      setWithdrawProgress(25);
      setWithdrawStage("SYNCING FOLIO TREE & ASP SET");
      const fres = await fetch("/api/folio");
      const folio = await fres.json();
      if (!fres.ok) return fail("Folio Unavailable", folio.error || "Could not load the Folio tree.");
      if (String(folio.pool).toLowerCase() !== RH_TESTNET.poolAddress.toLowerCase()) {
        return fail("Server Misconfigured", `This site's server is configured for a different pool (${folio.pool}) than the one this page uses (${RH_TESTNET.poolAddress}). Nothing was sent.`);
      }

      const stateTree = new MerkleTree(DEPTH, folio.leaves.map((l: string) => BigInt(l)));
      const aspTree = new MerkleTree(ASP_DEPTH, folio.aspLabels.map((l: string) => BigInt(l)));
      const provider = readProvider();
      const pool = new ethers.Contract(RH_TESTNET.poolAddress, POOL_ABI, provider);
      const register = new ethers.Contract(RH_TESTNET.registerAddress, REGISTER_ABI, provider);
      // Trust no server: both roots must be accepted by the contracts themselves.
      if (!(await pool.isKnownRoot(stateTree.root()))) return fail("Folio Mismatch", "The Folio tree does not match any on-chain root. Try again in a moment.");
      if (!(await register.isValidRoot(aspTree.root()))) return fail("ASP Mismatch", "The approved-label set does not match the Magistrate's published root.");
      if (stateTree.indexOf(note.commitment) < 0) return fail("Commitment Not Found", "Note is not inscribed in the Folio tree yet.");
      if (aspTree.indexOf(note.label) < 0 && folio.aspStale) {
        return fail("Approved List Updating", "The Magistrate's newest approvals are still being published to this server. Please try again in a few minutes. Nothing was sent.");
      }
      if (aspTree.indexOf(note.label) < 0) {
        return fail("Awaiting Magistrate Approval", "This deposit has not been approved by the Magistrate yet. You can wait for approval, or recover your funds via Ragequit.");
      }
      log(`Folio synced: ${folio.leaves.length} leaves, ${folio.aspLabels.length} approved labels. Roots confirmed on-chain.`);

      // build withdrawal parameters
      let w: { recipient: string; relayer: string; fee: bigint };
      if (withdrawMode === "relay") {
        const q = await (await fetch("/api/relay/quote", { method: "POST" })).json();
        if (!q.relayerAvailable) return fail("Courier Unavailable", "No relayer is configured on this deployment. Use wallet mode instead.");
        // pad the quoted minimum so a small gas-price move cannot invalidate the proof-bound fee
        const fee = (BigInt(q.minFeeWei) * BigInt(2));
        if (fee >= amount) return fail("Amount Too Small", `The courier fee (${ethers.formatEther(fee)} ETH) exceeds the withdrawal amount.`);
        w = { recipient: withdrawRecipient.trim(), relayer: q.relayer, fee };
        log(`Courier ${q.relayer.slice(0, 8)}... fee ${ethers.formatEther(fee)} ETH bound into the proof.`);
      } else {
        w = { recipient: withdrawRecipient.trim(), relayer: ethers.ZeroAddress, fee: BigInt(0) };
      }
      const context = BigInt(await pool.computeContext(w));

      setWithdrawProgress(45);
      setWithdrawStage("SYNTHESIZING GROTH16 PROOF (IN YOUR BROWSER)");
      log("Generating zero-knowledge proof locally. Your secret never leaves this page...");
      const { proof, changeNote: change } = await proveWithdraw({ note, stateTree, aspTree, withdrawnValue: amount, context });
      log("Proof generated.");

      setWithdrawProgress(80);
      let txHash: string;
      if (withdrawMode === "relay") {
        setWithdrawStage("RELAYING TO ROBINHOOD CHAIN");
        const rres = await fetch("/api/relay/withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ withdrawal: { recipient: w.recipient, relayer: w.relayer, fee: w.fee.toString() }, proof }),
        });
        const rdata = await rres.json();
        if (!rres.ok) return fail("Relay Failed", rdata.error || "The courier rejected the withdrawal.");
        txHash = rdata.txHash;
      } else {
        setWithdrawStage("SUBMITTING TRANSACTION");
        const tx = await new ethers.Contract(RH_TESTNET.poolAddress, POOL_ABI, signer!).withdraw(w, proof);
        await tx.wait();
        txHash = tx.hash;
        recordTx(txHash);
      }
      setWithdrawTx(txHash);
      log(`Confirmed on-chain: ${txHash}`);
      setWithdrawProgress(100);
      setWithdrawStage("WITHDRAWAL CONFIRMED");

      let extra = "";
      if (change.value > BigInt(0)) {
        const cs = serializeNote(change);
        setChangeNote(cs);
        const saved = await saveToVault(cs, change.value, change.commitment);
        extra = `\n\nA change note of ${ethers.formatEther(change.value)} ETH was created. SAVE IT NOW${saved ? " (also stored in your vault)" : ""}: it is the only way to spend the remainder.`;
      }
      showModal(
        "Withdrawal Confirmed",
        `${ethers.formatEther(amount - w.fee)} ETH was delivered to ${w.recipient} with a zero-knowledge proof.${extra}`,
        "success",
        "Done"
      );
      setIsWithdrawing(false);
    } catch (err: any) {
      log(err?.shortMessage || err?.message || "Unexpected error", true);
      showModal("Withdrawal Error", errText(err, "Unexpected error"), "danger");
      setIsWithdrawing(false);
    }
  };

  // ------------------------------------------------------------------ courier
  const handleFetchCourierQuote = async () => {
    setIsLoadingCourier(true);
    try {
      const res = await fetch("/api/relay/quote", { method: "POST" });
      const data = await res.json();
      setCourierQuote({
        gasPrice: `${data.gasPriceGwei} Gwei`,
        minFee: `${data.minFeeEth} ETH`,
        courierAddr: data.relayer ? `${data.relayer.slice(0, 6)}...${data.relayer.slice(-4)} (Active)` : "No relayer configured",
      });
    } catch (_) {
      showModal("Relayer Error", "Could not fetch quote from Mersenne Courier.", "danger");
    } finally {
      setIsLoadingCourier(false);
    }
  };

  // ------------------------------------------------------------------ ragequit
  const handleRagequitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragequitNote.trim() || !ragequitRecipient.trim()) {
      showModal("Missing Information", "Please provide both the secret note and recipient address.", "info");
      return;
    }
    if (!ragequitNote.trim().startsWith("marginalia-note-v1-")) {
      showModal("Invalid Secret Note", "The note payload does not have the required 'marginalia-note-v1-' prefix.", "danger");
      return;
    }
    if (!ethers.isAddress(ragequitRecipient.trim()) || ragequitRecipient.trim() === ethers.ZeroAddress) {
      showModal("Invalid Recipient Address", "Please enter a valid, non-zero Ethereum address.", "danger");
      return;
    }
    let note;
    try {
      note = parseNote(ragequitNote);
    } catch (err: any) {
      showModal("Invalid Secret Note", err.message, "danger");
      return;
    }

    const signer = await connectWallet();
    if (!signer) return;

    setIsRagequitting(true);
    setRagequitTx(null);
    try {
      const pool = new ethers.Contract(RH_TESTNET.poolAddress, POOL_ABI, signer);
      const depositor: string = await pool.labelDepositor(note.label);
      if (depositor === ethers.ZeroAddress) throw new Error("This note was never deposited into the pool.");
      if (depositor.toLowerCase() !== (await signer.getAddress()).toLowerCase()) {
        throw new Error(`Only the original depositor wallet (${depositor}) can ragequit this note. Connect that wallet.`);
      }
      if (await pool.nullifierSpent(nullifierOf(note.sk, note.rho))) {
        throw new Error("This note is already spent (withdrawn or ragequit), so there is nothing left to recover.");
      }
      const { proof } = await proveRagequit(note);
      const tx = await pool.ragequit(note.label, ragequitRecipient.trim(), proof);
      await tx.wait();
      setRagequitTx(tx.hash);
      showModal("Ragequit Complete", `The original deposit of ${ethers.formatEther(note.value)} ETH was returned to ${ragequitRecipient.trim()}.\n\nThis note is now permanently spent.`, "success");
    } catch (err: any) {
      showModal("Ragequit Failed", errText(err, "Transaction failed."), "danger");
    } finally {
      setIsRagequitting(false);
    }
  };

  // ------------------------------------------------------------------ vault
  const handleUnlockVault = async () => {
    if (!getEthereum()) {
      showModal("Wallet Required", "A connected wallet signature is required to decrypt your local notes vault using EIP-712 / WebCrypto AES-256-GCM.", "danger");
      return;
    }
    const signer = await connectWallet();
    if (!signer) return;
    try {
      const owner = await signer.getAddress();
      const signature = await signer.signTypedData(
        { name: "MARGINALIA Vault", version: "1", chainId: RH_TESTNET.chainId },
        { Unlock: [{ name: "purpose", type: "string" }, { name: "owner", type: "address" }] },
        { purpose: "Derive the key that encrypts my MARGINALIA note vault. Gas-free.", owner }
      );
      const key = await deriveVaultKey(signature);
      let notes: VaultNote[] = [];
      const blob = localStorage.getItem(VAULT_STORAGE + owner.toLowerCase());
      if (blob) notes = await decryptVaultData(blob, key);
      setVaultKey(key);
      setVaultOwner(owner);
      setVaultNotes(notes);
      showModal("Vault Unlocked", `Local encrypted vault is unlocked (${notes.length} note${notes.length === 1 ? "" : "s"}).`, "success");
    } catch (err: any) {
      showModal("Vault Error", err?.shortMessage || err?.message || "Could not unlock the vault.", "danger");
    }
  };

  const handleLockVault = () => {
    setVaultKey(null);
    setVaultOwner(null);
    setVaultNotes([]);
    setVaultStatus({});
  };

  const handleVaultImport = async () => {
    try {
      const n = parseNote(vaultImport);
      await saveToVault(serializeNote(n), n.value, n.commitment);
      setVaultImport("");
    } catch (err: any) {
      showModal("Invalid Secret Note", err.message, "danger");
    }
  };

  const handleVaultDelete = async (id: string) => {
    if (!vaultKey || !vaultOwner) return;
    const next = vaultNotes.filter((n) => n.id !== id);
    setVaultNotes(next);
    await persistVault(vaultKey, vaultOwner, next);
  };

  const handleVaultCheck = async (n: VaultNote) => {
    setVaultStatus((s) => ({ ...s, [n.id]: "checking..." }));
    try {
      const res = await fetch("/api/note/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: n.noteString }),
      });
      const d = await res.json();
      setVaultStatus((s) => ({ ...s, [n.id]: d.valid ? "UNSPENT" : res.status === 409 ? "SPENT" : d.error?.slice(0, 40) || "ERROR" }));
    } catch {
      setVaultStatus((s) => ({ ...s, [n.id]: "ERROR" }));
    }
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
                  <div className="text-[10px] font-mono uppercase text-dust/50">Folio Tree</div>
                  <div className="text-sm font-mono font-semibold text-emerald-400 mt-0.5">{poolLeaves === null ? "..." : `${poolLeaves} Leaves On-Chain`}</div>
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

              <button
                id="submitDepositBtn"
                type="submit"
                disabled={isDepositing}
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center justify-center gap-2 text-sm mt-4"
              >
                <Shield className="w-4 h-4" />
                <span>{isDepositing ? "Waiting for wallet / confirmation..." : "Inscribe Secret Note & Deposit ETH"}</span>
              </button>

              {generatedNote && (
                <div id="depositResult" className="mt-6 bg-[#0c0908] border border-sun/40 rounded-xs p-5 space-y-3">
                  <div className="text-mono-s text-sun uppercase tracking-wider">Your Secret Marginal Note (save it now)</div>
                  <textarea
                    id="generatedNote"
                    readOnly
                    rows={4}
                    value={generatedNote}
                    className="w-full bg-[#14100e] border border-dusk rounded-xs p-3 text-xs font-mono text-dust resize-none"
                  />
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <button type="button" onClick={() => copyText(generatedNote)} className="inline-flex items-center gap-1.5 text-sun hover:text-dust cursor-pointer">
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copied" : "Copy note"}</span>
                    </button>
                    {depositTx && (
                      <a href={txLink(depositTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-dust/70 hover:text-dust">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View transaction</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-mono-s text-dust/80 uppercase mb-2">
                    Amount (ETH, optional)
                  </label>
                  <input
                    id="withdrawAmount"
                    type="text"
                    placeholder="Full note value"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-[#14100e] border border-dusk rounded-xs px-4 py-3.5 text-sm font-mono text-dust focus:outline-none focus:border-sun transition-colors placeholder:text-dust/30"
                  />
                </div>
                <div>
                  <label className="block text-mono-s text-dust/80 uppercase mb-2">
                    Submit Via
                  </label>
                  <select
                    id="withdrawMode"
                    value={withdrawMode}
                    onChange={(e) => setWithdrawMode(e.target.value as "wallet" | "relay")}
                    className="w-full bg-[#14100e] border border-dusk rounded-xs px-4 py-3.5 text-sm font-mono text-dust focus:outline-none focus:border-sun transition-colors"
                  >
                    <option value="wallet">My wallet (pays gas, less private)</option>
                    <option value="relay">Mersenne Courier (gasless, fee deducted)</option>
                  </select>
                </div>
              </div>

              <button
                id="submitWithdrawBtn"
                type="submit"
                disabled={isWithdrawing}
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-dust border-dust text-night hover:bg-sand flex items-center justify-center gap-2 text-sm mt-4 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{isWithdrawing ? "Working..." : "Prove & Withdraw Privately"}</span>
              </button>

              {(withdrawTx || changeNote) && (
                <div id="withdrawResult" className="bg-[#0c0908] border border-sun/40 rounded-xs p-5 space-y-3">
                  {withdrawTx && (
                    <a href={txLink(withdrawTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-mono text-sun hover:text-dust">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Withdrawal tx {withdrawTx.slice(0, 12)}...</span>
                    </a>
                  )}
                  {changeNote && (
                    <>
                      <div className="text-mono-s text-sun uppercase tracking-wider">Change note (save it now)</div>
                      <textarea id="changeNote" readOnly rows={4} value={changeNote} className="w-full bg-[#14100e] border border-dusk rounded-xs p-3 text-xs font-mono text-dust resize-none" />
                      <button type="button" onClick={() => copyText(changeNote)} className="inline-flex items-center gap-1.5 text-xs font-mono text-sun hover:text-dust cursor-pointer">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? "Copied" : "Copy change note"}</span>
                      </button>
                    </>
                  )}
                </div>
              )}

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
                  If the Magistrate never approves your deposit, or you simply change your mind, the original depositor wallet can recover the original deposit publicly. A small ragequit proof shows you own the note without revealing your secret.
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
                disabled={isRagequitting}
                className="w-full cursor-pointer rounded-xs border px-4 py-3.5 text-center font-medium transition-colors select-none bg-rose-900/90 border-rose-500/50 text-white hover:bg-rose-800 flex items-center justify-center gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{isRagequitting ? "Proving & submitting..." : "Execute Emergency Ragequit"}</span>
              </button>
              {ragequitTx && (
                <a href={txLink(ragequitTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-mono text-rose-300 hover:text-dust">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ragequit tx {ragequitTx.slice(0, 12)}...</span>
                </a>
              )}
            </form>
          )}

          {/* TAB 5: VAULT */}
          {activeTab === "vault" && (
            <div className="space-y-6 max-w-[42rem]">
              <div className="pb-4 border-b border-dusk/60">
                <div className="text-mono-s text-sun uppercase tracking-wider mb-1">WebCrypto AES-256-GCM</div>
                <h2 className="text-heading-28 text-dust">Encrypted Client-Side Note Vault</h2>
                <p className="text-body-16-light text-dust/70 mt-1">
                  Your marginal notes are encrypted directly in your browser (AES-256-GCM), accessible only via your wallet&apos;s gas-free EIP-712 signature. They never leave this device.
                </p>
              </div>

              {!vaultKey ? (
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
              ) : (
                <div id="vaultUnlocked" className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-400">Unlocked · {vaultOwner?.slice(0, 6)}...{vaultOwner?.slice(-4)} · {vaultNotes.length} note(s)</span>
                    <button onClick={handleLockVault} className="text-dust/70 hover:text-dust cursor-pointer">Lock</button>
                  </div>

                  {vaultNotes.length === 0 && (
                    <div className="bg-[#14100e] border border-dusk rounded-xs p-6 text-xs text-dust/60 text-center">
                      No notes yet. Notes from deposits and change are stored here automatically.
                    </div>
                  )}

                  {vaultNotes.map((n) => (
                    <div key={n.id} className="bg-[#14100e] border border-dusk rounded-xs p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-sun">{n.valueEth} ETH</span>
                        <span className="text-dust/50">{new Date(n.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-[11px] font-mono text-dust/60 truncate">{n.noteString}</div>
                      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
                        <button onClick={() => copyText(n.noteString)} className="text-sun hover:text-dust cursor-pointer">Copy</button>
                        <button onClick={() => { setWithdrawNote(n.noteString); setRagequitNote(n.noteString); setActiveTab("withdraw"); }} className="text-sun hover:text-dust cursor-pointer">Use to withdraw</button>
                        <button onClick={() => handleVaultCheck(n)} className="text-sun hover:text-dust cursor-pointer">Check status</button>
                        <button onClick={() => handleVaultDelete(n.id)} className="text-rose-400 hover:text-rose-300 cursor-pointer">Delete</button>
                        {vaultStatus[n.id] && <span className="text-dust/80">{vaultStatus[n.id]}</span>}
                      </div>
                    </div>
                  ))}

                  <div className="space-y-2 pt-2">
                    <textarea
                      id="vaultImport"
                      rows={2}
                      placeholder="Import a note: marginalia-note-v1-..."
                      value={vaultImport}
                      onChange={(e) => setVaultImport(e.target.value)}
                      className="w-full bg-[#14100e] border border-dusk rounded-xs p-3 text-xs font-mono text-dust focus:outline-none focus:border-sun resize-none placeholder:text-dust/30"
                    />
                    <button onClick={handleVaultImport} className="cursor-pointer rounded-xs border px-4 py-2 text-xs font-mono bg-dust border-dust text-night hover:bg-sand">Import note</button>
                  </div>
                </div>
              )}
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
