import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { makeProvider } from "@/lib/folio";
import { rateLimited } from "@/lib/ratelimit";
import { relayerHealth, serialized } from "@/lib/relayer-health";
import { BOW_ENTRYPOINT_ABI, NATIVE_ASSET, bowEntrypoint } from "@/lib/bow-config";
import { feeCoversExactCost, relayCostWei, relayFeeWei, validateBowRelayPayload } from "@/lib/bow-relay";

// Mersenne Courier for the 0xbow core: pays gas for Entrypoint.relay and is repaid by the proof-bound percentage fee.
// The proof, the roots, the nullifier and the context are all judged by the contract (staticCall) before any gas is spent.
export async function POST(req: Request) {
  if (rateLimited(req, "relay-bow", 10)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const entrypoint = bowEntrypoint();
  if (!entrypoint) return NextResponse.json({ error: "The 0xbow core is not configured on this deployment" }, { status: 503 });
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) return NextResponse.json({ error: "Relayer not configured" }, { status: 503 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 }); }

  try {
    const provider = makeProvider();
    const wallet = new ethers.Wallet(pk, provider);
    const v = validateBowRelayPayload(body, entrypoint, wallet.address);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

    const entry = new ethers.Contract(entrypoint, BOW_ENTRYPOINT_ABI, wallet);
    const cfg = await entry.assetConfig(NATIVE_ASSET);
    if (v.relayFeeBps > BigInt(cfg.maxRelayFeeBPS)) {
      return NextResponse.json({ error: `Relay fee ${v.relayFeeBps} BPS exceeds the pool cap of ${cfg.maxRelayFeeBPS} BPS` }, { status: 400 });
    }
    const fee = relayFeeWei(v.withdrawnValue, v.relayFeeBps);
    const gasPrice = (await provider.getFeeData()).gasPrice ?? ethers.parseUnits("1", "gwei");

    const health = await relayerHealth(provider);
    if (!health.healthy) {
      return NextResponse.json({ error: `Courier temporarily unavailable (${health.reason}). Use your wallet to withdraw instead.` }, { status: 503 });
    }

    const w = { processooor: v.payload.withdrawal.processooor, data: v.payload.withdrawal.data };
    const pr = v.payload.proof;
    const p = { pA: pr.pA.map(BigInt), pB: pr.pB.map((r) => r.map(BigInt)), pC: pr.pC.map(BigInt), pubSignals: pr.pubSignals.map(BigInt) };
    const scope = BigInt(v.payload.scope);

    let exactGas: bigint;
    try {
      await entry.relay.staticCall(w, p, scope);
      exactGas = await entry.relay.estimateGas(w, p, scope);
    } catch (e: any) {
      const name = e.revert?.name || e.reason || e.shortMessage || "execution reverted";
      return NextResponse.json({ error: `Relayer validation failed: ${name}` }, { status: 400 });
    }
    if (!feeCoversExactCost(fee, exactGas, gasPrice)) {
      return NextResponse.json({ error: `Fee too low for this transaction: it needs about ${relayCostWei(exactGas, gasPrice)} wei (estimated ${exactGas} gas), the proof binds ${fee} wei. Request a fresh quote and prove again.` }, { status: 400 });
    }

    const { tx, receipt } = await serialized(async () => {
      const tx = await entry.relay(w, p, scope, { gasLimit: (exactGas * 125n) / 100n });
      return { tx, receipt: await tx.wait() };
    });
    const gasCost = BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice ?? gasPrice);
    console.info(`[relay-bow] tx=${tx.hash} estimate=${exactGas} gas=${receipt.gasUsed} cost=${gasCost} fee=${fee} net=${fee - gasCost}`);
    return NextResponse.json({ success: true, txHash: tx.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), gasCostWei: gasCost.toString(), feeWei: fee.toString() });
  } catch (e: any) {
    return NextResponse.json({ error: `Relay failed: ${e.shortMessage || "internal error"}` }, { status: 502 });
  }
}
