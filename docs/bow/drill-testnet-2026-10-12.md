# Incident drill on a throwaway 0xbow core (testnet)

This is rehearsal evidence for the emergency tools, run with the deployer EOA as owner. It does NOT exercise the Safe signing step, which must be rehearsed with the real signers (runbook section 6).

```
Drill on throwaway core: entrypoint 0xB85190DE0fF2351c93b6c9CD3D83Dce7f3B28A95, pool 0x35158e82b9F3483C6F92BAE5e08e73A69436ed2A, owner 0x673eF77ccb27e106769d2d56C536a4A0523B260E, run 2026-10-12T14:09:59.249Z
PASS D1 after the rotation the new key is the postman and the old one is not
PASS D2 the old postman can no longer publish a root  execution reverted (unknown custom error)
PASS D3 the new postman publishes the approved list (A and B, not C)
PASS D4 windDownPool marks the pool dead
PASS D5 a new deposit is refused after windDown (PoolIsDead)  execution reverted (unknown custom error)
PASS D6 the scope mapping is intact (relay can still find the pool)
PASS D7 ragequit of the unapproved deposit C works after windDown  gas 279696
PASS D8 a direct withdrawal of the approved deposit A works after windDown  gas 430425
PASS D9 a relayed withdrawal of the approved deposit B works after windDown, net of the fee  recipient got 29970000000000 wei, gas 504898
PASS D10 the pool is empty again: every deposit left through withdraw, ragequit or relay  balance 0 wei

10/10 passed
```
