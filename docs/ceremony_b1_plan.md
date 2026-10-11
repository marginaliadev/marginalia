# MARGINALIA: B1 Plan, the Public Phase-2 Trusted Setup Ceremony

**Status:** plan (not yet executed) · **Written:** 2026-10-11 · **References:** `docs/ceremony_guide.md`, `docs/mainnet_readiness.md` (B1, B2), `scripts/ceremony/`

## 1. Goal and completion criteria
Produce the proving key and verifier for `withdraw` and `ragequit` that cannot be forged **as long as at least one contributor is honest**. The setup in use today is a single-party development setup: whoever holds its "toxic waste" can forge proofs, so mainnet is unsafe until this ceremony is finished.

B1 is declared complete only if **all** of the following hold (some are enforced in code by `scripts/ceremony/mainnet-guard.js`):
1. >= 15 independent contributors per circuit (the `MIN_CONTRIBUTORS` limit in code), unique names, each contribution verified in the chain.
2. A public beacon (drand) from a round that was **announced before the last contributor submitted**, with >= 2^10 iterations.
3. Phase 1 (`powersOfTau28_hez_final_15.ptau`) pinned in `docs/ceremony/phase1.json` after matching it against independent sources (this is also B2).
4. The transcript passes `cli.js verify` run by **at least two independent parties** other than the coordinator, and the Solidity verifier in the repo is identical to the export of `final.zkey`.
5. All artefacts (r1cs, ptau, the zkey of every round, final.zkey, transcript, attestations) are published.

## 2. An order that must not be reversed
```
circuit audit (B4) -> fixes -> FREEZE circuits -> final O2 build (B3) -> ceremony (B1) -> redeploy (B5) -> final freeze (B6)
```
Any circuit change after the ceremony **voids** the ceremony (the r1cs changes). Therefore:
- **Recruitment and preparation may start now. Contribution rounds start only after the circuits are frozen** (audit findings fixed, r1cs hash locked in `docs/audit/manifest.json`).
- The ceremony runs for both circuits in **one session** per contributor: `withdraw` (≈ 6.7 MB per zkey on the O2 build) then `ragequit` (very small). Two separate chains, two transcripts.

## 3. Roles
| Role | Number | Tasks | Requirements |
|---|---|---|---|
| Coordinator | 1 (+1 backup) | init, send/receive zkeys, `verify-chain` every round, beacon, finalize, transcript, publication | **Not** the only contributor; must not keep any contributor's entropy |
| Contributor | **>= 15, target 20** (spares for failures or no-shows) | runs `contribute` on their own machine, sends the result, publishes the attestation | independent of each other and of the core team |
| Independent verifier | >= 2 | runs `verify` from the public files and reports the result openly | not the coordinator, not contributor 1 to 3 |
| Beacon guarantor | 1 | announces the beacon source (drand round) before the last round | public, verifiable by anyone |

**Contributor independence criteria** (mix as many as possible): different organisations, different countries/time zones, different devices and operating systems, not closely acquainted, at least 3 people outside the team and the project's immediate community (other ZK developers, security researchers, auditors, contributors of related projects).

## 4. Recruitment
**Candidate sources:** the Robinhood Chain and Orbit communities, known ZK/circom/snarkjs developers, security researchers, teams of other ZK projects that have run ceremonies, earlier contributors to public ceremonies, auditors not involved in this project's audit.

**Commitment asked of contributors** (about 30-60 minutes, once):
- A trusted machine, ideally freshly booted from a live USB, **offline** during the contribution.
- Node.js >= 22 and the project package (provided as a bundle, see 8).
- Publishing a public attestation (name, contribution hash, zkey hash) on a channel they control (tweet, signed gist).
- Deleting the entropy, shell history and temporary files afterwards.

**Recruitment lead time:** 6-8 weeks before the ceremony schedule; send invitations to ~35 people to obtain 20 commitments.

### Invitation template (ready to copy)
> Subject: Join the MARGINALIA trusted-setup ceremony (about 45 min)
>
> MARGINALIA is a zero-knowledge shielded pool for Robinhood Chain. Before mainnet we run a public Phase-2 trusted-setup ceremony: each contributor adds randomness to the proving key. The setup is secure as long as **at least one** participant is honest and discards their secret, so every additional independent contributor matters.
>
> What we ask: run one command on a machine you trust (ideally offline), send us the resulting ~7 MB file, publicly post your contribution hash, then delete your secret. Window: <dates>. Your slot: <24 h window>. Instructions: <link to docs/ceremony_guide.md section 2>.
>
> Testnet audit pack and the ceremony toolkit are public in the repository. Reply with your preferred name for the public record and a contact for slot reminders.

## 5. Logistics of the run
- **Sequential queue** (the chain cannot be parallelised): contributor N receives `000(N-1).zkey` only after the coordinator has verified that the previous round passed.
- **A 24-hour slot per contributor** (not 24 hours of work; only a window in which to appear). If a slot passes without a result, that contributor is skipped and recorded; the next contributor uses the last file that passed.
- **File storage and transfer:** a temporary object bucket (signed upload links, one link per slot) or a GitHub release. Every file is announced together with its SHA-256; the contributor matches the input zkey hash before working.
- **One round:** the coordinator sends the link and hash → the contributor runs `contribute` → sends the result and publishes the attestation → the coordinator runs `verify-chain` on the pair (before, after) → pass: continue; fail: reject and repeat with a spare slot.
- **Peak schedule:** 20 slots x about 1 effective hour + buffer = 1-3 calendar weeks (depending on availability; do not force a single day).
- Two circuits: for each slot, the contributor runs the command twice (`withdraw`, `ragequit`) in one session.

## 6. Beacon
1. Announce **in advance** a public randomness source that cannot be predicted and that anyone can verify: a specific drand round (League of Entropy; choose the chain and round number at announcement time, verify the value through the official drand sources) whose publication time is **after** the last contributor submits.
2. The announcement contains: the source, the round number, the expected publication time, and the number of iterations (10 means 2^10; larger is allowed).
3. After the round is published, fetch its value from >= 2 independent drand endpoints and compare, then run `cli.js beacon --hash <hex> --iterations 10`.
4. Why this matters: without an unpredictable beacon, the last contributor could choose their entropy after seeing everyone else's.

## 7. Phase 1 (B2, done at the start)

**Status 2026-10-11 (provisional, already pinned in `docs/ceremony/phase1.json`):** a 37,831,832-byte file from `circom.info`; blake2b-512 `982372c867d229c2…969ae6e` equals the hash published in the snarkjs README, and `snarkjs powersoftau verify` passes (54 contributions + beacon, 2^10 iterations). **Not enough yet:** only one publication to compare with. Add at least two more independent sources before the real ceremony, then change `status` to `VERIFIED`.

1. Download `powersOfTau28_hez_final_15.ptau` from the official Hermez/PSE source.
2. Match the hash (blake2b) **against at least three independent sources** (the official publication, the snarkjs repository, and other ceremonies that use the same file). Record the source addresses and the check date.
3. Fill in `docs/ceremony/phase1.json` (`blake2b`, `sources`). While `blake2b` is still `null`, the mainnet guard refuses to deploy.
4. Power 15 is enough: withdraw's 11,432 constraints and ragequit's 693 are far below 2^15 = 32,768.

## 8. What engineering prepares before the day
| # | Task | Notes |
|---|---|---|
| E1 ✅ | **Contributor bundle** (done: `scripts/ceremony/contribute.js`, standalone; needs `snarkjs` at a pinned version): a small package (the `contribute` script, a pinned Node version, checksums) with a one-step instruction page | lowers the barrier; reduces mistakes; the bundle hash is announced |
| E2 ✅ | **Coordinator script** (done: `scripts/ceremony/coordinator.js`: start, next, receive, skip, status, seal; `test/ceremony_coordinator.test.js`): slot queue, recording of incoming/outgoing hashes, automatic verification of every round, public log | built on `scripts/ceremony/lib.js`; the output is ready to publish |
| E3 ✅ | **Status page** (done: `frontend/src/app/ceremony/`, data from `coordinator.js publish` into `frontend/public/ceremony/status.json`; contributor contacts are never exported) on the site (`/ceremony`): contributor list, round status, hashes, attestation links, beacon countdown | transparency; makes third-party verification easy |
| E4 | **Re-run the clean rehearsal** on the final circuits (full chain, real proof, 6/6 without SKIP) and a green **CI `circuits-o2`** | exists for the current build; repeat after the freeze |
| E5 ✅ | **Public verification guide** (done: `docs/ceremony/VERIFY.md`, `scripts/ceremony/phase1-check.js`, `scripts/ceremony/check-deployed-verifier.js`) (one page: download the files, run `verify`, compare the verifier hash with the bytecode on chain) | so anyone can check without trusting us |
| E6 | **The mainnet guard** stays active; test that a forged or below-threshold transcript is refused (exists, 10 tests) | not weakened |

## 9. Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| A contributor does not show up / is slow | the schedule slips | 20 commitments for 15 slots, spare slots, a time limit per slot |
| A broken or malicious contribution | the chain fails | `verify-chain` every round; reject and repeat |
| All contributors controlled by one party | an insecure setup | independence criteria, three mandatory outsiders, public attestations |
| A cheating coordinator | a swapped zkey | public verification from the files and transcript; >= 2 independent verifiers |
| The last contributor decides the result | bias | a drand beacon announced in advance |
| The circuit changes after the ceremony | the ceremony is void | freeze before starting; the r1cs hash is locked in the manifest |
| A leak of a contributor's entropy | one dishonest contributor | one honest contributor is enough; never rely on one person |
| A lost file / no backup | start over | all intermediate files are stored and hashed in the public log |

## 10. Proposed schedule (relative to the circuit freeze = T0)
| Time | Activity |
|---|---|
| **Now** until T0 | pin Phase 1 (B2); recruitment (invitations to ~35, target 20 commitments); E1-E3, E5 |
| T0 minus 1 week | confirm the 20 slots; announce the schedule and the beacon source (a drand round after the last slot) |
| T0 | freeze the circuits, final O2 build, r1cs hash locked, final clean rehearsal (E4) |
| T0 to T0+3 weeks | contribution rounds (`withdraw` + `ragequit`) |
| Last contribution + 1-2 days | beacon (the announced round), finalize, transcript |
| + 3-7 days | independent verification by >= 2 parties, publication of every artefact |
| Afterwards | B5: redeploy the verifiers and pool, E2E with the final zkey |

## 11. Decisions needed from the owner
1. **Who is the coordinator** (and the backup)?
2. **The list of candidate contributors** and which of them are outside the team.
3. **The required attestation channel** (X, a GitHub gist, or another).
4. **The Phase-1 hash source** considered authoritative (for B2).
5. **The desired date range** (depends on the B4 audit schedule).
6. Whether the `/ceremony` page (E3) lives on the main site or a separate one.
