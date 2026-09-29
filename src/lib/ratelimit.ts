// Rate limiter em memória (janela deslizante simples).
// Em produção com várias réplicas, troque por Redis (INCR + EXPIRE).
type Bucket = { count: number; reset: number };
const g = globalThis as typeof globalThis & { __rl?: Map<string, Bucket> };
const buckets = (g.__rl ??= new Map<string, Bucket>());

export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 20_000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}
