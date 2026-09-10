const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;
const SWEEP_INTERVAL_MS = 5 * 60_000;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    hits.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}

// Periodically evict keys with no recent activity so the Map doesn't grow
// unbounded over the life of the process (one entry per distinct visitor IP).
const sweepTimer = setInterval(() => {
  const now = Date.now();
  hits.forEach((timestamps, key) => {
    const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) {
      hits.delete(key);
    } else if (fresh.length !== timestamps.length) {
      hits.set(key, fresh);
    }
  });
}, SWEEP_INTERVAL_MS);
sweepTimer.unref?.();
