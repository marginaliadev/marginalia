# Ceremony contributor recruitment (three versions)

## 1. Email invitation (personal, for known people)

**Subject:** Would you contribute to the MARGINALIA trusted-setup ceremony? (~45 min, once)

Hi <first name>,

I'm <your name> from MARGINALIA, a zero-knowledge shielded pool for Robinhood Chain. Before mainnet we run a public Phase-2 trusted-setup
ceremony for our two Groth16 circuits, and I'd love you to be one of the contributors<, because personal reason: e.g. you ran X's ceremony / you know circom well>.

**Why it matters.** Each contributor mixes secret randomness into the proving key and then deletes it. The setup is secure as long as
**at least one** contributor is honest, so every independent person makes it stronger, and people outside our team matter most.

**What we ask (about 45 minutes, once):**
1. When your 24-hour slot opens, download the file we send and check its SHA-256 against the value we announce.
2. On a machine you trust (ideally offline, e.g. a live USB), run one command twice — `withdraw` then `ragequit`:
   `node contribute.js --in <file> --out <out>.zkey --name "<your public name>" --expect-sha256 <announced hash>`
3. Send us the two output files (~7 MB and a few KB).
4. Post the contribution hashes it prints on a channel you control (X post or signed gist) and send us the link.
5. Delete the output, your shell history and anything temporary. We never see or keep your randomness.

**When.** The ceremony starts right after our external audit is fixed and the circuits are frozen; we expect it around <month range>.
Nothing is needed from you before we confirm dates at least one week ahead. If the slot doesn't suit you then, you can drop out without explanation.

**Everything is public:** live status at <https://marginaliazk.tech/ceremony>, toolkit and guides at
<https://github.com/marginaliadev/marginalia> (`docs/ceremony_guide.md`, `docs/ceremony/VERIFY.md`).

If you're in, reply with (a) the name you want in the public record, (b) your time zone, (c) the best contact for slot reminders.

Thanks,
<your name> · <role>, MARGINALIA

---

## 2. Short DM (X, Telegram, Discord)

Hi <name> — we're running a public trusted-setup ceremony for MARGINALIA (ZK shielded pool on Robinhood Chain) before mainnet. It's ~45 min
once: run one command on a machine you trust, post your contribution hash, delete your secret. One honest contributor makes it secure, so
independent people matter a lot. Dates follow our audit (likely <month range>). Interested? Details: https://marginaliazk.tech/ceremony

---

## 3. Public post (X @MarginaliaZK)

**Post 1/3**
MARGINALIA is heading to mainnet. Before that: a public trusted-setup ceremony for our Groth16 circuits.
We're looking for 20 independent contributors. ~45 min, once. 🧵

**Post 2/3**
How it works: you add secret randomness to the proving key on your own machine, publish your contribution hash, then delete the secret.
If even ONE contributor is honest, nobody can forge a proof — not even us.

**Post 3/3**
Especially welcome: ZK/circom devs, security researchers, people who joined other ceremonies, and anyone outside our community.
Slots open after our audit. Reply or DM to join. Everything is verifiable: https://marginaliazk.tech/ceremony
