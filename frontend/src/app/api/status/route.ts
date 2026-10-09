import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { RH_TESTNET, POOL_ABI } from "@/lib/constants";

export async function GET() {
  const rpcUrl = process.env.RH_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || RH_TESTNET.rpcUrl;
  const poolAddress = process.env.MARGINALIA_POOL_ADDRESS || process.env.NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS || RH_TESTNET.poolAddress;
  const provider = new ethers.JsonRpcProvider(rpcUrl);

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

  // Secure relayer address check
  let relayerAddress = "0x673eF77ccb27e106769d2d56C536a4A0523B260E";
  const pk = process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (pk) {
    try {
      relayerAddress = new ethers.Wallet(pk).address;
    } catch (_) {}
  }

  return NextResponse.json({
    name: "MARGINALIA Next.js Relayer Engine",
    version: "2.0.0",
    chain: {
      chainId: RH_TESTNET.chainId,
      name: RH_TESTNET.name,
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
      address: relayerAddress,
      status: "active",
    },
  });
}
