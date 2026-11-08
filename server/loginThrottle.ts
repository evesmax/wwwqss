// Failed-attempt throttle: max 5 failures per key within 15 minutes.
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;

export class LoginThrottle {
  private fails = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}

  private recent(key: string): number[] {
    const t = this.now();
    const list = (this.fails.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
    if (list.length) this.fails.set(key, list); else this.fails.delete(key);
    return list;
  }
  isBlocked(key: string): boolean { return this.recent(key).length >= MAX_FAILURES; }
  recordFailure(key: string): void { const l = this.recent(key); l.push(this.now()); this.fails.set(key, l); }
  reset(key: string): void { this.fails.delete(key); }
}

export const loginThrottle = new LoginThrottle();
export const throttleKey = (ip: string | undefined, username: string) =>
  `${ip ?? "?"}|${String(username).trim().toLowerCase()}`;
