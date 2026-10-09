import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { RH_TESTNET } from "@/lib/constants";

export async function POST() {
  const rpcUrl = process.env.RH_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || RH_TESTNET.rpcUrl;
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  let gasPrice = BigInt(2000000000); // 2.0 Gwei default
  try {
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice) gasPrice = feeData.gasPrice;
  } catch (_) {}

  // Measured on testnet: a relayed withdraw uses ~1.07M gas (Poseidon-in-Solidity tree insert). Keep in sync with server.js.
  const estimatedGas = BigInt(1150000);
  const rawFeeWei = estimatedGas * gasPrice;
  // Apply 10% safety buffer
  const feeWei = (rawFeeWei * BigInt(110)) / BigInt(100);
  const minFeeEth = ethers.formatEther(feeWei);

  let relayerAddress = "0x673eF77ccb27e106769d2d56C536a4A0523B260E";
  const pk = process.env.RELAYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (pk) {
    try {
      relayerAddress = new ethers.Wallet(pk).address;
    } catch (_) {}
  }

  return NextResponse.json({
    relayer: relayerAddress,
    estimatedGas: Number(estimatedGas),
    gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
    minFeeEth,
    chain: RH_TESTNET.name,
    chainId: RH_TESTNET.chainId,
    validUntil: Date.now() + 60000,
  });
}

export async function GET() {
  return POST();
}
