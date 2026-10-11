// RPC provider with automatic fallback. The configured RPC(s) come first; the public Robinhood RPC is always
// appended as the last resort, so a dead or rate-limited provider does not take the app down.
import { ethers } from "ethers";

export const PUBLIC_RPC = "https://rpc.testnet.chain.robinhood.com";
const STALL_MS = 3000;

/** Ordered, de-duplicated URL list: configured (comma separated allowed) then the public RPC. */
export function rpcUrlList(configured: string | undefined, fallback: string = PUBLIC_RPC): string[] {
  const list = String(configured || "").split(",").map((u) => u.trim()).filter(Boolean);
  if (fallback && !list.includes(fallback)) list.push(fallback);
  return list;
}

export function buildProvider(urls: string[], chainId: number, stallTimeout = STALL_MS): ethers.AbstractProvider {
  // fixed network: no eth_chainId detection round trips (and no retry noise) on every request
  const mk = (u: string) => new ethers.JsonRpcProvider(u, chainId, { staticNetwork: true });
  if (urls.length === 1) return mk(urls[0]);
  // quorum 1: the first provider that answers wins; the next one is tried when it errors or stalls
  return new ethers.FallbackProvider(
    urls.map((u, i) => ({ provider: mk(u), priority: i + 1, weight: 1, stallTimeout })),
    chainId,
    { quorum: 1 },
  );
}

/**
 * Walk [from, to] with eth_getLogs-sized chunks. Starts at `chunk` and, when a range is refused (providers cap the block
 * range differently), divides the chunk by 10 down to `minChunk` and retries the SAME range, so an RPC with a generous
 * limit is fast and one with a 10-block cap still works. Every block is covered exactly once.
 */
export async function scanInChunks<T>(opts: {
  from: number; to: number; chunk: number; minChunk?: number; budgetMs?: number; budgetError?: string;
  fetchRange: (from: number, to: number) => Promise<T[]>;
}): Promise<T[]> {
  const minChunk = Math.max(1, opts.minChunk ?? 10);
  let chunk = Math.max(minChunk, opts.chunk);
  const started = Date.now();
  const out: T[] = [];
  let f = opts.from;
  while (f <= opts.to) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) throw new Error(opts.budgetError || "scan exceeded its time budget");
    const t = Math.min(f + chunk - 1, opts.to);
    try {
      out.push(...(await opts.fetchRange(f, t)));
      f = t + 1;
    } catch (e) {
      if (chunk <= minChunk) throw e;
      chunk = Math.max(minChunk, Math.floor(chunk / 10));
    }
  }
  return out;
}
