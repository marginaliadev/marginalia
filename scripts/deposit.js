// AMOUNT=0.1 npx hardhat run scripts/deposit.js --network <network>
// Prints and saves the secret note. Anyone holding the note can withdraw the funds. Keep it safe.
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { contracts, saveNote } = require("./common");

async function main() {
  const amount = ethers.parseEther(process.env.AMOUNT || "0.01");
  const [signer] = await ethers.getSigners();
  const { pool } = await contracts();

  const secret = await M.newSecret();
  console.log(`Depositing ${ethers.formatEther(amount)} ETH from ${signer.address} ...`);
  const tx = await pool.connect(signer).deposit(secret.precommitment, { value: amount });
  const receipt = await tx.wait();
  const note = M.noteFromDepositReceipt(pool, receipt, secret);

  const noteStr = M.serializeNote(note);
  const file = saveNote(`deposit-${receipt.blockNumber}-${tx.hash.slice(2, 10)}`, noteStr);
  console.log(`tx     : ${tx.hash}`);
  console.log(`label  : ${note.label}`);
  console.log(`note   : ${noteStr}`);
  console.log(`saved  : ${file}`);
  console.log("\nNext: the Magistrate must approve this label before it can be withdrawn privately.");
}

main()
  .then(() => process.exit(0)) // snarkjs keeps worker threads alive
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
