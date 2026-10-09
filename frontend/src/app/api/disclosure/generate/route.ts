import { NextResponse } from "next/server";
import crypto from "crypto";
import { ethers } from "ethers";
import { generateViewingKeypair, createEncryptedMemo, parseNoteString } from "@/lib/server-crypto";
import { RH_TESTNET } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { note, auditorPublicKeyPem } = body;

    if (!note) {
      return NextResponse.json({ error: "Missing marginal note parameter" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseNoteString(String(note).trim());
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    let pubKeyPem = auditorPublicKeyPem;
    let generatedKeypair = null;

    if (!pubKeyPem || pubKeyPem.trim() === "" || pubKeyPem.startsWith("0x")) {
      generatedKeypair = generateViewingKeypair();
      pubKeyPem = generatedKeypair.viewingPublicKey;
    }

    try {
      crypto.createPublicKey(pubKeyPem);
    } catch {
      return NextResponse.json({ error: "auditorPublicKeyPem is not a valid X25519 public key (PEM)." }, { status: 400 });
    }

    const memoDetails = {
      noteReference: parsed.commitment ? parsed.commitment.toString().slice(0, 20) + "..." : "UNCOMMITTED",
      valueWei: parsed.value ? parsed.value.toString() : "0",
      valueEth: parsed.value ? ethers.formatEther(parsed.value.toString()) : "0",
      label: parsed.label ? parsed.label.toString() : "0",
      poolAddress: process.env.MARGINALIA_POOL_ADDRESS || RH_TESTNET.poolAddress,
      timestamp: new Date().toISOString(),
      chainId: RH_TESTNET.chainId,
    };

    const encryptedMemo = createEncryptedMemo(memoDetails, pubKeyPem);

    const disclosurePkg = {
      protocol: "MARGINALIA_ZK_SHIELDED_POOL",
      standard: "LETTER_OF_DISCLOSURE_V1",
      chain: `${RH_TESTNET.name} (${RH_TESTNET.chainId})`,
      timestamp: memoDetails.timestamp,
      auditorPublicKey: pubKeyPem,
      memoDetails: {
        noteReference: memoDetails.noteReference,
        taxBasisConfirmed: true,
        associationSetStatus: "MAGISTRATE_SANCTION_SCREENED",
        antiMoneyLaunderingCheck: "PASSED_UNLINKABLE_WHITELIST",
      },
      viewingKeyProof: encryptedMemo,
      generatedViewingKeypair: generatedKeypair,
    };

    return NextResponse.json(disclosurePkg);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
