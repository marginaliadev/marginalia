import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { RH_TESTNET } from "@/lib/constants";
import { makeProvider } from "@/lib/folio";
import { ESTIMATED_GAS, minFeeFor, relayerHealth } from "@/lib/relayer-health";

export async function POST() {
  const provider = makeProvider();

  let gasPrice = BigInt(2000000000); // 2.0 Gwei fallback when the RPC cannot answer
  try {
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice) gasPrice = feeData.gasPrice;
  } catch (_) {}

  const feeWei = minFeeFor(gasPrice);
  const health = await relayerHealth(provider);

  return NextResponse.json({
    relayer: health.address,
    // offered only when a key exists AND the wallet can actually pay for gas
    relayerAvailable: health.healthy,
    relayerReason: health.reason,
    minFeeWei: feeWei.toString(),
    estimatedGas: Number(ESTIMATED_GAS),
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    minFeeEth: ethers.formatEther(feeWei),
    chain: RH_TESTNET.name,
    chainId: RH_TESTNET.chainId,
    validUntil: Date.now() + 120_000,
  });
}

export async function GET() {
  return POST();
}
