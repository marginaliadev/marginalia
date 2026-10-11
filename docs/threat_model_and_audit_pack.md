# MARGINALIA: Threat Model & Security Audit Packet

**Version:** 2.0 (rewritten 2026-10-09; supersedes 1.0.0 of 2026-09-26)
**Status:** Pre-audit. Internal review complete; external audits and the public setup ceremony are **not** done (see `docs/phase4_audit_ceremony_report.md`).
**Deployment:** Robinhood Chain (Arbitrum Orbit L2): testnet 46630 live, mainnet 4663 not deployed and technically blocked (`scripts/ceremony/mainnet-guard.js`).
**Primitives:** Groth16 / BN254, Poseidon (t = 2, 3, 4), keccak256, AES-256-GCM + PBKDF2 (browser vault), X25519 + HKDF (disclosure letters).
**Companion documents:** `docs/audit/README.md` (scope, hashes, findings), `docs/audit/circuit_notes.md` (circuits), `docs/audit/slither_triage.md`, `docs/ceremony_guide.md`, `docs/incident_response_runbook.md`.

What changed from 1.0: wrong `ragequit` signature corrected; the vault and note-storage description corrected (browser vault, plaintext CLI notes, transient pending secret); the "formal invariant suite" claim replaced by what actually exists (seeded fuzzing with a shadow model, adversarial tests); new threats added for governance, the automated Magistrate, IPFS lists, the relayer, the web tier, the setup and the build.

---

## 1. System and trust boundaries

```
 Browser (proving, vault, keys)                     Chain (source of truth)
 ┌───────────────────────────────┐   tx           ┌───────────────────────────────┐
 │ zk.ts: Poseidon, Merkle,      │ ─────────────► │ MarginaliaPool (immutable)    │
 │ Groth16 prover (snarkjs)      │                │  Folio tree (20 levels)       │
 │ vault: AES-GCM, EIP-712 key   │ ◄───────────── │  nullifierSpent, labels       │
 └──────────────┬────────────────┘   reads        │ MagistrateRegister            │
                │ /api/folio, /api/relay/*        │  16-root history, rootData    │
 ┌──────────────▼────────────────┐                │ Groth16Verifier, RagequitVer. │
 │ Web tier (Next.js / Railway)  │                └───────────────▲───────────────┘
 │  Folio+ASP builder, Courier   │                                │ publishRoot(root, ipfs://cid)
 └──────────────┬────────────────┘                ┌───────────────┴───────────────┐
                │ lists (verified vs on-chain)    │ Magistrate service (worker)   │
 ┌──────────────▼────────────────┐   pin/fetch    │  scan, screen, list, pin, pub │
 │ IPFS (Pinata + Filebase)      │ ◄────────────► │ Safe 2-of-3 (owner/guardian)  │
 └───────────────────────────────┘                └───────────────────────────────┘
```

**Who is trusted for what**

| Actor | Trusted to | NOT able to |
|---|---|---|
| **Pool contract** | hold funds, enforce nullifiers and roots; immutable, no admin that touches funds | be upgraded or paused for exits |
| **Magistrate** | decide *which deposits may withdraw privately* (screening) | move funds; stop `ragequit`; learn who owns which note |
| **Guardian (Safe)** | pause *new deposits*, set a deposit cap, hand over the role | pause withdrawals or ragequit (impossible in code) |
| **Register owner (Safe)** | replace the Magistrate, authorise pools | publish roots, touch funds |
| **Relayer** | submit transactions and pay gas, repaid by a proof-bound fee | redirect funds, change the fee, learn secrets |
| **Web server / index (Supabase)** | convenience (leaf list, label list, relay) | forge state: every root it serves is re-checked against the contracts in the browser |
| **IPFS / gateways** | storage and transport | alter a list: integrity comes from the on-chain root |
| **RPC provider** | answer chain reads | (a lying RPC can mislead the UI; see T16) |
| **Setup ceremony** | produce keys with no one knowing the trapdoor | (a compromised setup breaks soundness, see T10) |

Assumptions that, if false, break guarantees: Groth16 and BN254 hold; Poseidon is collision- and preimage-resistant; at least one ceremony contributor was honest (**not yet true for the committed dev keys**); the browser and wallet that hold `sk`/`rho` are not compromised.

---

## 2. Invariants and the tests that defend them

| ID | Invariant | Enforcement | Tests |
|---|---|---|---|
| I1 | **Solvency/conservation:** contract balance = Σ deposits − Σ withdrawn − Σ ragequit | `value = withdrawn + remaining`, both < 2^128; commitment built by the pool from `msg.value`; transfers after effects | `invariant_fuzz` (shadow model, 3 seeds), `invariants.test.js` |
| I2 | **Single use:** a nullifier goes false → true once | `nullifierSpent` set before any ETH is sent; `nonReentrant` | `security_onchain`, `invariant_fuzz` (replay after every withdraw) |
| I3 | **One door:** a note leaves by withdraw XOR ragequit | both burn the same `N = Poseidon(sk, rho)` | `security_onchain`, `invariant_fuzz` |
| I4 | **Transaction binding:** a proof cannot be reused for another recipient/relayer/fee/chain/pool | `context = keccak256(chainid, pool, recipient, relayer, fee) mod p` is a public signal | `security_onchain` (`InvalidContext`) |
| I5 | **Lawful withdrawal:** private withdrawal needs the deposit's label in a root the register accepts | `MerkleInclusion` over the ASP tree + `register.isValidRoot` | `magistrate_service`, `security_onchain` |
| I6 | **Exit is unconditional:** pause and Magistrate decisions never block `ragequit` | no pause or approval check in `ragequit` | `security_onchain` (paused ragequit), `scripts/test-governance.js` (real Safe) |
| I7 | **Folio integrity:** off-chain tree = on-chain tree; `nextIndex` = deposits + withdrawals | identical hashing order | `merkle_bulk`, `browser_sdk_parity`, fuzz |
| I8 | **Circuit soundness at the witness level:** every input except `context` is constrained | see `circuit_notes.md` | `circuit_audit` (31 tests, every input and path element mutated) |
| I9 | **Only the Magistrate publishes roots; only owner/guardian govern** | access-control custom errors | `security_onchain`, governance script (8 admin calls revert for the old deployer) |

Honest limit: I1–I3 are checked by randomised testing (≈ 84 proof-bearing steps per run), **not** by formal verification or million-step fuzzing. Echidna/Foundry in CI is listed as open work.

---

## 3. Threat matrix

Status: ✅ mitigated and tested · ⚠️ partly mitigated / residual risk · ❌ open.

### Protocol and cryptography
| # | Threat | Mitigation | Status |
|---|---|---|---|
| T1 | **Double spend** of a note | nullifier circuit-bound; `nullifierSpent` set before transfers; reentrancy guard | ✅ |
| T2 | **Front-running / calldata malleability:** copy a proof from the mempool and redirect funds | `context` (public) binds recipient, relayer, fee, chainId, pool; `ragequit` accepted only from `labelDepositor[label]` | ✅ |
| T3 | **Field wrap-around overdraft** | `Num2Bits(128)` on `withdrawnValue` and `remaining`; public signals checked `< p` in the contract | ✅ |
| T4 | **Stale ASP root race** (proof built before a new root) | register keeps 16 roots; the Magistrate service publishes at most every 15 min (≥ 4 h window, tested); the server prefers the list for the latest root and flags older ones `aspStale`; the UI says "list updating" instead of "not approved" | ✅ (needs the rate limit in production) |
| T5 | **Hostage deposit:** Magistrate refuses to approve | `ragequit(label, recipient, proof)` by the original depositor, public refund, burns the nullifier. **A change note cannot ragequit** (new `rho`); its owner must withdraw | ⚠️ change-note holders depend on approval of the original label |
| T6 | **Precommitment/label griefing:** dust deposit under a victim's precommitment to burn their nullifier | `precommitmentUsed` allows one deposit per precommitment; labels are assigned by the pool | ✅ |
| T7 | **Reentrancy / ETH send to a hostile contract** | `nonReentrant`, effects before `_send`, failure reverts (`TransferFailed`); a reverting recipient only reverts its own transaction | ✅ |
| T8 | **Tree exhaustion** (2^20 leaves) | `TreeFull` revert; capacity ≈ 1.05 M notes; not an attack vector at current scale | ⚠️ capacity planning for mainnet |

### Trusted setup and build
| # | Threat | Mitigation | Status |
|---|---|---|---|
| T9 | **Dev trusted setup:** the committed keys come from a local, single-party Powers of Tau; whoever held the trapdoor can forge proofs and drain the pool | testnet only; mainnet deploy refused by `mainnet-guard` until valid ceremony transcripts exist (≥ 15 contributors, beacon, pinned public Phase 1, verifier = ceremony export); ceremony toolkit and rehearsal complete | ❌ **blocking for mainnet** until the real ceremony |
| T10 | **Non-reproducible or inconsistent build:** committed `withdraw.wasm` is a `--O1` build, `ragequit.wasm` is `--O2`; compiler flags were never pinned | `--O2` pinned in `build-circuit.sh` and `compile.js`; reproducibility and provenance tests; manifest of hashes | ⚠️ artifacts must be rebuilt with native circom and re-ceremonied |

### Governance and operations
| # | Threat | Mitigation | Status |
|---|---|---|---|
| T11 | **Single governance key:** one EOA is register owner, Magistrate and guardian on the **live** deployment | Safe 2-of-3 v1.4.1 (exists on chain 46630); `scripts/governance/*` with dry-run and preconditions; proven on a staging deployment with a real Safe; publisher key separate and rotatable | ⚠️ **live roles not yet moved** (needs signers) |
| T12 | **Compromised or malicious Magistrate publisher key** | cannot move funds; can censor (deny) or approve bad actors; Safe replaces it in one transaction; append-only decision log; lists are public and verifiable; ragequit always available | ⚠️ compliance harm possible until rotated |
| T13 | **Screening failure modes** (API down, list unavailable, empty list read as "clean") | policies fail closed: any screening outage stops publication; an empty/garbage OFAC list is rejected; last good list reused only for 24 h | ✅ |
| T14 | **Tampered or unavailable approved-label list** | document verified against the on-chain root (labels → root); two pinning providers; multi-gateway fetch; GitHub fallback | ✅ (real IPFS providers untested) |
| T15 | **Relayer hot wallet:** drained, out of gas, or abused | holds only gas money; fee cannot exceed 50% of the withdrawn value; fee ≥ 90% of current cost; relays serialised (one nonce); Courier disabled and 503 below a balance threshold; rate-limited alerts | ⚠️ cost-based quote is empirical, not yet from `estimateGas` of the real call |

### Web tier and client
| # | Threat | Mitigation | Status |
|---|---|---|---|
| T16 | **Lying server, index or RPC** | browser rebuilds the Folio and ASP trees and requires `isKnownRoot` and `isValidRoot` from the contracts; leaves are indexed only from on-chain receipts (never request bodies); a server on another pool is rejected | ✅ (a fully malicious RPC could still mislead reads; wallet RPC is used when present) |
| T17 | **Note and secret theft from the client** | browser vault: AES-256-GCM, key from an EIP-712 signature; proofs generated locally, secrets never sent. **Residual:** CLI notes in `notes/` are plaintext (dev tooling); a deposit secret sits in `localStorage` between "tx sent" and "note shown" (crash recovery) | ⚠️ |
| T18 | **Front-end supply chain / integrity:** malicious script or proving asset served to users | dependency audit in CI; assets same-origin; **Content-Security-Policy** (no foreign script origins, no eval, no framing, connections only to the site and the RPC; enforced and checked in a real browser, `S1` in `scripts/test-browser-e2e.js`); the browser **verifies SHA-256 of every wasm/zkey** against `frontend/src/lib/zk-hashes.ts` before proving (`test/zk_assets.test.js`); the hashes are published in `docs/audit/zk_assets.md` | 🟡 mitigated. Remaining: `'unsafe-inline'` scripts (no nonce pipeline), and the pinned hashes ship from the same origin, so they protect against swapped/corrupted assets, not against a fully compromised host (users who care compare with the published hashes) |
| T19 | **Denial of service** on API routes | per-IP rate limits, body limits, JSON error handling; heavy Folio scans bounded by a time budget | ⚠️ in-memory limiter, single instance |

### Privacy (what is NOT hidden)
| # | Leak | Note |
|---|---|---|
| P1 | Deposit amount and depositor address are public (`Deposited` event) | by design |
| P2 | Withdrawal recipient, amount and fee are public; only the link to the deposit is hidden | by design |
| P3 | Timing and amount correlation, unique amounts, small anonymity set (tens of deposits on testnet) | user guidance and UX hints needed |
| P4 | Gas payer: wallet-submitted withdrawals link the signer to the recipient; the Courier address appears in every relayed withdrawal | recommend Courier mode |
| P5 | The Magistrate learns depositor addresses (it screens them) but cannot link them to withdrawals | by design |

---

## 4. Known limitations carried from `devbrief.md` (L1–L13), current status

| L | Topic | Status |
|---|---|---|
| L1 | dev trusted setup | open (T9) |
| L2 | not audited | open (external audits pending) |
| L3 | exit for rejected deposits | closed (ragequit) |
| L4 | single Magistrate key | partly closed (Safe + rotation built, not applied on live) |
| L5 | ASP root race | closed (16-root history, rate limit, latest-root preference) |
| L6 | notes in plaintext | partly closed (browser vault; CLI notes remain plaintext) |
| L7 | metadata leaks | partly (Courier, UX); inherent limits in §3 P1–P5 |
| L8 | gas cost | measured, no further saving found (assembly Poseidon was not cheaper) |
| L9 | ETH only | ERC-20 pool exists but is out of audit scope |
| L10 | no viewing keys | implemented (X25519 letter of disclosure) |
| L11 | event scanning limits | mitigated (Supabase index + receipt-based recording; RPC with large `getLogs` recommended) |
| L12 | upgrade/pause | decided: immutable pool, guardian can pause deposits only |
| L13 | legal | open (review needed before mainnet) |

---

## 5. Audit scope summary
In scope: `circuits/withdraw.circom`, `circuits/ragequit.circom`, `circuits/lib/merkle.circom`, `contracts/MarginaliaPool.sol`, `contracts/MagistrateRegister.sol`, plus equality of the generated verifiers with the final zkey. Informational: the browser SDK (`frontend/src/lib/zk.ts`), `lib/marginalia.js`, the Magistrate service and governance scripts. Out of scope: `MarginaliaTokenPool.sol` (unless it will be deployed), mocks. Hashes and toolchain pins: `docs/audit/manifest.json`.

## 6. Internal verification status (honest checklist)
- [x] Reentrancy guard on all state-changing user functions; effects before interactions.
- [x] EVM `cancun`, optimizer 200 runs, solc 0.8.24 pinned; plain `solc` reproduces the Hardhat bytecode.
- [x] Public signals are checked `< p` by the contract.
- [x] Every circuit input except `context` is constrained (mutation-tested); `context` is bound on-chain.
- [x] Slither on current code: 0 High, 0 Medium.
- [x] Adversarial test suite (21 on-chain security tests, 31 circuit tests, ceremony forgery tests).
- [ ] Million-step fuzzing / formal verification (Echidna, Foundry, Halmos).
- [ ] External contract audit, external ZK audit.
- [ ] Public Phase-2 ceremony and verifier regeneration.
- [ ] Native-circom `--O2` rebuild of both circuits and real-proof rehearsal for `withdraw`.
- [ ] Governance roles moved to the Safe on the live deployment.
- [ ] CSP / SRI and published hashes of served proving assets.
- [ ] Legal review.
