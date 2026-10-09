import { makeProvider } from "@/lib/folio";
import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { parseNoteString, onChainPoseidon } from "@/lib/server-crypto";
import { RH_TESTNET } from "@/lib/constants";

const FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

// The chain is the source of truth: Poseidon hashes, the Wax Seal and the label registry are all
// read from the pool contract, so no off-chain database is required.
export async function POST(req: Request) {
  try {
    const { note } = await req.json();
    if (!note || typeof note !== "string") {
      return NextResponse.json({ valid: false, error: "Missing note parameter" }, { status: 400 });
    }

    let parsed: any;
    try {
      parsed = parseNoteString(note.trim());
    } catch (parseErr: any) {
      return NextResponse.json({ valid: false, error: parseErr.message }, { status: 400 });
    }

    let sk: bigint, rho: bigint, value: bigint, label: bigint | undefined, commitment: bigint | undefined;
    try {
      sk = BigInt(parsed.sk);
      rho = BigInt(parsed.rho);
      value = BigInt(parsed.value);
      label = parsed.label !== undefined ? BigInt(parsed.label) : undefined;
      commitment = parsed.commitment !== undefined ? BigInt(parsed.commitment) : undefined;
    } catch {
      return NextResponse.json({ valid: false, error: "Corrupted Note: Numerical parameters are not valid integers." }, { status: 400 });
    }
    if (sk >= FIELD || rho >= FIELD || value >= FIELD || value === BigInt(0)) {
      return NextResponse.json({ valid: false, error: "Invalid Scalar Field: Parameters are out of BN254 range." }, { status: 400 });
    }

    const rpcUrl = process.env.RH_TESTNET_RPC_URL || RH_TESTNET.rpcUrl;
    const poolAddress = process.env.MARGINALIA_POOL_ADDRESS || RH_TESTNET.poolAddress;

    try {
      const chain = await onChainPoseidon(makeProvider(rpcUrl), poolAddress);
      const precommitment = await chain.p2([await chain.p1([sk]), rho]);
      const nullifierHash = await chain.p2([sk, rho]);

      if (label !== undefined && commitment !== undefined) {
        const expected = await chain.p3([value, label, precommitment]);
        if (expected !== commitment) {
          return NextResponse.json({
            valid: false,
            error: "Cryptographic Tampering Detected: Note commitment does not match internal parameters (sk, rho, value, label).",
          }, { status: 400 });
        }
      }

      if (await chain.pool.nullifierSpent(nullifierHash)) {
        return NextResponse.json({
          valid: false,
          error: "Wax Seal Broken (Already Spent): This note nullifier has already been spent or ragequitted. Reusing spent notes violates Axiom I (Soundness).",
        }, { status: 409 });
      }

      // Labels are assigned by the pool at deposit time; an unknown label can never be spent.
      if (label !== undefined && (await chain.pool.labelDepositor(label)) === ethers.ZeroAddress) {
        return NextResponse.json({
          valid: false,
          error: "Commitment Not Found: Note is not inscribed in the Folio tree on Robinhood Chain.",
        }, { status: 404 });
      }

      return NextResponse.json({
        valid: true,
        nullifierHash: nullifierHash.toString(),
        precommitment: precommitment.toString(),
        commitment: commitment?.toString() ?? null,
        value: value.toString(),
        label: label?.toString() ?? null,
        isSpent: false,
      });
    } catch (e: any) {
      return NextResponse.json({ valid: false, error: `Chain query failed: ${e.shortMessage || e.message}` }, { status: 502 });
    }
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
