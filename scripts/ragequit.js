// NOTE=marginalia-note-v1-... [RECIPIENT=0x...] npx hardhat run scripts/ragequit.js --network <network>
// Emergency exit: the ORIGINAL depositor wallet (the signer) reclaims the original deposit publicly.
// The ragequit proof burns the note's genuine nullifier, so the note can never be withdrawn afterwards.
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { contracts, requireEnv } = require("./common");

async function main() {
  const note = M.parseNote(requireEnv("NOTE"));
  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT || signer.address;
  const { pool } = await contracts();

  const depositor = await pool.labelDepositor(note.label);
  if (depositor === ethers.ZeroAddress) throw new Error("This note was never deposited into the pool");
  if (depositor.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Only the original depositor (${depositor}) can ragequit; signer is ${signer.address}`);
  }
  const nullifier = await M.nullifierOf(note.sk, note.rho);
  if (await pool.nullifierSpent(nullifier)) throw new Error("This note is already spent (withdrawn or ragequit)");

  console.log("Generating ragequit proof ...");
  const { proof } = await M.proveRagequit({ note });
  const tx = await pool.connect(signer).ragequit(note.label, recipient, proof);
  await tx.wait();
  console.log(`Ragequit ${ethers.formatEther(note.value)} ETH -> ${recipient}\ntx ${tx.hash}`);
}

main()
  .then(() => process.exit(0)) // snarkjs keeps worker threads alive
  .catch((e) => {
    console.error(e.shortMessage || e.message);
    process.exit(1);
  });
