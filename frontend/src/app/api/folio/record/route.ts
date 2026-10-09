import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { leavesFromTx, persistLeaves, rpcUrl } from "@/lib/folio";
import { rateLimited } from "@/lib/ratelimit";

// Index the leaves of a mined pool transaction. The leaves are read from the on-chain receipt,
// never from the request body, so a caller cannot inject fake commitments.
export async function POST(req: Request) {
  if (rateLimited(req, "record", 30)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const { txHash } = await req.json();
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "txHash must be a 32-byte hex string" }, { status: 400 });
    }
    const leaves = await leavesFromTx(new ethers.JsonRpcProvider(rpcUrl()), txHash);
    const persisted = await persistLeaves(leaves);
    return NextResponse.json({ success: true, indexed: leaves.map((l) => l.index), persisted });
  } catch (e: any) {
    return NextResponse.json({ error: e.shortMessage || e.message }, { status: 400 });
  }
}
