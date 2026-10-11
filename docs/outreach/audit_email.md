# Audit request email (send to 3-4 firms)

**Subject:** Audit request: ZK shielded pool (Groth16 / circom + Solidity) on Robinhood Chain — quote and earliest start

---

Hello <first name>,

I'm <your name>, <role> at MARGINALIA, a zero-knowledge shielded ETH pool with an association-set compliance model for Robinhood Chain
(an Arbitrum Orbit L2). It runs on testnet today. Mainnet waits on two things: an external audit, then a public Phase-2 trusted-setup
ceremony on the frozen circuits. Your start date therefore sets our launch date, so availability matters as much as price.

**Scope (one firm with two teams is fine):**
1. **Smart contracts** — `MarginaliaPool` and `MagistrateRegister`, about 460 lines of Solidity 0.8.24.
2. **ZK circuits and setup** — circom circuits `withdraw` (11,432 constraints) and `ragequit` (693), the proof-to-contract bindings,
   and the Groth16 ceremony procedure and transcript-verification tooling.

**Materials:** repository <https://github.com/marginaliadev/marginalia>, audit commit `1fa8c667`. Bundle attached:
`marginalia-audit-1fa8c667.zip`, SHA-256 `<sha256 of the zip>`. It contains the exact scope, a cover note (trust model, invariants we want
broken, our internal findings, a 10-minute build-and-test path), a circuit walkthrough and our Slither triage. We have 230+ tests, a
31-case circuit mutation audit, a stateful invariant fuzz and a ceremony rehearsal; we know none of that replaces an audit.

**Please tell us:**
- earliest start date and whether 3-4 weeks to a final report is realistic;
- fee (fixed or by effort) and what it includes: findings call, final report, one fix-review round, permission to publish;
- the people on each part and their Groth16 / circom (under-constrained signals) / BN254 experience — two published reports would help;
- whether you review the ceremony procedure and the final-zkey-to-verifier binding;
- your private channel for critical findings.

**Things you should know up front:** testnet only; circuits are frozen at the audit commit and change only to fix findings; the proving
keys currently deployed come from a single-party development setup (our finding I-1), which the public ceremony replaces before mainnet.

We reply within one business day. If it's easier, I'm happy to do a 30-minute scoping call this week: <calendar link or two time slots with time zone>.

Thank you,
<your name>
<role>, MARGINALIA · <email> · <Signal/Telegram or PGP key>
