import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOME_DIR = path.join(os.homedir(), ".qss-desk");

/** Walks up from `start` looking for .qss-desk.json; returns its product code or null. */
export function detectProduct(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    const f = path.join(dir, ".qss-desk.json");
    if (fs.existsSync(f)) {
      try {
        const p = JSON.parse(fs.readFileSync(f, "utf8"))?.product;
        return typeof p === "string" && p.trim() ? p.trim() : null;
      } catch { return null; }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** A ticket is a folio (NEX-0012) or a numeric id. */
export function parseTicketRef(ref: string): string {
  const r = ref.trim();
  if (/^\d+$/.test(r)) return r;
  if (/^[A-Za-z0-9]{1,10}-\d{1,6}$/.test(r)) return r.toUpperCase();
  throw new Error(`Referencia de ticket inválida: "${ref}". Usa el folio (ej. NEX-0012) o el id numérico.`);
}

export function loadEnv() {
  const url = (process.env.QSS_DESK_URL ?? "").replace(/\/+$/, "");
  const key = process.env.QSS_DESK_AGENT_KEY ?? "";
  if (!url || !key) throw new Error("Faltan QSS_DESK_URL y/o QSS_DESK_AGENT_KEY en el entorno del MCP.");
  return { url, key };
}

/** USD per million tokens. Editable in ~/.qss-desk/prices.json: [{"match":"opus","input":..,"output":..,"cacheRead":..,"cacheWrite":..}] */
export type Price = { match: string; input: number; output: number; cacheRead: number; cacheWrite: number };
export const DEFAULT_PRICES: Price[] = [
  { match: "opus", input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  { match: "sonnet", input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  { match: "haiku", input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
];
export function loadPrices(): Price[] {
  try { const p = JSON.parse(fs.readFileSync(path.join(HOME_DIR, "prices.json"), "utf8")); if (Array.isArray(p)) return p; } catch { /* default */ }
  return DEFAULT_PRICES;
}
