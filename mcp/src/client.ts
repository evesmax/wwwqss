export class Api {
  constructor(private url: string, private key: string) {}
  async call<T = any>(method: "GET" | "POST", p: string, body?: unknown): Promise<T> {
    const r = await fetch(`${this.url}/api/v1/agent${p}`, {
      method, headers: { Authorization: `Bearer ${this.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      let m = r.statusText; try { m = (await r.json()).message ?? m; } catch { /* keep */ }
      throw new Error(`QSS ${r.status}: ${m}`);
    }
    return (await r.json()) as T;
  }
  async raw(p: string) {
    const r = await fetch(`${this.url}/api/v1/agent${p}`, { headers: { Authorization: `Bearer ${this.key}` } });
    if (!r.ok) throw new Error(`QSS ${r.status}`);
    return { mime: r.headers.get("content-type") ?? "application/octet-stream", data: Buffer.from(await r.arrayBuffer()) };
  }
}
