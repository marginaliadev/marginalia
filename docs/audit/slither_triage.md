# Slither triage (current code, 2026-10-09)

Command: `slither . --hardhat-ignore-compile --filter-paths "node_modules|Groth16Verifier|RagequitVerifier|mocks|TokenPool"` (after `npx hardhat clean && npx hardhat compile`; results from stale artefacts are not used). Analysed: 12 contracts, 102 detectors, **9 results, 0 High, 0 Medium**.

| Detector | Impact | Location | Decision |
|---|---|---|---|
| calls-loop (3 instances) | Low | `MarginaliaPool._h2` called from `_insert` (20-level tree) | **Accepted.** The call goes to a trusted, stateless `immutable` Poseidon contract; the loop is bounded to 20 iterations. Replacing it with inline Poseidon was measured to be no cheaper (spike H5: +4.5% gas) |
| cyclomatic-complexity | Info | `MarginaliaPool.withdraw` (13) | Accepted. All checks must run in sequence before the effects; splitting the function would make the checks-effects-interactions order harder to audit |
| low-level-calls | Info | `MarginaliaPool._send` | Accepted. ETH is sent with `call` by design; protected by `nonReentrant`, effects are written before the interaction, and the result is checked (`TransferFailed`) |
| naming-convention (4) | Info | parameters with a `_` prefix | Accepted (style) |

Note: the older report that listed `arbitrary-send-eth` (High) and `missing-zero-check` came from stale build artefacts; neither exists in the current code (the constructor and setters check for the zero address, and ETH is only sent to recipients bound to the proof).
