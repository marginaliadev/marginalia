# MARGINALIA web app (Next.js)

Browser terminal for the shielded pool on Robinhood Chain Testnet (46630). Everything that touches secrets
happens in the browser: note secrets, Poseidon hashing and Groth16 proving (snarkjs) never leave the page.

## Run

```bash
cp .env.example .env.local   # fill in what you need
npm install
npm run dev                  # use http://localhost:3000 (not 127.0.0.1) with `next dev`
```

## What works (all verified on testnet by `scripts/test-browser-e2e.js`)

| Tab | Behaviour |
|---|---|
| Deposit | Generates a note, sends `deposit()` from your wallet, shows and vaults the note |
| Private Withdraw | Rebuilds the Folio + ASP trees locally, checks both roots against the contracts, proves in-browser, submits via your wallet or the Courier. Partial withdrawals produce a change note |
| Mersenne Courier | Live fee quote; gasless withdrawals when `RELAYER_PRIVATE_KEY` is set |
| Emergency Exit | Ragequit by the original depositor wallet (small in-browser proof) |
| Encrypted Vault | EIP-712 signature derives an AES-256-GCM key; notes are stored encrypted in `localStorage` |

## Server routes

- `GET /api/folio`: leaves + approved labels, accepted only if they reproduce the pool's on-chain roots.
- `POST /api/folio/record`: indexes the leaves of a mined tx, read from the receipt (never from the body).
- `POST /api/relay/withdraw`: validates fee + simulates the proof, then relays.
- `POST /api/note/validate`, `POST /api/nullifier/check`, `GET /api/status`, `POST /api/relay/quote`, `POST /api/disclosure/generate`.

The chain is the source of truth. Supabase is an index and can be rebuilt with `node scripts/sync-folio.js`.

## Prover assets

`public/zk/` holds the circuit WASM and proving keys (copied from `../build`). Re-copy them after rebuilding circuits.
