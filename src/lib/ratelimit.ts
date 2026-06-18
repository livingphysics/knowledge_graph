// Dead-simple in-memory sliding-window rate limiter. Per Node process; fine for a
// single-instance deployment. Not shared across replicas.

declare global {
  // eslint-disable-next-line no-var
  var __rl: Map<string, number[]> | undefined;
}

/**
 * Returns true if the action is allowed for `key`, recording the hit. Returns
 * false if `key` has already used up `limit` hits within `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  if (!global.__rl) global.__rl = new Map();
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (global.__rl.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    global.__rl.set(key, hits); // persist the pruned list
    return false;
  }
  hits.push(now);
  global.__rl.set(key, hits);
  return true;
}
