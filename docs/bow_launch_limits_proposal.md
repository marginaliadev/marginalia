# Proposed launch limits for the 0xbow route (for the owner to approve or change)

**Status:** a proposal written by engineering. Every number below is a starting point that the owner must accept, change or reject.
Nothing in the contracts enforces any of it: the 0xbow core has no deposit cap and no pause, so these are **soft** limits (UI, relayer, operations).
Say so publicly. Do not call them a cap.

## 1. Why soft limits at all

The audited core has no cap, and we do not edit it. The protection at launch is therefore operational:
- a bug in the glue code (client, indexer, worker, relayer) is the realistic risk, and a bug can lock funds or divert new deposits;
- the Entrypoint is upgradeable by one multisig role, and there is no timelock at launch (so `windDown` takes minutes);
- the first weeks produce the evidence (real use, no incident) that justifies larger limits.

## 2. Proposed numbers

| Limit | Proposal | Reasoning |
|---|---|---|
| **Phase 0, owner only** | deposits by the owner and named testers only; total at most **0.05 ETH** | exercise every path on mainnet with money that can be lost; run the Courier once with your own funds before announcing |
| **Phase 1, public beta** | per deposit **0.001 - 0.05 ETH** (the pool minimum is 0.001 ETH); pool total soft limit **1 ETH** for the first 2 weeks | small enough that a glue-code bug is an embarrassment, not a catastrophe; large enough for real anonymity-set growth |
| **Phase 2** | raise the soft limit tenfold (10 ETH) after 2 weeks with no incident, no unexplained Magistrate lag and a clean pool invariant; a bug bounty exists | evidence-based raise; each raise is announced |
| **Timelock trigger (the owner decision S3 asks for)** | install a timelock in front of the Entrypoint owner when the pool balance exceeds **5 ETH** | at that size an upgrade-key compromise is worth stealing; the runbook changes then (windDown is delayed too, so the relayer must be switchable off instantly and the soft limit lowered as compensation) |
| **Relayer** | refuse a relay when the quoted fee would exceed the pool cap (already enforced), and when the withdrawal is below the amount the Courier can be repaid for (0.0006 ETH at 0.01 gwei) | already implemented in `/api/relay/bow` |
| **Courier wallet** | balance alert at **0.0005 ETH** (default), top up to about 0.01 ETH | one relay costs about 0.000006 ETH at 0.01 gwei |

All of these are numbers to be confirmed against the gas price on mainnet (not measured here: testnet gas is 0.01 gwei).

## 3. What must be true before each raise

- the pool invariant (`scripts/bow/verify-pool-invariant.mjs`) holds on mainnet;
- Magistrate lag stays below its alert (30 minutes) and the approved list verifies in the browser;
- no Courier failure that cost the Courier money;
- a named person watches the alerts (S9 asks for the name).

## 4. Wording the public page must keep

Amounts are public; there is no deposit cap and no pause; ragequit links your deposit to your wallet publicly; the entrypoint can be upgraded by the project multisig; a wind-down is permanent but keeps withdrawals open.

## 5. What the owner signs

`docs/bow/signoff.json`, entries `launchLimits` (this document, with any changes) and `ownerDecision` (including the TVL trigger above, or the number you choose instead).
