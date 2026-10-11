# Request for proposal: draft email and questions for audit firms

Send to 2-3 firms with ZK and Solidity experience (ask each whether they cover both, or propose two teams). Attach the bundle built by
`node scripts/audit/package.js` (note its SHA-256 in the mail) and `docs/audit/AUDITOR_PACKAGE.md`. Fill in the `<...>` fields first.

## Email (English)
**Subject:** Audit request: zero-knowledge shielded pool (Groth16 / circom + Solidity), Robinhood Chain, 3-4 week engagement

Hello <name>,

We are building MARGINALIA, a zero-knowledge shielded ETH pool with an association-set compliance model for Robinhood Chain. It runs on testnet today
and we plan a mainnet launch after an external audit and a public trusted-setup ceremony.

We would like a quote for **two reviews** (one firm with two teams is fine):
1. **Smart contracts:** two contracts, about 460 lines of Solidity 0.8.24 (`MarginaliaPool`, `MagistrateRegister`).
2. **ZK circuits and setup:** two circom circuits (withdraw: 11,432 constraints; ragequit: 693), the Groth16 trusted-setup procedure and the proof-to-contract bindings.

Everything is public: https://github.com/marginaliadev/marginalia. The bundle attached (`marginalia-audit-<commit8>.zip`, SHA-256 `<hash>`) contains the exact
scope, a cover note (trust model, invariants we want broken, internal findings, how to build and test in about 10 minutes), a circuit walkthrough and our
static-analysis triage. We have 230+ tests, a circuit mutation audit, a stateful fuzz and a ceremony rehearsal; we know these do not replace an audit.

Please tell us:
- your **availability and start date**, and whether you can deliver in **3-4 weeks**;
- the **fee** (fixed or by effort) and what it includes: first findings call, final report, a **fix-review round**, and permission to publish the report;
- the **team** (names/experience on Groth16, circom under-constrained-signal analysis, and BN254), and whether the same people review both parts;
- your process for private disclosure of critical findings and your preferred channel;
- whether you also review the **ceremony procedure** (we run a public Phase-2 ceremony with >= 15 contributors after the circuit freeze) and the transcript verification tooling.

Constraints you should know about: **testnet only today**; the circuits are frozen at the audit commit and changed only to fix findings; the committed proving keys come from a single-party development setup (our finding I-1, closed by the ceremony before mainnet).

Contact: <name>, <email>, <encrypted channel>. We reply within one business day.

Thank you,
<name>, <role>

## Questions to ask in the first call
1. Which circuit-analysis tools do you use (picus, ecne, circomspect, manual constraint review)? Do you attempt to produce witnesses that violate the intended relation?
2. How do you treat `context` being only squared inside the circuit (bound on-chain by `computeContext`)? Do you review the on-chain binding as part of the ZK scope?
3. Do you check the **final zkey against the verifier contract** (byte equality of the exported verifier)?
4. What is your policy on re-audit if the circuit changes after the first report?
5. Timeline: kickoff to first findings, to report, to fix review. What does a one-week slip cost?
6. Can you start within <N> weeks, and can the fix-review be scheduled in advance?

## Selection checklist (internal)
| Criterion | Weight |
|---|---|
| Published Groth16/circom reports (ask for two) | high |
| Same people on circuits and contracts, or two named teams | high |
| Start date and delivery in <= 4 weeks | high |
| Includes fix review and permission to publish | required |
| Willing to review ceremony procedure | medium |
| Price | medium |
