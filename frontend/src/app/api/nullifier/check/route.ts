import { makeProvider, poolAddress as activePoolAddress, rpcUrl as activeRpcUrl } from "@/lib/folio";
import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CHAIN } from "@/lib/chain";
import { POOL_ABI } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const { nullifier } = await req.json();
    if (!nullifier) {
      return NextResponse.json({ error: "Missing nullifier parameter" }, { status: 400 });
    }

    const nullifierStr = String(nullifier).trim();
    if (!/^\d{1,78}$/.test(nullifierStr)) {
      return NextResponse.json({ error: "Nullifier must be a decimal integer" }, { status: 400 });
    }

    const rpcUrl = activeRpcUrl();
    const poolAddress = activePoolAddress();

    let isSpent: boolean;
    try {
      const pool = new ethers.Contract(poolAddress, POOL_ABI, makeProvider(rpcUrl));
      isSpent = await pool.nullifierSpent(nullifierStr);
    } catch (e: any) {
      // Never report "unspent" when the chain could not be read.
      return NextResponse.json({ error: `Chain unreachable: ${e.shortMessage || e.message}` }, { status: 502 });
    }

    return NextResponse.json({
      nullifier: nullifierStr,
      isSpent,
      checkedAt: new Date().toISOString(),
      onChainChecked: true,
      pool: poolAddress,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
