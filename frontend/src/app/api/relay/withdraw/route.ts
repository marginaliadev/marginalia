import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { POOL_ABI } from "@/lib/constants";
import { leavesFromTx, makeProvider, persistLeaves, poolAddress } from "@/lib/folio";
import { rateLimited } from "@/lib/ratelimit";

const ESTIMATED_GAS = BigInt(1150000);
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
    const gasPrice = (await provider.getFeeData()).gasPrice ?? ethers.parseUnits("1", "gwei");
    const minFee = (ESTIMATED_GAS * gasPrice * BigInt(11000)) / BigInt(10000);
    if (BigInt(withdrawal.fee) < minFee) {
      return NextResponse.json({ error: `Insufficient relayer fee: provided ${withdrawal.fee}, minimum ${minFee}` }, { status: 400 });
    }

    const pool = new ethers.Contract(poolAddress(), POOL_ABI, wallet);
    const w = { recipient: withdrawal.recipient, relayer: withdrawal.relayer, fee: BigInt(withdrawal.fee) };
    const p = { pA: proof.pA, pB: proof.pB, pC: proof.pC, pubSignals: proof.pubSignals.map((x: string) => BigInt(x)) };
    try {
      await pool.withdraw.staticCall(w, p); // proof, nullifier, roots and context are all checked here
    } catch (e: any) {
      const name = e.revert?.name || e.reason || e.shortMessage || "execution reverted";
      return NextResponse.json({ error: `Relayer validation failed: ${name}` }, { status: 400 });
    }

    const tx = await pool.withdraw(w, p);
    const receipt = await tx.wait();
    try {
      await persistLeaves(await leavesFromTx(provider, tx.hash));
    } catch {}
    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Relay failed: ${e.shortMessage || "internal error"}` }, { status: 502 });
  }
}
