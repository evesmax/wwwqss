import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { sdAccounts, sdTickets, sdTicketEvents, sdTimeEntries, sdContacts } from "@shared/schema";
import { ticketKey } from "./ticketRules";
import type { ImportRow } from "./importRules";

export const MAX_IMPORT_ROWS = 2000;

export async function existingRefs(accountId: number, refs: string[]): Promise<Set<string>> {
  if (!refs.length) return new Set();
  const rows = await db.select({ r: sdTickets.importRef }).from(sdTickets).where(and(eq(sdTickets.accountId, accountId), inArray(sdTickets.importRef, refs)));
  return new Set(rows.map((x) => x.r!));
}

export async function importTickets(accountId: number, rows: ImportRow[], userId: number, o: { productId?: number | null } = {}) {
  const todo = rows.filter((r) => !r.skip);
  if (todo.length > MAX_IMPORT_ROWS) throw new Error(`Máximo ${MAX_IMPORT_ROWS} filas por importación`);
  const already = await existingRefs(accountId, todo.map((r) => r.externalRef).filter((x): x is string => !!x));
  const fresh = todo.filter((r) => !(r.externalRef && already.has(r.externalRef)));
  if (!fresh.length) return { imported: 0, alreadyImported: todo.length - fresh.length, ids: [] as number[] };
  const contacts = await db.select().from(sdContacts).where(eq(sdContacts.accountId, accountId));
  const findContact = (who: string | null) => who ? contacts.find((c) => c.email.toLowerCase() === who.toLowerCase() || c.name.toLowerCase() === who.toLowerCase())?.id ?? null : null;
  const now = new Date();
  const ids = await db.transaction(async (tx) => {
    const [acc] = await tx.update(sdAccounts).set({ ticketSeq: sql`${sdAccounts.ticketSeq} + ${fresh.length}` }).where(eq(sdAccounts.id, accountId)).returning();
    if (!acc) throw new Error("Cuenta no encontrada");
    const first = acc.ticketSeq - fresh.length + 1;
    const out: number[] = [];
    // Oldest first so folios follow the original chronology.
    const ordered = [...fresh].sort((a, b) => +(a.createdAt ?? now) - +(b.createdAt ?? now));
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      const created = r.createdAt ?? now;
      const requesterId = findContact(r.requester);
      const desc = [r.description, r.requester && !requesterId ? `Solicitante original: ${r.requester}` : ""].filter(Boolean).join("\n\n");
      const [t] = await tx.insert(sdTickets).values({
        accountId, seq: first + i, key: ticketKey(acc.ticketPrefix, first + i), type: r.type, productId: o.productId ?? null,
        requesterContactId: requesterId, title: r.title, description: desc, severity: r.severity, perceivedSeverity: r.perceivedSeverity,
        status: r.status, channel: "manual", slaApplicable: false, slaExclusionReason: "imported", importRef: r.externalRef, importFlags: r.flags,
        receivedAt: created, createdAt: created, updatedAt: r.resolvedAt ?? created, resolvedAt: r.resolvedAt, closedAt: r.closedAt,
      }).returning();
      await tx.insert(sdTicketEvents).values({ ticketId: t.id, at: created, actorType: "user", actorId: userId, kind: "created", detail: { channel: "import", imported: true, flags: r.flags, status: r.status } });
      if (r.hours) {
        let left = Math.round(r.hours * 60);
        const day = (r.resolvedAt ?? created).toISOString().slice(0, 10);
        while (left > 0) { const m = Math.min(left, 1440); await tx.insert(sdTimeEntries).values({ ticketId: t.id, userId, minutes: m, billable: true, workDate: day, note: "Importado" }); left -= m; }
      }
      out.push(t.id);
    }
    return out;
  });
  return { imported: ids.length, alreadyImported: todo.length - fresh.length, ids };
}
