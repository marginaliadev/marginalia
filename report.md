# Summary Report: Marginalia

> *"Proven. Not revealed."*

## 1. Overview

**Marginalia** is a zero-knowledge *shielded asset pool* built for **Robinhood Chain** (an Orbit L2). Its goal: keep transactions confidential without sacrificing compliance, through an **Association Set Provider (ASP)** and **Provable Exclusion Proofs**. The name and narrative are inspired by Pierre de Fermat's marginal notes.

> **Status: testnet only, not audited.** Do not deposit funds you cannot afford to lose.

## 2. The Three Axioms

| Axiom | Name | Function |
|---|---|---|
| I | Wax Seal | The nullifier `Poseidon2(sk, ρ)` prevents double-spending; each note can be spent only once. |
| II | Folio Tree | The commitment `Poseidon3(value, label, precommitment)` enters a depth-20 Merkle tree (±1.05 million notes), with sublinear O(log N) proofs. |
| III | The Magistrate | A withdrawal must prove membership in an approved ASP root, so "dirty" funds stay separate from "clean" funds. |

## 3. Architecture and Flow

1. **Deposit**: the user sends ETH to `MarginaliaPool.sol` with a commitment + label.
2. **Screening**: the Magistrate screens the label and adds it to the ASP root buffer (`MagistrateRegister.sol`).
3. **Proving**: the user builds a Groth16 (BN254) proof in the browser (snarkjs): a Merkle proof + ASP inclusion + the Wax Seal.
4. **Withdraw**: the proof is sent directly or through the **Mersenne Courier** (a gasless relayer); the contract verifies the pairing, marks the nullifier as spent, then pays the recipient (amount − fee) and the relayer.

## 4. Cryptographic Primitives

- Curve **alt_bn128 (BN254)**
- **Poseidon** hash (circomlib)
- **Groth16** proof system (3-element verification)
- A 20-level Merkle tree with precomputed zero hashes (insert gas ±950k)

## 5. Compliance (ASP)

- **Rolling root buffer**: the last 16 ASP roots stay valid, so proofs do not break when the registry is updated.
- **Letter of Disclosure**: a selective-disclosure key derived from the viewing key for auditors, with no spending rights.
- **Automated Magistrate** (`services/magistrate/`): screens deposits (the OFAC list, the Chainalysis sanctions API, a list of exploit addresses), pins the approved list to IPFS, and publishes the root.
- **2-of-3 Safe governance**: the guardian can only pause *new deposits*; withdrawals and ragequit keep working.
- **Ragequit**: the original depositor can take their deposit back with a small Groth16 proof.

## 6. Mersenne Courier (Relayer)

- A new recipient does not need ETH for gas.
- `recipient` and `fee` are public circuit inputs, so the relayer cannot hijack the transaction.
- The fee is quoted from the 90th percentile of recent relay gas (+ headroom); the Courier is offered only when the wallet balance is sufficient (otherwise the API answers 503).

## 7. Web Application (Next.js front end, "Noirpay" design)

| Page | Route | Content |
|---|---|---|
| Landing | `/` | The three axioms, the Fermat narrative, a pipeline diagram, network telemetry. |
| Shielded Cockpit | `/app` | Deposit, in-browser proving, withdraw (wallet/Courier), ragequit, an encrypted note vault, crash recovery. |
| Codex | `/codex` | Cryptography documentation: BN254 algebra, the R1CS matrix, contract invariants. |
| Folio Explorer | `/explorer` | A Merkle leaf inspector, the nullifier registry, gas analytics. |
| Compliance Desk | `/compliance` | Screening policy, the appeals process, the Letter of Disclosure generator. |
| Ceremony | `/ceremony` | Public status of the Phase-2 trusted-setup ceremony. |

Latest hardening: a CSP, and pinned proving-asset hashes verified in the browser.

## 8. Tech Stack

Solidity 0.8.24 · Circom 2.1.x · Groth16/BN254 · Hardhat · Next.js (front end) · Supabase (Magistrate state) · IPFS (Pinata + public gateways) · Node.js ≥ 22.

## 9. Testing

- **250 tests** (`npx hardhat test`, no external network, ±5–6 minutes; 249 passing on 2026-10-11, one load-sensitive timing test passes in isolation).
- Coverage: the protocol, adversarial security, circuit audit (mutation of every input), *stateful fuzz*, the Magistrate service, browser vs Node SDK parity, the ceremony rehearsal, and the gas regression guard (deposit ≈945k, withdraw ≈1.07M, ragequit ≈321k).
- On-chain/browser suites (need a testnet key): Safe v1.4.1 governance, relayer health, headless-Chrome E2E. See `docs/test_report_2026-10-11.md`.

## 10. Repository Structure

| Directory | Content |
|---|---|
| `contracts/` | Solidity contracts (pool, register, verifiers) |
| `circuits/` | Circom circuits (withdraw, ragequit) |
| `frontend/` | The Next.js web application |
| `services/magistrate/` | The automated Magistrate worker |
| `asp/`, `lib/` | ASP logic and the SDK |
| `scripts/` | Deploy, governance, ceremony, audit |
| `supabase/` | Schema and migrations |
| `docs/` | Threat model, runbooks, phase reports, mainnet readiness |

## 11. Roadmap

| Phase | Status |
|---|---|
| 01 Prototype | Completed |
| 02 Testnet Alpha | Completed (deposit, proving, withdraw, ragequit, vault; verified on testnet) |
| 03 Hardening | **Active**: the automated Magistrate, IPFS, the Safe and relayer health are built and live on testnet; the soak gate (24 h) passed |
| 04 Audit & Ceremony | Upcoming: the toolkit and rehearsal are ready; the external audit and the public ceremony are not done |
| 05 Mainnet | Not started: **technically blocked** (`node scripts/mainnet-preflight.js`) |

## 12. Risks and Important Notes

- **The proving key is still a single-party (dev) setup**; `scripts/deploy.js` refuses the mainnet chain (4663) without ceremony transcripts.
- There is no external audit yet.
- The Magistrate is a separate hot key that the Safe can replace; it depends on external screening sources (fail-closed).
