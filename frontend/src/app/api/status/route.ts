import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { CHAIN } from "@/lib/chain";
import { POOL_ABI } from "@/lib/constants";
import { relayerHealth } from "@/lib/relayer-health";
import { makeProvider, poolAddress as activePoolAddress, rpcUrl as activeRpcUrl } from "@/lib/folio";

export async function GET() {
  const rpcUrl = activeRpcUrl();
  const poolAddress = activePoolAddress();
  const provider = makeProvider(rpcUrl);

  let poolBalanceEth = "0.0";
  let blockNumber: number | null = null;

  try {
    const [bal, bn] = await Promise.all([
      provider.getBalance(poolAddress),
      provider.getBlockNumber(),
    ]);
    poolBalanceEth = ethers.formatEther(bal);
    blockNumber = bn;
  } catch (err: any) {
    console.warn("RPC query fallback in /api/status:", err.message);
  }

  // Database checks
  let dbConnected = false;
  let leavesCount = 0;
  let aspCount = 0;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Leaf count comes from the chain (source of truth), not from the optional database.
  try {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    leavesCount = Number(await pool.nextIndex());
  } catch (_) {}

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const aspRes = await supabase.from("asp_roots").select("*", { count: "exact", head: true });
      aspCount = aspRes.count ?? 0;
      dbConnected = !aspRes.error;
    } catch (_) {}
  }

  const health = await relayerHealth(provider);

  return NextResponse.json({
    name: "MARGINALIA Next.js Relayer Engine",
    version: "2.0.0",
    chain: {
      chainId: CHAIN.chainId,
      name: CHAIN.name,
      rpcUrl: rpcUrl.replace(/alch_[a-zA-Z0-9_-]+/g, "alch_***"),
    },
    contracts: {
      pool: poolAddress,
    },
    telemetry: {
      poolBalanceEth,
      blockNumber,
    },
    database: {
      connected: dbConnected,
      leavesCount,
      aspCount,
    },
    relayer: {
      address: health.address,
      balanceEth: health.balanceWei === null ? null : ethers.formatEther(health.balanceWei),
      healthy: health.healthy,
      status: health.healthy ? "active" : health.reason,
    },
  });
}
