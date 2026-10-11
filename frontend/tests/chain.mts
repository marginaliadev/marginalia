// Run with: node --experimental-strip-types tests/chain.mts  (prints JSON)
import { resolveChain } from "../src/lib/chain.ts";
const POOL = "0x" + "ab".repeat(20), REG = "0x" + "cd".repeat(20);
const t = resolveChain({});
const tOverride = resolveChain({ NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS: POOL, NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS: REG, NEXT_PUBLIC_RH_TESTNET_RPC_URL: "https://rpc.example", NEXT_PUBLIC_POOL_DEPLOY_BLOCK: "5" });
const tBad = resolveChain({ NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS: "not-an-address" });
const mBare = resolveChain({ NEXT_PUBLIC_CHAIN: "mainnet" });
const mHalf = resolveChain({ NEXT_PUBLIC_CHAIN: "mainnet", NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS: POOL, NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS: REG });
const mFull = resolveChain({ NEXT_PUBLIC_CHAIN: "mainnet", NEXT_PUBLIC_MARGINALIA_POOL_ADDRESS: POOL, NEXT_PUBLIC_MAGISTRATE_REGISTER_ADDRESS: REG, NEXT_PUBLIC_POOL_DEPLOY_BLOCK: "123456", NEXT_PUBLIC_RH_MAINNET_RPC_URL: "https://paid.example" });
const typo = resolveChain({ NEXT_PUBLIC_CHAIN: "Mainnet " }); // anything but the exact word stays on testnet
console.log(JSON.stringify({ t, tOverride, tBad, mBare, mHalf, mFull, typo }));
