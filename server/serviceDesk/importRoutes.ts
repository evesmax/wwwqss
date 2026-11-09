import express, { type Express, type RequestHandler } from "express";
import { z } from "zod";
import { wrap, requireRole, accountOr404, type Req } from "./httpUtil";
import { writeAudit } from "./audit";
import { buildImportRows, parseCsv, suggestMapping, FLAG_LABEL, type Mapping } from "./importRules";
import { existingRefs, importTickets, MAX_IMPORT_ROWS } from "./importService";
import { TICKET_TYPES } from "./ticketRules";

const FIELDS = ["externalRef", "title", "description", "type", "severity", "status", "createdAt", "resolvedAt", "hours", "requester"] as const;
const mappingSchema = z.object(Object.fromEntries(FIELDS.map((f) => [f, z.string().max(200).optional()]))).strict();
const qSchema = z.object({ accountId: z.coerce.number().int().positive(), defaultType: z.enum(TICKET_TYPES).default("incident"), mapping: z.string().max(5000).optional() });

export function registerImportRoutes(app: Express, auth: RequestHandler[]) {
  const mgr = requireRole("owner", "support_manager");
  // Only exactly text/csv bodies are accepted: a cross-site HTML form cannot send that content type.
  const body = express.text({ type: "text/csv", limit: "3mb" });

  async function prepare(req: Req) {
    const q = qSchema.parse(req.query);
    if (typeof req.body !== "string" || !req.body.trim()) throw Object.assign(new z.ZodError([{ code: "custom", path: ["body"], message: "Archivo CSV requerido" }]));
    const csv = parseCsv(req.body);
    if (csv.rows.length > MAX_IMPORT_ROWS) throw Object.assign(new z.ZodError([{ code: "custom", path: ["body"], message: `Máximo ${MAX_IMPORT_ROWS} filas` }]));
    const given: Mapping | null = q.mapping ? (mappingSchema.parse(JSON.parse(q.mapping)) as Mapping) : null;
    const mapping = given ?? suggestMapping(csv.headers);
    for (const v of Object.values(mapping)) if (v && !csv.headers.includes(v)) throw new z.ZodError([{ code: "custom", path: ["mapping"], message: `Columna inexistente: ${v}` }]);
    return { q, csv, mapping, ...buildImportRows(csv.rows, mapping, { type: q.defaultType }) };
  }

  app.post("/api/desk/import/preview", ...auth, mgr, body, wrap(async (req, res) => {
    const p = await prepare(req);
    if (!(await accountOr404(req.actor, p.q.accountId, res))) return;
    const dup = await existingRefs(p.q.accountId, p.rows.filter((r) => !r.skip && r.externalRef).map((r) => r.externalRef!));
    const flagCounts: Record<string, number> = {};
    for (const r of p.rows) for (const f of r.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
    res.json({
      headers: p.csv.headers, mapping: p.mapping, summary: { ...p.summary, alreadyImported: dup.size },
      flags: Object.entries(flagCounts).map(([k, n]) => ({ flag: k, label: FLAG_LABEL[k] ?? k, count: n })),
      sample: p.rows.slice(0, 15).map((r) => ({ line: r.line, ref: r.externalRef, title: r.title, type: r.type, severity: r.severity ?? r.perceivedSeverity, status: r.status, createdAt: r.createdAt, flags: r.flags, skip: r.skip ?? null })),
    });
  }));

  app.post("/api/desk/import/commit", ...auth, mgr, body, wrap(async (req, res) => {
    const p = await prepare(req);
    if (!(await accountOr404(req.actor, p.q.accountId, res))) return;
    const r = await importTickets(p.q.accountId, p.rows, req.actor.userId);
    await writeAudit({ actorUserId: req.actor.userId, action: "tickets.import", entity: "account", entityId: String(p.q.accountId), detail: { ...r, ids: undefined, skipped: p.summary.skipped } });
    res.status(201).json({ imported: r.imported, alreadyImported: r.alreadyImported, skipped: p.summary.skipped, flagged: p.summary.flagged });
  }));
}
