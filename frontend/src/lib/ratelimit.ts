// Minimal in-memory per-IP limiter for the mutating / heavy API routes (single instance).
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(req: Request, bucket: string, max = 30, windowMs = 60_000): boolean {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : "local") || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now > e.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    e.count++;
  }
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  return (hits.get(key)?.count ?? 0) > max;
}
