// Pool accounting invariant for a 0xbow pool (migration plan section 9):
//   balance(pool) == sum(Deposited.value) - sum(Withdrawn.value) - sum(Ragequit.value)
// computed from the pool's own events, so it does not depend on what a test expects. Ragequit is part of the definition.
//   node scripts/bow/verify-pool-invariant.mjs deployments/bow-robinhoodTestnet.json
import "dotenv/config";
import fs from "fs";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const ABI = [
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
];

export async function poolInvariant(provider, rec, chunk = Number(process.env.LOG_CHUNK || 10)) {
  const iface = new ethers.Interface(ABI);
  const topics = ["Deposited", "Withdrawn", "Ragequit"].map((n) => iface.getEvent(n).topicHash);
  const head = await provider.getBlockNumber();
  let deposited = 0n, withdrawn = 0n, ragequit = 0n;
  const counts = { Deposited: 0, Withdrawn: 0, Ragequit: 0 };
  for (let from = rec.contracts[0].block; from <= head; from += chunk) {
    const to = Math.min(from + chunk - 1, head);
    const logs = await provider.getLogs({ address: rec.pool, topics: [topics], fromBlock: from, toBlock: to });
    for (const l of logs) {
      const p = iface.parseLog(l);
      counts[p.name]++;
      if (p.name === "Deposited") deposited += p.args._value;
      else if (p.name === "Withdrawn") withdrawn += p.args._value;
      else ragequit += p.args._value;
    }
  }
  const balance = await provider.getBalance(rec.pool, head);
  const expected = deposited - withdrawn - ragequit;
  return { ok: balance === expected, balance, expected, deposited, withdrawn, ragequit, counts, head };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error("usage: verify-pool-invariant.mjs <deployment.json>"); process.exit(1); }
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  const provider = new ethers.JsonRpcProvider(process.env.RH_TESTNET_RPC_URL);
  const r = await poolInvariant(provider, rec);
  const f = (x) => ethers.formatEther(x) + " ETH";
  console.log(`events: ${r.counts.Deposited} deposits, ${r.counts.Withdrawn} withdrawals, ${r.counts.Ragequit} ragequits (up to block ${r.head})`);
  console.log(`deposited ${f(r.deposited)} - withdrawn ${f(r.withdrawn)} - ragequit ${f(r.ragequit)} = ${f(r.expected)}`);
  console.log(`pool balance ${f(r.balance)}`);
  console.log(r.ok ? "INVARIANT OK" : "INVARIANT VIOLATED");
  process.exit(r.ok ? 0 : 1);
}
