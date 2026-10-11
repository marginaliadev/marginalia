# Verify the MARGINALIA trusted setup yourself

You do not need to trust the MARGINALIA team, the ceremony coordinator, or this website. With the public files and about 30 minutes,
you can check that the proving keys came from the announced contributors, that a public beacon closed the ceremony, and that the
verifier contracts on Robinhood Chain are exactly the ones exported from that ceremony.

Live status of the ceremony: <https://marginaliazk.tech/ceremony>. Background and the full plan: [`docs/ceremony_b1_plan.md`](../ceremony_b1_plan.md).

## What you need
- Node.js 22 or newer, `git`, and about 300 MB of disk.
- The pinned native `circom` 2.2.3 only if you want to rebuild the circuits from source (step 3; recommended).
- An RPC endpoint for Robinhood Chain (step 6).

```bash
git clone https://github.com/marginaliadev/marginalia && cd marginalia
git checkout <release tag published with the transcript>
npm ci
```

## 1. Check the Phase-1 file (Powers of Tau)
The ceremony builds on the public Hermez/PSE file `powersOfTau28_hez_final_15.ptau`. Download it from **any** mirror and compare its
hash with the pin in [`docs/ceremony/phase1.json`](phase1.json) **and** with a publication you trust (for example the table of prepared
files in the [snarkjs README](https://github.com/iden3/snarkjs#7-prepare-phase-2)).

```bash
node scripts/ceremony/phase1-check.js --defaults          # downloads from every known origin and compares
# or, with a file you already have:
node scripts/ceremony/phase1-check.js --file powersOfTau28_hez_final_15.ptau
```
Expected blake2b-512: `982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e`
(37,831,832 bytes). Optionally run `npx snarkjs powersoftau verify powersOfTau28_hez_final_15.ptau`: it must end with `Powers of Tau Ok!`
and report the Hermez beacon `e586fccaf245c9a1…235aa372` (drand round 100000, as published in
[Hermez's own verification notes](https://github.com/hermeznetwork/phase2ceremony_4/blob/main/VERIFY.md)).

## 2. Download the ceremony artefacts
From the release attached to the tag, for each circuit (`withdraw`, `ragequit`): `final.zkey`, `transcript.json`, the exported verifier
(`Groth16Verifier.sol` / `RagequitVerifier.sol`) and, if you want to replay every step, all intermediate `0000.zkey … 00NN.zkey`.
Compare the SHA-256 of each file with the value shown on the status page and in the transcript.

## 3. Rebuild the circuits (recommended)
The ceremony is bound to one exact constraint system. Rebuild it from the tagged sources with the pinned compiler flags and compare:
```bash
node -e 'console.log(require("./scripts/ceremony/compile").compileCircuit("withdraw"))'
node -e 'console.log(require("./scripts/ceremony/compile").compileCircuit("ragequit"))'
```
The r1cs hashes must equal those in `transcript.json` and in `docs/audit/manifest.json`. (You may instead use the r1cs from the release;
the next step checks the zkey against whichever r1cs you give it.)

## 4. Verify each transcript
```bash
node scripts/ceremony/cli.js verify --transcript withdraw/transcript.json --r1cs .audit-build/withdraw.r1cs \
  --ptau powersOfTau28_hez_final_15.ptau --zkey withdraw/final.zkey --verifier withdraw/Groth16Verifier.sol \
  --min 15 --ptau-hash 982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e
```
Repeat for `ragequit` with `RagequitVerifier.sol`. Every line must read PASS and the last line `TRANSCRIPT VERIFIED`. It checks that:
- the zkey is valid for that r1cs and that Phase-1 file;
- every announced contribution is inside the zkey, **in the announced order**, under unique names, and there are at least 15;
- the beacon is the **last** contribution, uses at least 2^10 iterations, and equals the announced value;
- the verification key and the Solidity verifier re-exported from `final.zkey` are byte-identical to the published ones.

## 5. Check the beacon and the attestations
- **Beacon.** The status page and the announcement name a drand round that was announced **before** the last contribution. Fetch that
  round from two independent drand endpoints (for example `https://api.drand.sh` and `https://drand.cloudflare.com`), check both agree,
  and check the value equals `beacon.hash` in the transcript. Check the announcement's timestamp is earlier than the last round's.
- **Attestations.** For a few contributors (ideally ones you know), open their public post and check the contribution hash they posted
  equals the one in the transcript. One honest contributor is enough for the setup to be secure.

## 6. Check the deployed verifiers
The verifier contracts are immutable. Compile the tagged sources and compare with the code at the published addresses:
```bash
npx hardhat compile
node scripts/ceremony/check-deployed-verifier.js --rpc <robinhood rpc> --address <verifier address> --contract Groth16Verifier
node scripts/ceremony/check-deployed-verifier.js --rpc <robinhood rpc> --address <ragequit verifier address> --contract RagequitVerifier
```
Both must print `executable code: MATCH`. Then check `contracts/Groth16Verifier.sol` and `contracts/RagequitVerifier.sol` at the tag are
identical to the verifiers from step 2 (`diff`).

## 7. Report what you found
Please post your result publicly (a gist or a post: the tag, the hashes you checked, PASS/FAIL) and send us the link; independent
verification reports are published next to the transcript. If anything fails, report it the same way: a public failure report is
exactly what this process is for.
