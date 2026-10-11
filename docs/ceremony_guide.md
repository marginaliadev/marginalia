# MARGINALIA: Phase-2 Trusted Setup Ceremony Guide

Goal: produce a *proving key* and verifier that cannot be forged **as long as at least one contributor is honest**. The setup in use today (`scripts/build-circuit.sh`) is for testnet only: a single party holds the "toxic waste" and can forge proofs. Mainnet is **blocked** by `scripts/ceremony/mainnet-guard.js` until this ceremony is complete.

Tooling: `node scripts/ceremony/cli.js help`. Every step has been rehearsed with an automated dry run (`test/ceremony_rehearsal.test.js`, `scripts/ceremony/rehearsal.js`).

## 0. Prerequisites (once, by the coordinator)
1. The circuits are **frozen** (audit findings fixed). Compile with the pinned **`--O2`** option: `node -e 'require("./scripts/ceremony/compile").compileCircuit("withdraw")'` (output `.audit-build/withdraw.r1cs`). circom2 defaults to `--O1`, which produces a different circuit; never rely on a compiler default.
2. **Phase 1**: use the public Hermez/PSE Powers of Tau (`powersOfTau28_hez_final_15.ptau`; power 15 is enough for withdraw's 11,432 constraints). Download it from the official source, match its hash against **several independent sources**, then fill in `docs/ceremony/phase1.json` (`blake2b`). Compute the hash with `node -e 'require("./scripts/ceremony/lib").hashFile("file.ptau").then(console.log)'`.
3. Recruit **at least 15 independent contributors** (fixed in code: `MIN_CONTRIBUTORS`), ideally from different organisations, plus at least one person who is not part of the team. Send them the guide in section 2.
4. Announce the **beacon source** in advance: the drand round number (or future block) that will serve as the public randomness.

## 1. Coordinator: running the ceremony (per circuit: `withdraw`, then `ragequit`)
```bash
# zkey #0 (deterministic: anyone can recompute it and compare hashes)
node scripts/ceremony/cli.js init --r1cs .audit-build/withdraw.r1cs --ptau powersOfTau28_hez_final_15.ptau --out ceremony/withdraw/0000.zkey

# for each contributor N: send 000(N-1).zkey, receive 000N.zkey, then verify IMMEDIATELY
node scripts/ceremony/cli.js verify-chain --r1cs .audit-build/withdraw.r1cs --ptau powersOfTau28_hez_final_15.ptau \
  --files ceremony/withdraw/0000.zkey,ceremony/withdraw/0001.zkey
# (reject failing contributions; the next contributor uses the last file that PASSED)

# after the last contributor: seal with the beacon announced in advance
node scripts/ceremony/cli.js beacon --in ceremony/withdraw/0015.zkey --out ceremony/withdraw/final.zkey --hash <drand hex> --iterations 10

# export the verification key + verifier contract
node scripts/ceremony/cli.js finalize --zkey ceremony/withdraw/final.zkey --out ceremony/withdraw/out --circuit withdraw --contract Groth16Verifier
```
Then write `ceremony/withdraw/ceremony.json` (example format below) and produce the transcript:
```bash
node scripts/ceremony/cli.js transcript --config ceremony/withdraw/ceremony.json --out ceremony/withdraw/transcript.json
```
```json
{
  "circuit": "withdraw",
  "r1cs": "../../.audit-build/withdraw.r1cs",
  "ptau": "../../powersOfTau28_hez_final_15.ptau",
  "ptauSource": "Hermez/PSE powersOfTau28_hez_final_15.ptau (https://...)",
  "rounds": [
    { "contributor": "Contributor Name", "file": "0001.zkey", "contributionHash": "<hash from the contributor>", "attestation": "https://... (signed tweet/gist)" }
  ],
  "beacon": { "hash": "<drand hex>", "source": "drand round 1234567", "iterationsExp": 10, "contributionHash": "<from the beacon output>" },
  "finalZkey": "final.zkey",
  "finalization": { "vkeyHash": "<from finalize>", "verifierHash": "<from finalize>", "contractName": "Groth16Verifier" }
}
```

## 2. Contributor
Standalone tool (only Node >= 22 and `snarkjs` are needed): `node scripts/ceremony/contribute.js --in 0003.zkey --out 0004.zkey --name "Your Name" --expect-sha256 <hash announced by the coordinator>`. The coordinator uses `scripts/ceremony/coordinator.js` (start, next, receive, skip, status, seal), which verifies every round before accepting it. After each `receive`, `skip` or `seal`, run `node scripts/ceremony/coordinator.js publish --dirs ceremony/withdraw,ceremony/ragequit --out frontend/public/ceremony/status.json --meta ceremony/meta.json` and deploy the site, so that the `/ceremony` page is updated.
Do this on a machine you trust (ideally offline and clean, for example a live USB):
```bash
node scripts/ceremony/cli.js contribute --in 0003.zkey --out 0004.zkey --name "Your Name"
```
The output contains your **contribution hash** and the file hash. (1) Send `0004.zkey` to the coordinator, (2) **publish** your name + contribution hash on a public channel you control (attestation), (3) delete the files and your shell history, and power the machine off. The entropy is 64 random bytes; you may add `--entropy "your own random sentence"`. Never reuse entropy and never store it: its secrecy is what guarantees the security.

## 3. Anyone: verifying the result (without trusting the coordinator)
Only public files are needed: r1cs, ptau, `final.zkey`, `transcript.json`, the verifier contract.
```bash
node scripts/ceremony/cli.js verify --transcript transcript.json --r1cs withdraw.r1cs --ptau powersOfTau28_hez_final_15.ptau \
  --zkey final.zkey --verifier Groth16Verifier.sol --min 15 --ptau-hash <Phase 1 hash from an independent source>
```
The result is a list of PASS/FAIL lines. What is checked: the r1cs/ptau/zkey hashes, that the zkey is valid for the circuit and the ptau, that every announced contribution is inside the zkey **in the same order**, that contributor names are unique, the minimum count, that the beacon is the **last** contribution with ≥ 2^10 iterations and equals the announced value, and that the re-exported verification key and Solidity contract are exactly the ones published.
Then check that `contracts/Groth16Verifier.sol` in the repository is **identical** to the file above, and that the bytecode deployed on chain is the same.

## 4. After the ceremony
1. Copy `final.zkey` and the `--O2` wasm to `build/` and `frontend/public/zk/`; copy the verifier into `contracts/`.
2. Deploy the new verifier + pool (verifiers are immutable); connect the register through the Safe; update the env and `deployments/`.
3. Run the full test suite and the browser E2E. A proof from the old development zkey must be rejected (`test/ceremony_rehearsal.test.js`, D-TEST6).
4. Publish the transcript, the final zkey, the attestations and this verification guide. Mainnet deploy: `CEREMONY_WITHDRAW_TRANSCRIPT=... CEREMONY_RAGEQUIT_TRANSCRIPT=... npx hardhat run scripts/deploy.js --network robinhood` (the guard refuses if any requirement is not met).

## Honest limits
- The rehearsal uses a development ptau (not secure); it proves the **workflow**, not the security of a real setup.
- Real security depends on real, independent and honest contributors (at least one) and on a beacon that cannot be predicted when the last contributor chooses their entropy.
- Proofs with a real withdraw witness for the O2 circuit need the native `circom` compiler (circom2/WASM cannot write a witness generator). The pinned `circom` is installed in CI (job `circuits-o2`).
