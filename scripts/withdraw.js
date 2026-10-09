// NOTE=marginalia-note-v1-... RECIPIENT=0x... AMOUNT=0.05 [RELAYER=0x... FEE=0.001] \
//   npx hardhat run scripts/withdraw.js --network <network>
//
// AMOUNT defaults to the full note value. The change note (if any) is printed and saved.
// Privacy tip: submit from a DIFFERENT account than the depositor (or via a relayer),
// otherwise the gas payer links the two sides.
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { contracts, loadApprovedLabels, saveNote, requireEnv } = require("./common");
const { tryRecord, treeFromIndex } = require("../lib/folio-index");

async function main() {
  const note = M.parseNote(requireEnv("NOTE"));
  const recipient = requireEnv("RECIPIENT");
  const amount = process.env.AMOUNT ? ethers.parseEther(process.env.AMOUNT) : note.value;
  const relayer = process.env.RELAYER || ethers.ZeroAddress;
  const fee = process.env.FEE ? ethers.parseEther(process.env.FEE) : 0n;

  const { d, pool } = await contracts();
  const [signer] = await ethers.getSigners();

  console.log("Rebuilding the Folio ...");
  // fast path: the Supabase index, accepted only if it reproduces the pool's on-chain root
  const stateTree = (await treeFromIndex(M, pool)) || (await M.buildStateTree(pool, d.deployBlock));
  const aspTree = await M.buildAspTree(loadApprovedLabels());

  const w = { recipient, relayer, fee };
  const context = await pool.computeContext(w);

  console.log("Generating zero-knowledge proof ...");
  const t0 = Date.now();
  const { proof, changeNote } = await M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue: amount, context });
  console.log(`Proof generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const tx = await pool.connect(signer).withdraw(w, proof);
  await tx.wait();
  await tryRecord(ethers.provider, await pool.getAddress(), tx.hash);
  console.log(`Withdrew ${ethers.formatEther(amount)} ETH -> ${recipient}\ntx ${tx.hash}`);

  if (changeNote.value > 0n) {
    const s = M.serializeNote(changeNote);
    const f = saveNote(`change-${tx.hash.slice(2, 10)}`, s);
    console.log(`\nChange note (${ethers.formatEther(changeNote.value)} ETH): ${s}\nsaved: ${f}`);
  }
}

main()
  .then(() => process.exit(0)) // snarkjs keeps worker threads alive
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
