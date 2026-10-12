# Contribute to the MARGINALIA trusted-setup ceremony

This is the step-by-step guide for contributors. It takes about 45 minutes, once. You do not need to be a cryptographer.

> **Status.** This describes the planned ceremony. It starts only after the circuits are frozen (after the external audit).
> Do not contribute to any file that is not sent to you by the coordinator for your announced slot.
> Files from rehearsals are never part of the real ceremony.

## 1. What you are doing and why it matters

MARGINALIA uses Groth16 proofs. Their proving key must be generated with secret randomness ("toxic waste"). Whoever knows
all of that randomness could forge proofs and steal funds. To avoid trusting any single party, many people add their own
randomness to the key one after another.

- Your contribution is mixed into the key and **your secret is then thrown away**.
- The final key is secure if **at least one** contributor was honest and destroyed their secret. That can be you.
- You never reveal your secret to anyone, including us. Our tool generates it on your machine, uses it once and never writes it to disk.

You contribute to **two** circuits, one after the other, in the same session: `withdraw` (about 6.7 MB file) and `ragequit` (about 0.4 MB file).

## 2. What you will receive from the coordinator

For your slot you get, for each circuit:

1. A download link for the latest verified key file (for example `0007.zkey`).
2. The **SHA-256 of that file**, also announced publicly on <https://marginaliazk.tech/ceremony>.
3. The contribution tool `contribute.js` and its SHA-256, and the exact `snarkjs` version to use (`0.7.5`).
4. Your 24-hour slot window. (You only need to start inside the window; the work itself takes minutes.)

Never contribute to a file whose hash does not match the one announced publicly.

## 3. Choose your machine

Best, in order of preference:
1. A laptop booted from a fresh live USB (for example Ubuntu), with no accounts logged in.
2. Your normal computer that you trust, with no remote-access tools running.
3. Avoid shared servers, cloud shells and machines with screen recording or remote management software.

Requirements: Node.js 22 or newer (`node --version`), about 500 MB of free disk space, and about 2 GB of free memory.
Linux, macOS and Windows all work.

## 4. Prepare (online, before the contribution)

Do this step while connected, then go offline for step 5 if you can.

```bash
mkdir marginalia-ceremony && cd marginalia-ceremony
npm init -y
npm i snarkjs@0.7.5 --save-exact --ignore-scripts
```

Download `contribute.js` from the link in the coordinator's message and check its checksum.

```bash
# Linux / macOS
sha256sum contribute.js        # macOS: shasum -a 256 contribute.js
# Windows PowerShell
Get-FileHash contribute.js -Algorithm SHA256
```

The result must equal the value in the coordinator's message. Read the script if you like: it is about 40 lines and does one
thing (it calls `snarkjs.zKey.contribute` with 64 random bytes from your operating system).

Download the key files for both circuits and check each one:

```bash
sha256sum withdraw_0007.zkey ragequit_0007.zkey     # use the real file names you were given
```

Each hash must equal the announced one. If it does not, **stop** and tell the coordinator.

## 5. Contribute (offline if possible)

If you can, disconnect from the network now (Wi-Fi off, cable out). Then run the circuits in this order: `withdraw`, then `ragequit`.
Replace the file names and the hashes with the ones you were given.

```bash
node contribute.js \
  --in withdraw_0007.zkey \
  --out withdraw_0008.zkey \
  --name "Your Name Or Pseudonym" \
  --expect-sha256 <announced sha256 of withdraw_0007.zkey>
```

On Windows PowerShell write the command on one line (no `\`).

Optional: add your own randomness on top of the system randomness (it is only mixed in, it never replaces the system randomness):

```bash
--extra-entropy "any text you like, typed now and never reused"
```

When it finishes (usually under a minute) the tool prints a block like this:

```
==== PUBLISH THESE THREE VALUES ====
name              : Your Name Or Pseudonym
contribution hash : 12398c3d f75ab6ad ...
output sha256     : cf70d1ce2379...
====================================
```

Copy these three values into a text file (they are public, not secret). Then repeat for `ragequit`:

```bash
node contribute.js \
  --in ragequit_0007.zkey \
  --out ragequit_0008.zkey \
  --name "Your Name Or Pseudonym" \
  --expect-sha256 <announced sha256 of ragequit_0007.zkey>
```

You now have two new files: `withdraw_0008.zkey` and `ragequit_0008.zkey`, and two blocks of three values.

## 6. Send the files and publish your attestation

1. **Send the two output `.zkey` files** to the coordinator, using the upload link they gave you for your slot. Do not send the input files.
2. **Publish an attestation** on a channel you control, so your participation is publicly recorded. For example, an X post or a GitHub gist (signed if you can) containing:

```
I contributed to the MARGINALIA trusted-setup ceremony.
Circuit withdraw  - contribution hash: <...>   output sha256: <...>
Circuit ragequit  - contribution hash: <...>   output sha256: <...>
I generated my randomness on my own machine and destroyed it.
```

3. Send the link to your attestation to the coordinator. The ceremony status page lists it.

The coordinator verifies your file against the previous one before accepting it. If a check fails you will be told which one;
nothing is lost, and a spare slot is used.

## 7. Clean up (important)

Your secret was never written to disk, but remove everything else too:

```bash
# Linux / macOS
rm -f withdraw_0007.zkey withdraw_0008.zkey ragequit_0007.zkey ragequit_0008.zkey
history -c                      # clear shell history for this session
```

On Windows delete the files and close the PowerShell window. If you used a live USB, power off the machine and do not save anything.
Do **not** try to "save your entropy" anywhere. Not keeping it is the whole point.

## 8. After the ceremony: check that you are included

When the ceremony is finished, the coordinator publishes the transcript and all files. You can check yourself, without trusting anyone, that your
contribution hash is in the chain. Follow [`VERIFY.md`](VERIFY.md), or in short:

```bash
npx snarkjs zkey verify withdraw.r1cs powersOfTau28_hez_final_15.ptau final.zkey
```

The output lists every contribution with its name and hash. Find yours and compare it with the hash you published.

## 9. Troubleshooting

| Message | Meaning | What to do |
|---|---|---|
| `the input file does not match the hash the coordinator announced` | You have a different file than the one announced | Re-download. If it still differs, stop and contact the coordinator. Do not contribute. |
| `refusing to overwrite <file>` | The output name already exists | Choose a new output name or remove the old file. |
| `input file not found` | Wrong path or name | Check the folder with `ls` (or `dir`). |
| `Cannot find module 'snarkjs'` | Dependencies are not installed in this folder | Run the `npm i snarkjs@0.7.5` command from section 4 in the same folder. |
| Out of memory / very slow | Not enough RAM | Close other programs and retry the same step. Your slot is not lost. |
| The run was interrupted | The output file may be incomplete | Delete the partial output and run the same command again. A fresh run uses fresh randomness. |

Questions: team@marginaliazk.tech or @MarginaliaZK. Never send us your secret, a private key or a recovery phrase. We will never ask.

## 10. The rules the coordinator follows (so you know what to expect)

- One contributor at a time, strictly in order. Each round is verified before the next one starts.
- At least 15 independent contributors per circuit, then a public randomness beacon (a drand round announced in advance) closes the chain.
- At least two independent parties re-verify the transcript, and every file is published.
- The mainnet deployment script refuses to run without a valid transcript that meets these rules.
