import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CHAIN } from "@/lib/chain";
import { makeProvider } from "@/lib/folio";
import { relayerHealth } from "@/lib/relayer-health";
import { BOW_ENTRYPOINT_ABI, NATIVE_ASSET, bowEntrypoint } from "@/lib/bow-config";
import { BOW_DEFAULT_GAS, minRelayFeeBps, relayCostWei } from "@/lib/bow-relay";

// Quote for the 0xbow Courier: the minimum fee is a percentage that depends on the amount ({ "value": "<wei>" } in the body).
export async function POST(req: Request) {
  const entrypoint = bowEntrypoint();
  if (!entrypoint) return NextResponse.json({ error: "The 0xbow core is not configured on this deployment" }, { status: 503 });
  let value: bigint | null = null;
  try {
    const body = await req.json();
    if (body && /^\d{1,30}$/.test(String(body.value))) value = BigInt(body.value);
  } catch {}

  const provider = makeProvider();
  let gasPrice = BigInt(2000000000);
  try { const f = await provider.getFeeData(); if (f.gasPrice) gasPrice = f.gasPrice; } catch {}
  const health = await relayerHealth(provider);

  let maxBps = 0n;
  try {
    const cfg = await new ethers.Contract(entrypoint, BOW_ENTRYPOINT_ABI, provider).assetConfig(NATIVE_ASSET);
    maxBps = BigInt(cfg.maxRelayFeeBPS);
  } catch {
    return NextResponse.json({ error: "Could not read the Entrypoint configuration" }, { status: 502 });
  }

  const gas = BigInt(BOW_DEFAULT_GAS);
  const minBps = value === null ? null : minRelayFeeBps(value, gas, gasPrice, maxBps);
  return NextResponse.json({
    relayer: health.address,
    relayerAvailable: health.healthy,
    relayerReason: health.reason,
    entrypoint,
    maxRelayFeeBps: maxBps.toString(),
    // null = this amount is too small for the Courier to be repaid within the pool cap: use self-relay
    minRelayFeeBps: minBps === null ? null : minBps.toString(),
    relayable: value === null ? null : minBps !== null,
    estimatedGas: BOW_DEFAULT_GAS,
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    costWei: relayCostWei(gas, gasPrice).toString(),
    chain: CHAIN.name,
    chainId: CHAIN.chainId,
    validUntil: Date.now() + 120_000,
  });
}

export async function GET() {
  return POST(new Request("http://local/quote", { method: "POST", body: "{}" }));
}
