// Run with: node --experimental-strip-types tests/bow-relay.mts  (prints JSON for test/bow_relay.test.js)
import * as R from "../src/lib/bow-relay.ts";
const E = "0x" + "e1".repeat(20), RELAYER = "0x" + "a2".repeat(20), RECIP = "0x" + "b3".repeat(20);
const price = 10_000_000n; // 0.01 gwei
const gas = BigInt(R.BOW_DEFAULT_GAS);
const value = 800_000_000_000_000n; // 0.0008 ETH
const out: any = {};
out.cost = R.relayCostWei(gas, price).toString();
out.minBps = R.minRelayFeeBps(value, gas, price, 100n)?.toString() ?? null;
out.covers = R.relayFeeWei(value, R.minRelayFeeBps(value, gas, price, 100n)!) >= R.relayCostWei(gas, price);
out.tiny = R.minRelayFeeBps(1_000n, gas, price, 100n); // far too small to pay for gas
out.highGas = R.minRelayFeeBps(value, gas, 10_000_000_000n, 100n); // 10 gwei: 1% cap is not enough
out.zero = R.minRelayFeeBps(0n, gas, price, 100n);
out.feeFloor = R.relayFeeWei(999n, 100n).toString(); // floor, like the contract
out.tolerance = { exact: R.feeCoversExactCost(R.relayCostWei(490_000n, price), 490_000n, price), at91: R.feeCoversExactCost((R.relayCostWei(490_000n, price) * 91n) / 100n, 490_000n, price), at89: R.feeCoversExactCost((R.relayCostWei(490_000n, price) * 89n) / 100n, 490_000n, price), priceDoubled: R.feeCoversExactCost(R.relayCostWei(490_000n, price), 490_000n, price * 2n) };
const data = R.encodeRelayData(RECIP, RELAYER, 100n);
out.roundTrip = R.decodeRelayData(data);
out.roundTrip.relayFeeBps = out.roundTrip.relayFeeBps.toString();
const signals = Array(8).fill("1"); signals[2] = value.toString();
const good = { withdrawal: { processooor: E, data }, proof: { pA: ["1", "2"], pB: [["1", "2"], ["3", "4"]], pC: ["1", "2"], pubSignals: signals }, scope: "7" };
const v = (b: any) => { const r: any = R.validateBowRelayPayload(b, E, RELAYER); return r.error ? { error: r.error } : { ok: true, recipient: r.recipient, bps: r.relayFeeBps.toString(), value: r.withdrawnValue.toString() }; };
out.valid = v(good);
out.wrongProcessooor = v({ ...good, withdrawal: { ...good.withdrawal, processooor: RECIP } });
out.wrongFeeRecipient = v({ ...good, withdrawal: { processooor: E, data: R.encodeRelayData(RECIP, RECIP, 100n) } });
out.zeroRecipient = v({ ...good, withdrawal: { processooor: E, data: R.encodeRelayData("0x" + "00".repeat(20), RELAYER, 100n) } });
out.badSignals = v({ ...good, proof: { ...good.proof, pubSignals: signals.slice(0, 6) } });
out.badData = v({ ...good, withdrawal: { processooor: E, data: "0x1234" } });
out.hugeData = v({ ...good, withdrawal: { processooor: E, data: "0x" + "ab".repeat(500) } });
out.noScope = v({ ...good, scope: "abc" });
console.log(JSON.stringify(out));
