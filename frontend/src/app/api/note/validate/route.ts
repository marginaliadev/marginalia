import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { createClient } from "@supabase/supabase-js";
import { parseNoteString } from "@/lib/server-crypto";
import { RH_TESTNET, POOL_ABI } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { note } = body;

    if (!note) {
      return NextResponse.json({ valid: false, error: "Missing note parameter" }, { status: 400 });
    }

    let parsed: any;
    try {
      parsed = parseNoteString(note.trim());
    } catch (parseErr: any) {
      return NextResponse.json({ valid: false, error: parseErr.message }, { status: 400 });
    }

    const { sk, rho, value, label, commitment } = parsed;

    // Check nullifier spent status
    let nullifierHash = "";
    if (parsed.nullifierHash) {
      nullifierHash = parsed.nullifierHash;
    } else {
      nullifierHash = ethers.keccak256(ethers.toUtf8Bytes(`${sk}:${rho}`));
    }

    const rpcUrl = process.env.RH_TESTNET_RPC_URL || RH_TESTNET.rpcUrl;
    const poolAddress = process.env.MARGINALIA_POOL_ADDRESS || RH_TESTNET.poolAddress;

    let isSpent = false;
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
      isSpent = await pool.nullifierSpent(nullifierHash);
    } catch (_) {}

    if (isSpent) {
      return NextResponse.json({
        valid: false,
        error: "Wax Seal Broken (Already Spent): This note's nullifier has already been spent or ragequitted. Reusing spent notes violates Axiom I (Soundness).",
      }, { status: 409 });
    }

    // Check if commitment exists in Supabase leaves
    let leafFound = false;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey && commitment) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data } = await supabase
          .from("leaves")
          .select("leaf_commitment")
          .eq("leaf_commitment", commitment.toString())
          .maybeSingle();
        if (data) leafFound = true;
      } catch (_) {}
    }

    // If commitment not found in Folio tree
    if (!leafFound && commitment) {
      return NextResponse.json({
        valid: false,
        error: "Commitment Not Found: Note commitment is not inscribed in the Folio tree on Robinhood Chain.",
      }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      nullifierHash,
      commitment,
      value,
      label,
      isSpent: false,
    });
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
