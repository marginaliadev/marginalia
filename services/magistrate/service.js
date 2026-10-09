// Automated Magistrate (Fase 03 / H1): screens deposits, builds the approved-label list, pins it to IPFS and publishes its
// Merkle root on-chain. Dependencies are injected so the whole loop runs against a local chain in tests.
//
// Safety properties (each covered by test/magistrate_service.test.js):
//  - idempotent: an unchanged label set produces no transaction;
//  - rate limited: a new root is published at most every `minIntervalMs` (the register keeps only the last 16 roots, so
//    publishing too often would invalidate proofs users are still generating);
//  - deterministic: same label set -> same document bytes -> same CID, so a crash between "pin" and "publish" costs nothing;
//  - crash safe: state is written atomically and the chain is re-read before every publication;
//  - ragequit exclusion and live revocation: a ragequit deposit, or a depositor added to the denylist later, drops out of
//    the next list.
const aspStore = require("../../lib/aspStore");

const CONFIRMATIONS = 2; // blocks re-read on every scan so a shallow reorg cannot lose an event

class MagistrateService {
  constructor(o) {
    this.provider = o.provider;
    this.pool = o.pool; // read-only MarginaliaPool contract
    this.register = o.register; // MagistrateRegister connected to the publisher wallet
    this.M = o.M; // lib/marginalia.js
    this.store = o.store;
    this.policy = o.policy;
    this.pinners = o.pinners || [];
    this.chainId = o.chainId;
    this.deployBlock = o.deployBlock || 0;
    this.logChunk = o.logChunk || 10;
    this.minIntervalMs = o.minIntervalMs ?? 15 * 60_000;
    this.lagAlertMs = o.lagAlertMs ?? 30 * 60_000;
    this.minBalanceWei = o.minBalanceWei ?? 0n;
    this.gateways = o.gateways || null;
    this.now = o.now || (() => Date.now());
    this.log = o.log || (() => {});
    this.alert = o.alert || (async () => {});
    this.failures = 0;
    this.lastTickAt = null;
  }

  // ---------------------------------------------------------------- 1. read the chain
  async scan() {
    const st = this.store.state;
    const head = await this.provider.getBlockNumber();
    let from = st.cursor === null ? this.deployBlock : Math.max(this.deployBlock, st.cursor - CONFIRMATIONS);
    for (; from <= head; from += this.logChunk) {
      const to = Math.min(from + this.logChunk - 1, head);
      for (const ev of await this.pool.queryFilter(this.pool.filters.Deposited(), from, to)) {
        const label = ev.args.label.toString();
        if (!st.deposits[label]) {
          st.deposits[label] = { depositor: ev.args.depositor.toLowerCase(), value: ev.args.value.toString(), block: ev.blockNumber, order: ev.blockNumber * 1_000_000 + ev.index, decision: null, reason: null };
        }
      }
      for (const ev of await this.pool.queryFilter(this.pool.filters.Ragequit(), from, to)) {
        const label = ev.args.label.toString();
        if (!st.ragequit.includes(label)) st.ragequit.push(label);
      }
    }
    st.cursor = head;
    this.store.save();
    return head;
  }

  // ---------------------------------------------------------------- 2. screen
  async decide() {
    const st = this.store.state;
    const open = Object.entries(st.deposits).filter(([label]) => !st.ragequit.includes(label));
    const verdicts = await this.policy.screenAll(open.map(([label, d]) => ({ label, ...d })));
    open.forEach(([label, d], i) => {
      const v = verdicts[i];
      if (d.decision !== v.decision) {
        this.store.audit({ label, depositor: d.depositor, from: d.decision, to: v.decision, reason: v.reason });
        d.decision = v.decision;
        d.reason = v.reason;
      }
    });
    // a ragequit label is never approved again
    for (const label of st.ragequit) if (st.deposits[label] && st.deposits[label].decision !== "RAGEQUIT") {
      this.store.audit({ label, from: st.deposits[label].decision, to: "RAGEQUIT", reason: "depositor exited" });
      st.deposits[label].decision = "RAGEQUIT";
    }
    this.store.save();
  }

  approvedLabels() {
    return Object.entries(this.store.state.deposits)
      .filter(([, d]) => d.decision === "APPROVE")
      .sort((a, b) => a[1].order - b[1].order)
      .map(([label]) => label);
  }

  // ---------------------------------------------------------------- 3. publish
  /** One full cycle. Never throws for "nothing to do"; throws on infrastructure failure (caller counts failures). */
  async tick() {
    this.lastTickAt = this.now();
    await this.scan();
    await this.decide();

    const labels = this.approvedLabels();
    if (labels.length === 0) return { action: "noop", reason: "no approved labels" };
    const tree = await this.M.buildAspTree(labels.map(BigInt));
    const root = tree.root();
    const latest = BigInt(await this.register.latestRoot());
    const st = this.store.state;
    if (root === latest) { st.pendingSince = null; this.store.save(); return { action: "noop", reason: "root already published", root }; }

    if (!st.pendingSince) { st.pendingSince = this.now(); this.store.save(); }
    const last = st.lastPublish;
    if (last && this.now() - last.at < this.minIntervalMs) {
      return { action: "deferred", reason: `last publication ${Math.round((this.now() - last.at) / 1000)}s ago, minimum interval ${this.minIntervalMs / 1000}s`, root };
    }

    // deterministic document: generatedAt = timestamp of the newest deposit included
    const maxBlock = Math.max(...labels.map((l) => st.deposits[l].block));
    const generatedAt = new Date((await this.provider.getBlock(maxBlock)).timestamp * 1000);
    const doc = aspStore.buildDocument({
      chainId: this.chainId, register: await this.register.getAddress(), root, depth: this.M.ASP_DEPTH, labels, prevCid: last ? last.cid : null, now: generatedAt,
    });

    const pin = await aspStore.pinDocument(doc, this.pinners);
    if (!pin.redundant) await this.alert(pin.failed.length ? `ASP list pinned by only ${pin.pinnedBy.join(",")} (failed: ${pin.failed.map((f) => f.pinner).join(",")})` : `ASP list pinned by only ${pin.pinnedBy.join(",")}: configure a second IPFS provider for redundancy`);

    // re-read right before sending: another instance (or a previous run that crashed after the tx) may have published it
    if (BigInt(await this.register.latestRoot()) === root) return { action: "noop", reason: "published concurrently", root, cid: pin.cid };

    const tx = await this.register["publishRoot(uint256,string)"](root, `ipfs://${pin.cid}`);
    const receipt = await tx.wait();
    st.lastPublish = { root: root.toString(), cid: pin.cid, at: this.now(), tx: receipt.hash, labels: labels.length };
    st.pendingSince = null;
    this.store.save();
    this.store.audit({ event: "published", root: root.toString(), cid: pin.cid, labels: labels.length, tx: receipt.hash });
    this.log(`published root ${root} (${labels.length} labels) ipfs://${pin.cid} tx ${receipt.hash}`);

    // best effort: confirm the document is retrievable (IPFS propagation can lag; this only raises an alarm)
    try { await aspStore.loadVerified(`ipfs://${pin.cid}`, root, this.M, this.gateways ? { gateways: this.gateways } : undefined); }
    catch (e) { await this.alert(`published ipfs://${pin.cid} but it is not retrievable yet: ${e.message.slice(0, 120)}`); }
    return { action: "published", root, cid: pin.cid, tx: receipt.hash, labels: labels.length, redundant: pin.redundant };
  }

  /** tick() wrapped with failure accounting and alerts. */
  async safeTick() {
    try {
      const r = await this.tick();
      this.failures = 0;
      await this.checkHealthAlerts();
      return r;
    } catch (e) {
      this.failures++;
      this.log(`tick failed (${this.failures}): ${e.message}`);
      if (this.failures === 3) await this.alert(`Magistrate failed 3 ticks in a row: ${e.message.slice(0, 160)}`);
      return { action: "error", error: e.message };
    }
  }

  async checkHealthAlerts() {
    const st = this.store.state;
    if (st.pendingSince && this.now() - st.pendingSince > this.lagAlertMs) await this.alert(`approvals have been waiting ${Math.round((this.now() - st.pendingSince) / 60000)} min to be published`);
    const bal = await this.provider.getBalance(await this.register.runner.getAddress());
    if (bal < this.minBalanceWei) await this.alert(`publisher balance ${bal} wei is below the minimum ${this.minBalanceWei}`);
  }

  async status() {
    const st = this.store.state;
    const addr = await this.register.runner.getAddress();
    return {
      ok: this.failures < 3,
      publisher: addr,
      balanceWei: (await this.provider.getBalance(addr)).toString(),
      lastTickAt: this.lastTickAt,
      lastPublish: st.lastPublish,
      deposits: Object.keys(st.deposits).length,
      approved: this.approvedLabels().length,
      lagMs: st.pendingSince ? this.now() - st.pendingSince : 0,
      failures: this.failures,
    };
  }
}

module.exports = { MagistrateService, CONFIRMATIONS };
