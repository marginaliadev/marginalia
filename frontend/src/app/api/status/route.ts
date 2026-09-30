import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { RH_TESTNET } from "@/lib/constants";

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

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const [leavesRes, aspRes] = await Promise.all([
        supabase.from("leaves").select("*", { count: "exact", head: true }),
        supabase.from("asp_roots").select("*", { count: "exact", head: true }),
      ]);
      leavesCount = leavesRes.count ?? 0;
      aspCount = aspRes.count ?? 0;
      dbConnected = !leavesRes.error;
    } catch (_) {}
  }

  // Secure relayer address check
  let relayerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
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
