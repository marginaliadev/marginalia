import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { POOL_ABI } from "@/lib/constants";
import { leavesFromTx, makeProvider, persistLeaves, poolAddress } from "@/lib/folio";
import { rateLimited } from "@/lib/ratelimit";
import { feeAcceptable, feeWithinShare, minFeeFor, recordGasSample, relayerHealth, serialized, warmGasSamples } from "@/lib/relayer-health";
import { feeCoversCost, requiredFee } from "@/lib/gas-estimator";
import { createClient } from "@supabase/supabase-js";

/** Best effort: record the relay (cost vs fee) in relayer_jobs. Needs the service-role key; falls back to the base columns if the Fase 03 migration is not applied yet. */
async function persistRelay(j: { recipient: string; relayer: string; fee: bigint; nullifier: string; txHash: string; gasEstimate: bigint; gasUsed: bigint; gasCost: bigint; net: bigint }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const base = { recipient: j.recipient.toLowerCase(), relayer_address: j.relayer.toLowerCase(), fee: j.fee.toString(), nullifier_hash: j.nullifier, status: "CONFIRMED", tx_hash: j.txHash, gas_used: j.gasUsed.toString() };
    const full = { ...base, gas_estimate: j.gasEstimate.toString(), gas_cost_wei: j.gasCost.toString(), fee_wei: j.fee.toString(), net_wei: j.net.toString() };
    const { error } = await db.from("relayer_jobs").insert(full);
    if (error) await db.from("relayer_jobs").insert(base);
  } catch {}
}

const isUint = (v: unknown) => (typeof v === "string" || typeof v === "number") && /^\d{1,78}$/.test(String(v));

// Mersenne Courier: pays gas for a withdrawal and is repaid by the proof-bound fee.
export async function POST(req: Request) {
  if (rateLimited(req, "relay", 10)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) return NextResponse.json({ error: "Relayer not configured" }, { status: 503 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const { withdrawal, proof } = body || {};
  if (
    !withdrawal || !proof ||
    !ethers.isAddress(withdrawal.recipient) || withdrawal.recipient === ethers.ZeroAddress ||
    !ethers.isAddress(withdrawal.relayer) ||
    !isUint(withdrawal.fee) ||
    !Array.isArray(proof.pA) || !Array.isArray(proof.pB) || !Array.isArray(proof.pC) ||
    !Array.isArray(proof.pubSignals) || proof.pubSignals.length !== 6 || !proof.pubSignals.every(isUint)
  ) {
    return NextResponse.json({ error: "Malformed withdrawal or proof payload" }, { status: 400 });
  }

  try {
    const provider = makeProvider();
    const wallet = new ethers.Wallet(pk, provider);
    if (withdrawal.relayer.toLowerCase() !== wallet.address.toLowerCase()) {
      return NextResponse.json({ error: `Invalid relayer address: expected ${wallet.address}` }, { status: 400 });
    }

    const fee = BigInt(withdrawal.fee);
    const withdrawnValue = BigInt(proof.pubSignals[0]);
    const gasPrice = (await provider.getFeeData()).gasPrice ?? ethers.parseUnits("1", "gwei");
    await warmGasSamples();
    const minFee = minFeeFor(gasPrice);
    if (!feeAcceptable(fee, minFee)) {
      return NextResponse.json({ error: `Insufficient relayer fee: provided ${fee}, minimum ${minFee}. Request a fresh quote.` }, { status: 400 });
    }
    if (!feeWithinShare(fee, withdrawnValue)) {
      return NextResponse.json({ error: "Relayer fee exceeds 50% of the withdrawn value" }, { status: 400 });
    }

    // Do not spend the user's proof on a relayer that cannot pay for gas.
    const health = await relayerHealth(provider);
    if (!health.healthy) {
      return NextResponse.json({ error: `Courier temporarily unavailable (${health.reason}). Use your wallet to withdraw instead.` }, { status: 503 });
    }

    const pool = new ethers.Contract(poolAddress(), POOL_ABI, wallet);
    const w = { recipient: withdrawal.recipient, relayer: withdrawal.relayer, fee };
    const p = { pA: proof.pA, pB: proof.pB, pC: proof.pC, pubSignals: proof.pubSignals.map((x: string) => BigInt(x)) };
    try {
      await pool.withdraw.staticCall(w, p); // proof, nullifier, roots and context are all checked here
    } catch (e: any) {
      const name = e.revert?.name || e.reason || e.shortMessage || "execution reverted";
      return NextResponse.json({ error: `Relayer validation failed: ${name}` }, { status: 400 });
    }

    // The proof exists now, so the cost of THIS transaction can be estimated exactly (including the L1-data component).
    // The fee (already bound into the proof) must cover it; otherwise the relayer would lose money on this relay.
    let exactGas: bigint;
    try {
      exactGas = await pool.withdraw.estimateGas(w, p);
    } catch (e: any) {
      return NextResponse.json({ error: `Relayer validation failed: ${e.revert?.name || e.shortMessage || "gas estimation failed"}` }, { status: 400 });
    }
    if (!feeCoversCost(fee, exactGas, gasPrice)) {
      return NextResponse.json({ error: `Fee too low for this transaction: it needs about ${requiredFee(exactGas, gasPrice)} wei (estimated ${exactGas} gas), provided ${fee}. Request a fresh quote.` }, { status: 400 });
    }

    // one hot wallet = one nonce sequence: relays run strictly one after another
    const result = await serialized(async () => {
      const tx = await pool.withdraw(w, p, { gasLimit: (exactGas * BigInt(125)) / BigInt(100) });
      const receipt = await tx.wait();
      return { tx, receipt };
    });
    const { tx, receipt } = result;
    const gasCost = BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice ?? gasPrice);
    console.info(`[relay] tx=${tx.hash} estimate=${exactGas} gas=${receipt.gasUsed} cost=${gasCost} fee=${fee} net=${fee - gasCost}`);
    recordGasSample(receipt.gasUsed);
    await persistRelay({
      recipient: withdrawal.recipient, relayer: withdrawal.relayer, fee, nullifier: String(proof.pubSignals[4]), txHash: tx.hash,
      gasEstimate: exactGas, gasUsed: receipt.gasUsed, gasCost, net: fee - gasCost,
    });
    try {
      await persistLeaves(await leavesFromTx(provider, tx.hash));
    } catch {}
    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      gasCostWei: gasCost.toString(),
      feeWei: fee.toString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Relay failed: ${e.shortMessage || "internal error"}` }, { status: 502 });
  }
}
