import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HOME_DIR, type Price } from "./config.js";

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; model: string };

/** Claude Code stores a project's transcripts in ~/.claude/projects/<cwd with / replaced by ->. */
export function transcriptDir(cwd: string) {
  return path.join(os.homedir(), ".claude", "projects", path.resolve(cwd).replace(/[^A-Za-z0-9]/g, "-"));
}

/** Sums assistant `usage` from JSONL transcript lines dated at/after `since`; de-duplicates streamed copies by message id. */
export function sumUsage(lines: Iterable<string>, since: Date): Usage {
  const seen = new Set<string>(); const u: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, model: "" };
  const models = new Map<string, number>();
  for (const line of lines) {
    let o: any; try { o = JSON.parse(line); } catch { continue; }
    const m = o?.message, us = m?.usage;
    if (!us || o.type !== "assistant" || !o.timestamp || new Date(o.timestamp) < since) continue;
    const id = m.id ?? o.uuid; if (id) { if (seen.has(id)) continue; seen.add(id); }
    u.input += us.input_tokens ?? 0; u.output += us.output_tokens ?? 0;
    u.cacheRead += us.cache_read_input_tokens ?? 0; u.cacheWrite += us.cache_creation_input_tokens ?? 0;
    if (m.model) models.set(m.model, (models.get(m.model) ?? 0) + (us.output_tokens ?? 0));
  }
  u.model = [...models.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).join(", ");
  return u;
}

export function estimateCost(u: Usage, prices: Price[]): number | null {
  const p = prices.find((x) => u.model.toLowerCase().includes(x.match.toLowerCase()));
  if (!p) return null;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}

export function readTranscriptLines(cwd: string): string[] {
  const dir = transcriptDir(cwd);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").split("\n"));
}

const MARKS = path.join(HOME_DIR, "marks.json");
export function getMark(key: string): Date | null {
  try { const v = JSON.parse(fs.readFileSync(MARKS, "utf8"))[key]; return v ? new Date(v) : null; } catch { return null; }
}
/** Saves the start mark the first time a ticket is opened; later opens keep it so effort stays cumulative. */
export function ensureMark(key: string, now = new Date()): Date {
  const cur = getMark(key); if (cur) return cur;
  let all: Record<string, string> = {}; try { all = JSON.parse(fs.readFileSync(MARKS, "utf8")); } catch { /* new */ }
  all[key] = now.toISOString();
  fs.mkdirSync(HOME_DIR, { recursive: true }); fs.writeFileSync(MARKS, JSON.stringify(all, null, 2));
  return now;
}
