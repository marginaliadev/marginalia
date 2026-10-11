import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { RH_TESTNET } from "@/lib/constants";
import { makeProvider } from "@/lib/folio";
import { currentGasEstimate, minFeeFor, relayerHealth, warmGasSamples } from "@/lib/relayer-health";

export async function POST() {
  const provider = makeProvider();

  let gasPrice = BigInt(2000000000); // 2.0 Gwei fallback when the RPC cannot answer
  try {
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice) gasPrice = feeData.gasPrice;
  } catch (_) {}

  await warmGasSamples();
  const gas = currentGasEstimate();
  const feeWei = minFeeFor(gasPrice, gas.gas);
  const health = await relayerHealth(provider);

  return NextResponse.json({
    relayer: health.address,
    // offered only when a key exists AND the wallet can actually pay for gas
    relayerAvailable: health.healthy,
    relayerReason: health.reason,
    minFeeWei: feeWei.toString(),
    estimatedGas: gas.gas,
    gasSource: gas.source, // 'observed' (p90 of recent relays + headroom) or 'default' (measured constant)
    gasSamples: gas.samples,
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
