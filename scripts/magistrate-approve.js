// DEV Magistrate: approves every deposit label EXCEPT those from addresses in DENYLIST.
//   DENYLIST=0xabc...,0xdef... npx hardhat run scripts/magistrate-approve.js --network <network>
//
// In production this is an off-chain service that screens depositors (sanctions lists,
// on-chain analytics, hacks), keeps the approved label list public (e.g. on IPFS)
// and publishes the new root. Must be signed by the MAGISTRATE key.
const fs = require("fs");
const { ethers } = require("hardhat");
const M = require("../lib/marginalia");
const { contracts, ASP_DIR, aspFile } = require("./common");

async function main() {
  const { d, pool, register } = await contracts();
  const deny = new Set(
    (process.env.DENYLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const currentBlock = await ethers.provider.getBlockNumber();
  const startBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : d.deployBlock;
  const CHUNK_SIZE = Math.max(1, parseInt(process.env.RH_LOG_CHUNK || "10", 10));
  const deposits = [];
  for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    try {
      const chunk = await pool.queryFilter(pool.filters.Deposited(), from, to);
      deposits.push(...chunk);
    } catch (e) {
      console.warn(`Warning fetching logs [${from}, ${to}]:`, e.message);
    }
  }
  const approved = [];
  for (const ev of deposits) {
    const who = ev.args.depositor.toLowerCase();
    const isRagequit = await pool.isRagequit(ev.args.label);
    if (isRagequit) {
      console.log(`SKIP    label ${ev.args.label} (ragequit by depositor)`);
      continue;
    }
    if (deny.has(who)) {
      console.log(`DENY    label ${ev.args.label} (depositor ${who})`);
    } else {
      approved.push(ev.args.label.toString());
    }
  }

  const tree = await M.buildAspTree(approved.map(BigInt));
  const root = tree.root();

  fs.mkdirSync(ASP_DIR, { recursive: true });
  fs.writeFileSync(aspFile(), JSON.stringify({ root: root.toString(), labels: approved }, null, 2));

  const [signer] = await ethers.getSigners();
  const tx = await register.connect(signer).publishRoot(root, `file://asp/${d.network}.labels.json`);
  await tx.wait();
  console.log(`Approved ${approved.length}/${deposits.length} deposits`);
  console.log(`Published ASP root ${root}\ntx ${tx.hash}`);
}

main()
  .then(() => process.exit(0)) // snarkjs keeps worker threads alive
  .catch((e) => {
  console.error(e);
  process.exit(1);
});
