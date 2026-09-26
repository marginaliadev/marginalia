# MARGINALIA — Developer Brief

*Shielded pools with zero-knowledge proofs. "Proven. Not revealed."*

| | |
|---|---|
| **Status** | Working prototype. **Not audited. Testnet only.** |
| **Target chain** | Robinhood Chain (Arbitrum Orbit L2). Testnet chain ID `46630`, mainnet `4663` |
| **Proof system** | Groth16 on BN254 (circom 2.2.2 + snarkjs 0.7.5) |
| **Hash** | Poseidon (circomlib), in the circuit and on-chain |
| **Model** | Compliant privacy pool (Privacy Pools–style Association Set Provider) |
| **Tested** | 12/12 tests passing. The CLI flow (deploy → deposit → approve → partial withdraw → spend change) was run end-to-end on a local node |

This brief contains everything needed to build, test, run and deploy the prototype, plus the list of work required before it can go anywhere near real money.

---

## 1. What it does, in one paragraph

A user deposits ETH with a **precommitment**, a hash of their secret. The pool computes the note **commitment** on-chain and writes it into a Poseidon Merkle tree, the **Folio**. Every deposit gets a **label**. An off-chain screening service, the **Magistrate** (Association Set Provider), publishes the Merkle root of approved labels to the **MagistrateRegister**. Later, from any address, the user can withdraw any amount up to the note value. They submit a Groth16 proof showing that they own *some* note in the Folio, that the note's label is approved, and that the note has not been spent. The proof reveals nothing about *which* note it is. The unspent remainder is re-inserted as a new **change note**. A **nullifier** (the Wax Seal) prevents double spends. The proof is bound to the recipient, relayer and fee, so it cannot be front-run.

---

## 2. Lore → code map

| Lore | Code | Where |
|---|---|---|
| Marginal Note | commitment `cm = Poseidon(value, label, Poseidon(P, ρ))` | `lib/marginalia.js`, `circuits/withdraw.circom` |
| Owner key P | `P = Poseidon(sk)` | circuit step 1 |
| The Folio | incremental Merkle tree, depth 20, root history 64 | `MarginaliaPool._insert` |
| Wax Seal | nullifier `N = Poseidon(sk, ρ)` | `nullifierSpent` mapping |
| Magistrate's Register | ASP label tree root | `MagistrateRegister.sol` |
| Mersenne Courier | relayer (`Withdrawal.relayer`, `fee`) | `MarginaliaPool.withdraw` |
| The Circle | anonymity set = all notes in the Folio | — |
| Letter of Disclosure (viewing key) | **not implemented yet** (roadmap) | — |
| Axiom I – Soundness | Groth16 verification + nullifier set | tests "Axiom I" |
| Axiom II – Zero knowledge | Groth16 ZK property + fresh `ρ` per note | — |
| Axiom III – Lawful Shade | ASP membership proof + `latestRoot` check | tests "Axiom III" |

---

## 3. Architecture

```
              deposit(precommitment) + ETH                 withdraw(Withdrawal, Proof)
   Alice ────────────────────────────────┐        ┌────────────── Relayer / any address
                                         ▼        ▼
                              ┌──────────────────────────────┐
                              │        MarginaliaPool        │
                              │  label = keccak(chainid,     │
                              │          pool, nonce) mod p  │
                              │  cm = PoseidonT4(v,label,pre)│──► LeafInserted events
                              │  Folio (depth-20 Merkle)     │
                              │  nullifierSpent[N]           │
                              └──────┬─────────────┬─────────┘
                    verifyProof(...) │             │ latestRoot()
                                     ▼             ▼
                         ┌─────────────────┐  ┌──────────────────────┐
                         │ Groth16Verifier │  │  MagistrateRegister  │◄── publishRoot(root)
                         │  (generated)    │  │  (ASP root registry) │     by Magistrate key
                         └─────────────────┘  └──────────────────────┘
                                                        ▲
         PoseidonT3 / PoseidonT4                        │ off-chain: screen Deposited events,
         (circomlibjs bytecode contracts)               │ build label tree, publish root
                                                 Magistrate service
```

### Lifecycle

1. **Deposit.** The client generates `sk` and `ρ`, then sends `pre = Poseidon(Poseidon(sk), ρ)` along with ETH. The pool assigns a `label` and computes `cm` **itself**, so the value inside the note is guaranteed to equal `msg.value`. No proof is needed at deposit.
2. **Screening.** The Magistrate reads `Deposited(depositor, cm, label, value, …)`, applies policy (sanctions lists, hack lists), rebuilds the approved-label tree and calls `publishRoot(root, dataURI)`.
3. **Withdraw.** The client rebuilds the Folio from `LeafInserted` events and the ASP tree from the published label list. It computes `context = keccak(chainid, pool, recipient, relayer, fee) mod p` and proves the statement in §4. The contract checks the proof and the public inputs, marks `N` as spent, inserts the change note and pays out.
4. **Change.** The change note keeps the same `sk` and `label` with a fresh `ρ'`, so it stays approved and can be spent again later.

---

## 4. Cryptographic specification

Field: BN254 scalar field, `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.

```
P    = Poseidon1(sk)
pre  = Poseidon2(P, ρ)
cm   = Poseidon3(value, label, pre)
N    = Poseidon2(sk, ρ)
label   = uint256(keccak256(abi.encodePacked(chainid, pool, depositNonce))) mod p
context = uint256(keccak256(abi.encode(chainid, pool, recipient, relayer, fee))) mod p
```

### Withdrawal circuit, `Withdraw(20, 20)`

**Public signals, in this exact order** (the verifier and contract depend on it):

| # | Signal | Checked on-chain against |
|---|---|---|
| 0 | `withdrawnValue` | `> 0`, `≥ fee`; amount paid out |
| 1 | `stateRoot` | `isKnownRoot()` (last 64 Folio roots) |
| 2 | `aspRoot` | `== register.latestRoot()` |
| 3 | `context` | `== computeContext(w)` |
| 4 | `nullifierHash` | not already in `nullifierSpent` |
| 5 | `newCommitment` | inserted into the Folio |

**Private witness:** `sk, value, label, ρ, statePath[20], stateIdx[20], aspPath[20], aspIdx[20], ρ'`

**Constraints:**
1. `cm = Poseidon3(value, label, Poseidon2(Poseidon1(sk), ρ))`
2. `MerkleRoot(cm, statePath, stateIdx) == stateRoot`
3. `MerkleRoot(label, aspPath, aspIdx) == aspRoot`
4. `Poseidon2(sk, ρ) == nullifierHash`
5. `remaining = value − withdrawnValue`, with both `withdrawnValue` and `remaining` range-checked to `[0, 2^128)`. This stops overdrafts, because a negative `remaining` wraps to about `p` and fails `Num2Bits(128)`.
6. `newCommitment == Poseidon3(remaining, label, Poseidon2(P, ρ'))`
7. `context² ` is computed so `context` is constrained into the proof.

Size: **11,570 non-linear + 12,666 linear constraints (24,236 total)**, so it needs a Powers of Tau of at least 2^15.

On-chain verification uses Arbitrum's BN254 precompiles (`ecAdd`, `ecMul`, `ecPairing`), which Robinhood Chain inherits.

---

## 5. Repository layout

```
marginalia/
├── circuits/
│   ├── withdraw.circom          # The Withdrawal Theorem (main circuit)
│   └── lib/merkle.circom        # Poseidon Merkle inclusion
├── contracts/
│   ├── MarginaliaPool.sol       # shielded pool (ETH)
│   ├── MagistrateRegister.sol   # ASP root registry
│   ├── Groth16Verifier.sol      # GENERATED by scripts/build-circuit.sh, do not edit
│   └── interfaces/IPoseidon.sol
├── lib/marginalia.js            # client SDK: notes, Merkle trees, proving
├── scripts/
│   ├── build-circuit.sh         # compile circuit + dev trusted setup + export verifier
│   ├── deploy.js                # deploy Poseidon hashers, verifier, register, pool
│   ├── deposit.js               # AMOUNT=… → prints/saves secret note
│   ├── magistrate-approve.js    # dev ASP: approve all except DENYLIST, publish root
│   ├── withdraw.js              # NOTE=… RECIPIENT=… [AMOUNT FEE RELAYER]
│   └── common.js
├── test/marginalia.test.js      # 12 end-to-end tests with real proofs
├── build/                       # circuit artifacts (wasm, zkey, vkey), dev keys shipped
├── hardhat.config.js
├── .env.example
└── devbrief.md
```

Output folders created at runtime (gitignored where sensitive):
- `deployments/<network>.json`: deployed addresses and deploy block
- `asp/<network>.labels.json`: the approved label list. In production this must be **published** (IPFS), because users need it to build their ASP path.
- `notes/`: secret notes. **Anyone holding a note can take the funds.**

---

## 6. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 (tested on 22) | nvm / nodejs.org |
| Rust + cargo | stable | `curl https://sh.rustup.rs -sSf \| sh` |
| circom | **2.2.2** (needs ≥ 2.1.9) | `cargo install --git https://github.com/iden3/circom.git --tag v2.2.2 circom` |
| git | any | — |

Hardware: proving takes about 3.6 s on 2 vCPUs. Phase-2 setup takes around 10–15 minutes on a 2-core machine and is much faster on a laptop.

---

## 7. Quickstart (about 5 minutes if you use the shipped dev keys)

```bash
cd marginalia
npm install

# The dev proving key and verifier are already included in build/ and contracts/.
# To regenerate them (new dev keys + new Groth16Verifier.sol):
#   npm run circuit:build
# or, with a public Powers of Tau file (recommended even for testnet):
#   PTAU=/path/powersOfTau28_hez_final_15.ptau npm run circuit:build

npx hardhat compile        # add USE_SOLCJS=1 if the solc download is blocked
npx hardhat test
```

Expected output:

```
  MARGINALIA shielded pool
    ✔ off-chain Merkle tree matches the on-chain Folio (empty + after inserts)
    ✔ on-chain commitment equals Poseidon(value, label, precommitment)
    ✔ full withdrawal to a fresh address via a relayer
    ✔ partial withdrawal, then spend the change note
    ✔ Axiom I: a Wax Seal cannot be broken twice (double-spend)
    ✔ Axiom III: an unapproved label cannot produce a proof against the Register
    ✔ front-running: changing recipient or fee invalidates the proof
    ✔ cannot withdraw more than the note holds
      gas: deposit=930306 withdraw=1072111
    ✔ reports gas for deposit and withdraw
    ✔ tampered public signals are rejected by the verifier
    ✔ only the Magistrate can publish Register roots
    ✔ note serialization round-trips
  12 passing
```

(The `ERROR: 4 Error in template Num2Bits…` line printed during the overdraw test is expected. It is the circuit refusing the overdraft.)

> **Important:** `build/withdraw_final.zkey` and `contracts/Groth16Verifier.sol` are a matched pair. If you rebuild the circuit, you must recompile and redeploy the verifier.

---

## 8. Local end-to-end demo (CLI)

Terminal 1:
```bash
npx hardhat node
```

Terminal 2:
```bash
npx hardhat run scripts/deploy.js --network localhost

AMOUNT=0.3 npx hardhat run scripts/deposit.js --network localhost
#  -> prints: label, note (marginalia-note-v1-…), saved: notes/localhost-deposit-….txt

npx hardhat run scripts/magistrate-approve.js --network localhost
#  -> Approved 1/1 deposits, Published ASP root …

NOTE=marginalia-note-v1-… \
RECIPIENT=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
AMOUNT=0.1 \
npx hardhat run scripts/withdraw.js --network localhost
#  -> Proof generated in ~3.6s, Withdrew 0.1 ETH, Change note (0.2 ETH): marginalia-note-v1-…

# spend the change note (full amount when AMOUNT is omitted)
NOTE=<change note> RECIPIENT=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
npx hardhat run scripts/withdraw.js --network localhost
```

Denying a depositor (screening demo):
```bash
DENYLIST=0xBadAddress1,0xBadAddress2 npx hardhat run scripts/magistrate-approve.js --network localhost
```
Deposits from those addresses are left out of the ASP tree, so they can no longer withdraw privately (see limitation L3 about exits).

---

## 9. Deploy to Robinhood Chain **testnet**

| Setting | Value |
|---|---|
| Chain ID | `46630` |
| Public RPC | `https://rpc.testnet.chain.robinhood.com` |
| Alchemy RPC | `https://robinhood-testnet.g.alchemy.com/v2/<KEY>` |
| Explorer | `https://explorer.testnet.chain.robinhood.com` |
| Gas token | ETH |

Steps:

1. `cp .env.example .env`, then fill in `DEPLOYER_PRIVATE_KEY` with a **fresh testnet-only key**. Optionally set `RH_TESTNET_RPC_URL` (Alchemy) and `MAGISTRATE_ADDRESS`.
2. Fund the deployer with testnet ETH. See `https://docs.robinhood.com/chain` for the current faucet and bridging options; the faucet location changes, so check there.
3. **Regenerate the keys** for anything other than local testing. Don't reuse the zkey shipped in this repo:
   ```bash
   PTAU=/path/powersOfTau28_hez_final_15.ptau npm run circuit:build
   npx hardhat compile
   ```
4. Deploy:
   ```bash
   npx hardhat run scripts/deploy.js --network robinhoodTestnet
   ```
   This deploys 5 contracts and writes `deployments/robinhoodTestnet.json`.
5. Smoke test:
   ```bash
   AMOUNT=0.001 npx hardhat run scripts/deposit.js --network robinhoodTestnet
   npx hardhat run scripts/magistrate-approve.js --network robinhoodTestnet   # signer must be MAGISTRATE
   NOTE=… RECIPIENT=0xFreshAddress npx hardhat run scripts/withdraw.js --network robinhoodTestnet
   ```
6. Optional contract verification on Blockscout: add a `etherscan.customChains` entry for chain 46630 pointing at the explorer API, then run `npx hardhat verify --network robinhoodTestnet <address> <constructor args>`.

Notes:
- `scripts/withdraw.js` signs with the first account in `.env`. For real privacy, the withdrawal must be sent **from an account unrelated to the depositor**, or through a relayer. Otherwise the gas payer links deposit and withdrawal.
- For a large pool, `queryFilter` from `deployBlock` can hit RPC log limits. Replace it with an indexer (see roadmap).
- **Do not deploy to mainnet (`--network robinhood`) before completing §12.**

---

## 10. Contract reference

### `MarginaliaPool`

| Function | Description |
|---|---|
| `deposit(uint256 precommitment) payable → uint256 cm` | `0 < msg.value ≤ 2^128−1`, `precommitment < p`. Assigns a label and inserts `cm`. |
| `withdraw(Withdrawal w, Proof p)` | `Withdrawal{recipient, relayer, fee}`, `Proof{pA, pB, pC, pubSignals[6]}` |
| `computeContext(Withdrawal) view → uint256` | Call this before proving. |
| `isKnownRoot(uint256) view → bool` | Checks the last 64 Folio roots. |
| `getLastRoot() view → uint256` | |
| `nullifierSpent(uint256) view → bool` | |
| `labelDepositor(uint256) view → address` | For the Magistrate. |

Events: `LeafInserted(index, leaf, root)`, `Deposited(depositor, commitment, label, value, precommitment, index)`, `Withdrawn(recipient, relayer, withdrawnValue, fee, nullifierHash, newCommitment)`.

Errors: `InvalidValue, NotInField, TreeFull, UnknownStateRoot, StaleAspRoot, NullifierAlreadySpent, InvalidContext, FeeTooHigh, InvalidProof, TransferFailed, Reentrancy`.

### `MagistrateRegister`

`publishRoot(uint256 root, string data)` (only `magistrate`), `setMagistrate(address)` (only `owner`), `latestRoot()`, `rootData(root)`.

---

## 11. SDK reference (`lib/marginalia.js`)

```js
const M = require("./lib/marginalia");

const secret = await M.newSecret();                      // { sk, rho, P, precommitment }
const receipt = await (await pool.deposit(secret.precommitment, { value })).wait();
const note = M.noteFromDepositReceipt(pool, receipt, secret);   // { sk, rho, value, label, commitment }
const str  = M.serializeNote(note);                      // "marginalia-note-v1-…"  (SECRET)

const stateTree = await M.buildStateTree(pool, deployBlock);
const aspTree   = await M.buildAspTree(approvedLabels);
const w = { recipient, relayer, fee };
const context = await pool.computeContext(w);
const { proof, changeNote } = await M.proveWithdraw({ note, stateTree, aspTree, withdrawnValue, context });
await pool.withdraw(w, proof);
```

`MerkleTree` mirrors `_insert` exactly (zero leaf = 0, `Poseidon2(left, right)`); a test enforces this. In the browser, `snarkjs.groth16.fullProve` works as-is. Serve `withdraw.wasm` and `withdraw_final.zkey` (about 11 MB) as static files.

---

## 12. Security model and known limitations (must read)

This is a **prototype**. The following items are required before any mainnet deployment:

| # | Issue | Why it matters | Fix |
|---|---|---|---|
| L1 | **Dev trusted setup** | Whoever holds the setup toxic waste can forge proofs and drain the pool. | Use a public Phase-1 ptau (Hermez/PSE), then run a multi-party Phase-2 ceremony (e.g. p0tion). Publish the transcript. Or move to a universal/transparent system (PLONK/Halo2/Noir+UltraHonk). |
| L2 | **Not audited** | Circuit bugs such as under-constrained signals are catastrophic and silent. | Get separate audits of the circuit (ZK specialist) and the contracts. Add circuit fuzzing and formal checks (e.g. Picus, circomspect). |
| L3 | **No exit ("ragequit") for rejected deposits** | If the Magistrate never approves a label, those funds are stuck. | Add a public `ragequit` for the original depositor with a small "commitment" circuit that proves knowledge of the note and reveals its nullifier. This is how Privacy Pools v1 handles it. |
| L4 | **Single Magistrate key** | Censorship risk and a single point of compromise. | Use a multisig or timelock, multiple ASPs, publish the label list on IPFS/Arweave, and let the user pick an ASP root from an allowlist. |
| L5 | **ASP root race** | Only `latestRoot` is accepted, so a proof made just before `publishRoot` fails with `StaleAspRoot`. | The client should retry, or the contract could accept a short root history. |
| L6 | **Notes stored in plaintext** (`notes/`) | Theft means loss of funds. | Encrypt notes (password or wallet-derived key), derive `sk` deterministically from a wallet signature, and add an encrypted on-chain note backup. |
| L7 | **Metadata leaks** | Gas payer, timing, and unique amounts can link deposits to withdrawals. | Run a relayer network, recommend wait times, add fixed-denomination UX hints, and show an anonymity-set size indicator. |
| L8 | **Gas**: deposit ≈ 930k, withdraw ≈ 1.07M | The external Poseidon contract is called 20 times per insert. | Use an inlined Yul Poseidon (e.g. `poseidon-solidity`) or a lazy IMT. It's cheap on an L2, but still worth optimising. |
| L9 | **ETH only** | — | Add an ERC-20 pool (`SafeERC20`, fee-on-transfer checks) or a multi-asset pool, where a shared anonymity set gives stronger privacy. |
| L10 | **No viewing keys** | Compliance disclosure isn't possible yet. | Add an encrypted memo per note with a disclosure key (the "Letter of Disclosure"). |
| L11 | **Event scanning** | RPC log limits make `queryFilter` fail at scale. | Build a Subgraph or Ponder indexer and serve Merkle paths from an API, with client-side root verification. |
| L12 | **Upgrade/pause** | None: the contract is immutable. | Decide governance: immutable plus versioned pools, or a pausable deposit-only guardian. |
| L13 | **Legal** | Privacy protocols draw regulatory attention (in Indonesia, crypto is under OJK). | Get legal review before launch. Keep the ASP/compliance design. Avoid launching a token early. |

Invariants covered by tests: tree parity, commitment correctness, no double spend, ASP enforcement, front-running protection, overdraw rejected at the circuit level, public-signal tampering rejected.

---

## 13. Roadmap

| Phase | Scope |
|---|---|
| **0 — Prototype** ✅ | Circuit, pool, register, SDK, CLI, tests (this repo) |
| **1 — Testnet alpha** | Regenerate keys with a public ptau, deploy to 46630, add ragequit (L3), encrypted notes (L6), indexer (L11), minimal web UI (Next.js + wagmi + in-browser snarkjs) |
| **2 — Hardening** | Relayer service with fee quoting, multisig Magistrate plus IPFS label lists (L4), gas optimisation (L8), ERC-20 support (L9), viewing keys (L10), fuzzing |
| **3 — Audit & ceremony** | Circuit and contract audits, public Phase-2 ceremony, bug bounty |
| **4 — Mainnet (4663)** | Deposit caps and guarded launch, monitoring, incident runbook |

---

## 14. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `HH502`/download error while compiling | The solc binary download is blocked. Run with `USE_SOLCJS=1 npx hardhat compile` (uses the bundled `solc@0.8.24`). |
| `circom: command not found` / pragma error | Install circom ≥ 2.1.9 (see §6). |
| Script finishes but doesn't exit | snarkjs worker threads. The scripts already call `process.exit(0)`, so do the same in your own scripts. |
| `bad address checksum` | Use the correctly checksummed address (or all lowercase). |
| `label not approved by the Magistrate` | Run `magistrate-approve.js` after the deposit. The label must be in `asp/<network>.labels.json`. |
| `StaleAspRoot` | The Magistrate published a new root after you proved. Rebuild the ASP tree and prove again. |
| `UnknownStateRoot` | More than 64 inserts happened since your proof. Rebuild the tree and prove again. |
| `InvalidProof` after rebuilding the circuit | The zkey and the deployed verifier don't match. Redeploy. |
| `ERROR: 4 Error in template Num2Bits` | The amount exceeds the note value (the circuit rejects it). |
| Phase-2 setup very slow | That's normal on 2 cores (10–15 min). Use a faster machine or a downloaded ptau. |

---

*"Fermat asked the world to trust him. Marginalia asks no one to trust anyone."*
