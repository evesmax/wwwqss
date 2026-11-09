// Pure SDK auth helpers: HS256 JWT verification, context sanitising, CORS origin check, rate limiter. No I/O.
import crypto from "crypto";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mac = (data: string, secret: string) => crypto.createHmac("sha256", secret).update(data).digest("base64url");

export function signJwt(claims: object, secret: string, kid: string): string {
  const head = b64({ alg: "HS256", typ: "JWT", kid });
  const body = b64(claims);
  return `${head}.${body}.${mac(`${head}.${body}`, secret)}`;
}

export type SdkClaims = { sub: string; email: string; name?: string; tenant?: string; iat: number; exp: number };
export type Verified = { ok: true; claims: SdkClaims; kid: string } | { ok: false; error: string };
export const MAX_TOKEN_LIFETIME_S = 900;

export function verifyJwt(token: string, secretFor: (kid: string) => string | null, nowS = Math.floor(Date.now() / 1000)): Verified {
  const bad = (error: string): Verified => ({ ok: false, error });
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[2]) return bad("Token inválido");
  let head: any, claims: any;
  try { head = JSON.parse(Buffer.from(parts[0], "base64url").toString()); claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()); } catch { return bad("Token inválido"); }
  if (head?.alg !== "HS256" || typeof head.kid !== "string") return bad("Token inválido");
  const secret = secretFor(head.kid);
  if (!secret) return bad("Llave desconocida");
  const a = Buffer.from(mac(`${parts[0]}.${parts[1]}`, secret)), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return bad("Firma inválida");
  if (!claims || typeof claims !== "object") return bad("Token inválido");
  const { sub, email, iat, exp } = claims;
  if (typeof sub !== "string" || !sub || sub.length > 200) return bad("Falta sub");
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return bad("Correo inválido");
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) return bad("Faltan iat/exp");
  if (exp <= nowS) return bad("Token expirado");
  if (iat > nowS + 60) return bad("Token emitido en el futuro");
  if (exp - iat > MAX_TOKEN_LIFETIME_S) return bad("Vigencia máxima 15 minutos");
  return { ok: true, kid: head.kid, claims: { sub, email: email.toLowerCase(), name: typeof claims.name === "string" ? claims.name.slice(0, 200) : undefined, tenant: typeof claims.tenant === "string" ? claims.tenant.slice(0, 200) : undefined, iat, exp } };
}

export type Context = { url?: string; userAgent?: string; appVersion?: string; viewport?: string; locale?: string; consoleErrors?: string[] };
export function sanitizeContext(c: unknown): Context {
  if (!c || typeof c !== "object") return {};
  const o = c as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const out: Context = {};
  if (typeof o.url === "string") { try { const u = new URL(o.url); out.url = (u.origin + u.pathname).slice(0, 500); } catch { /* ignore */ } }
  const ua = s(o.userAgent, 300); if (ua) out.userAgent = ua;
  const av = s(o.appVersion, 50); if (av) out.appVersion = av;
  const vp = s(o.viewport, 30); if (vp) out.viewport = vp;
  const lc = s(o.locale, 20); if (lc) out.locale = lc;
  if (Array.isArray(o.consoleErrors)) out.consoleErrors = o.consoleErrors.filter((x) => typeof x === "string").slice(0, 20).map((x) => (x as string).slice(0, 500));
  return out;
}

export const originAllowed = (origin: string | undefined, allowed: string[]) => !!origin && allowed.includes(origin);

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  hit(key: string, now = Date.now()): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of Array.from(this.hits.entries())) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return true;
  }
}
