# Outreach kit: audit request and ceremony recruitment (ready to send)

Every text here is ready to copy. Fields that must be replaced are marked `<...>`. Order of work:

| # | Send | To | File |
|---|---|---|---|
| 1 | Audit quote request | 3-4 firms (list below) | [`audit_email.md`](audit_email.md) |
| 2 | Ceremony contributor invitation (email/DM) | ~35 candidates for 20 commitments | [`contributor_invite.md`](contributor_invite.md) |
| 3 | Public recruitment post | X @MarginaliaZK, Robinhood Chain/Orbit communities | [`contributor_invite.md`](contributor_invite.md) section 3 |
| 4 | Candidate tracker | the coordinator | [`contributors_tracker.csv`](contributors_tracker.csv) |

## Before sending the audit email
1. On the machine where the bundle was built: `sha256sum .audit-build/marginalia-audit-<commit8>.zip` (build it with `node scripts/audit/package.js` from the latest commit) and paste the result into the email.
2. Make sure the audit commit is on GitHub (`git push`), because the auditors will compare the bundle with the repository.
3. Attach the bundle and `docs/audit/AUDITOR_PACKAGE.md`. If the bundle is > 10 MB, upload it as a GitHub release and send the link.

## Candidate audit firms (Groth16/circom + Solidity)
Check each firm's official contact page first; do not use addresses from third parties.

| Firm | Why relevant |
|---|---|
| Veridise | ZK focus, circom analysis tooling (Picus) |
| zkSecurity | ZK specialists, many circom/Groth16 reports |
| Trail of Bits | Solidity + cryptography, public reports |
| Zellic | Solidity + ZK |
| Nethermind Security | Solidity + ZK, also the L2 ecosystem |
| Least Authority | cryptography and ceremonies |

Send to at least 3 at once, record the send date, follow up after 5 business days. Choose with the selection table in `docs/audit/RFP_EMAIL.md`.

## Recruitment rules (from the B1 plan)
- At least 15 independent contributors per circuit (locked in code), target 20 commitments.
- At least 3 people who are truly outside the team and the project's immediate community.
- No slot dates are promised until the audit is done and the circuits are frozen; the invitation mentions an "estimated range".
- Contributor contacts are kept only by the coordinator (`contributors.json`, not committed); the public page never shows them.
