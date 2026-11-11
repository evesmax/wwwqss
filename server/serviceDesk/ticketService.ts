import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sdAccounts, sdTickets, sdTicketEvents, sdTicketComments, sdTimeEntries, sdContacts, sdInstances,
} from "@shared/schema";
import { accountProductMap, loadActor, visibleAccountIds } from "./access";
import { sendEmail } from "./emailService";
import { refreshSoon } from "./slaService";
import { ackEmail, commentEmail, statusEmail } from "./emailTemplates";
import {
  initialStatus, ticketKey, validateSeverity, validateTransition, timestampsFor,
  type P0Questionnaire, type Rca,
} from "./ticketRules";

export type Who = { type: "user" | "contact"; id: number };
export class TicketError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL || "https://qsoftwaresolutions.com").replace(/\/+$/, "");
const portalLink = (id: number) => `${publicBaseUrl()}/portal/tickets/${id}`;

async function addEvent(tx: Tx, ticketId: number, who: Who | { type: "system"; id?: null }, kind: string, detail: Record<string, unknown> = {}) {
  await tx.insert(sdTicketEvents).values({ ticketId, actorType: who.type, actorId: who.id ?? null, kind, detail });
}

export type CreateInput = {
  accountId: number; type: string; title: string; description?: string; productId?: number | null; instanceId?: number | null;
  requesterContactId?: number | null; channel: string; environment?: string; moduleArea?: string;
  perceivedSeverity?: string | null; severity?: string | null; p0?: Partial<P0Questionnaire> | null;
  receivedAt?: Date | null; sharedWithAccount?: boolean;
};

export async function createTicket(input: CreateInput, who: Who, opts: { notify?: boolean } = {}) {
  const sev = validateSeverity(input.type, input.severity, input.p0);
  if (!sev.ok) throw new TicketError(sev.error);
  let productId = input.productId ?? null;
  const pm = await accountProductMap();
  if (input.instanceId) {
    const [inst] = await db.select().from(sdInstances).where(and(eq(sdInstances.id, input.instanceId), eq(sdInstances.accountId, input.accountId)));
    if (!inst) throw new TicketError("Instancia inválida para la cuenta");
    productId = inst.productId;
  }
  if (productId && !(pm.get(input.accountId) ?? []).includes(productId)) throw new TicketError("Producto inválido para la cuenta");
  if (input.requesterContactId) {
    const [c] = await db.select().from(sdContacts).where(and(eq(sdContacts.id, input.requesterContactId), eq(sdContacts.accountId, input.accountId)));
    if (!c) throw new TicketError("Solicitante inválido para la cuenta");
  }
  const moduleArea = input.moduleArea ? await import("./projectItemService").then((m) => m.canonicalModule(input.accountId, input.moduleArea!)) : "";
  const now = new Date();
  const ticket = await db.transaction(async (tx) => {
    const [acc] = await tx.update(sdAccounts).set({ ticketSeq: sql`${sdAccounts.ticketSeq} + 1` }).where(eq(sdAccounts.id, input.accountId)).returning();
    if (!acc) throw new TicketError("Cuenta no encontrada", 404);
    const [t] = await tx.insert(sdTickets).values({
      accountId: input.accountId, seq: acc.ticketSeq, key: ticketKey(acc.ticketPrefix, acc.ticketSeq), type: input.type,
      productId, instanceId: input.instanceId ?? null, requesterContactId: input.requesterContactId ?? null,
      title: input.title, description: input.description ?? "", severity: input.severity ?? null,
      perceivedSeverity: input.perceivedSeverity ?? null, status: initialStatus(input.type), channel: input.channel,
      environment: input.environment ?? "prod", moduleArea,
      sharedWithAccount: input.sharedWithAccount ?? false, receivedAt: input.receivedAt ?? now, createdAt: now, updatedAt: now,
    }).returning();
    await addEvent(tx, t.id, who, "created", { channel: input.channel, type: input.type, severity: input.severity ?? null, ...(input.p0 ? { p0: input.p0 } : {}) });
    return t;
  });
  refreshSoon(ticket.id);
  if (opts.notify !== false) void notifyRequester(ticket, (t) => ackEmail(t, portalLink(ticket.id)));
  return ticket;
}

async function notifyRequester(t: { id: number; key: string; title: string; type?: string; requesterContactId: number | null }, build: (t: { key: string; title: string }) => { subject: string; html: string }) {
  try {
    if (!t.requesterContactId || t.type === "internal_task") return;
    const [c] = await db.select({ email: sdContacts.email }).from(sdContacts).where(eq(sdContacts.id, t.requesterContactId));
    if (c) await sendEmail({ to: c.email, ...build(t) });
  } catch (e: any) { console.error("ticket notify error:", e.message); }
}

async function lockTicket(tx: Tx, id: number) {
  const [t] = await tx.select().from(sdTickets).where(eq(sdTickets.id, id)).for("update");
  if (!t) throw new TicketError("Ticket no encontrado", 404);
  return t;
}

export async function transitionTicket(id: number, to: string, who: Who, o: { reason?: string; rca?: Partial<Rca> | null } = {}) {
  const now = new Date();
  const { ticket, from } = await db.transaction(async (tx) => {
    const t = await lockTicket(tx, id);
    const rca = o.rca ?? (t.rca as Partial<Rca> | null);
    const v = validateTransition({ type: t.type, severity: t.severity, from: t.status, to, reason: o.reason, rca, closedAt: t.closedAt, now });
    if (!v.ok) throw new TicketError(v.error);
    const [u] = await tx.update(sdTickets).set({ status: to, updatedAt: now, ...timestampsFor(to, now), ...(o.rca ? { rca: o.rca } : {}) }).where(eq(sdTickets.id, id)).returning();
    await addEvent(tx, id, who, "status_changed", { from: t.status, to, reason: o.reason ?? null });
    return { ticket: u, from: t.status };
  });
  refreshSoon(id);
  void notifyRequester(ticket, (t) => statusEmail(t, to, portalLink(ticket.id)));
  return { ticket, from };
}

export async function addComment(id: number, who: Who, body: string, visibility: "public" | "internal") {
  const now = new Date();
  if (who.type === "contact" && visibility !== "public") throw new TicketError("Sin permiso", 403);
  const { ticket, comment } = await db.transaction(async (tx) => {
    const t = await lockTicket(tx, id);
    if (who.type === "contact" && ["closed", "duplicate", "cancelled", "rejected"].includes(t.status)) throw new TicketError("El ticket está cerrado", 409);
    const [c] = await tx.insert(sdTicketComments).values({ ticketId: id, visibility, authorType: who.type, authorId: who.id, body, createdAt: now }).returning();
    await addEvent(tx, id, who, "comment", { commentId: c.id, visibility });
    const patch: Partial<typeof sdTickets.$inferInsert> = { updatedAt: now };
    if (who.type === "user" && visibility === "public" && !t.firstResponseAt) {
      patch.firstResponseAt = now;
      await addEvent(tx, id, who, "first_response", {});
    }
    if (who.type === "contact" && (t.status === "waiting_customer" || t.status === "resolved")) {
      patch.status = "in_progress"; Object.assign(patch, timestampsFor("in_progress", now));
      await addEvent(tx, id, { type: "system" }, "status_changed", { from: t.status, to: "in_progress", reason: "Respuesta del cliente" });
    }
    const [u] = await tx.update(sdTickets).set(patch).where(eq(sdTickets.id, id)).returning();
    return { ticket: u, comment: c };
  });
  refreshSoon(id);
  if (who.type === "user" && visibility === "public") void notifyRequester(ticket, (t) => commentEmail(t, body, portalLink(ticket.id)));
  return comment;
}

export async function addTimeEntry(id: number, userId: number, e: { minutes: number; billable: boolean; workDate: string; note?: string }) {
  if (!Number.isInteger(e.minutes) || e.minutes < 1 || e.minutes > 1440) throw new TicketError("Minutos inválidos (1–1440)");
  return db.transaction(async (tx) => {
    await lockTicket(tx, id);
    const [row] = await tx.insert(sdTimeEntries).values({ ticketId: id, userId, minutes: e.minutes, billable: e.billable, workDate: e.workDate, note: e.note ?? "" }).returning();
    await addEvent(tx, id, { type: "user", id: userId }, "time_logged", { minutes: e.minutes, billable: e.billable });
    return row;
  }).then(async (row) => {
    if (e.billable) {
      const [t] = await db.select({ a: sdTickets.accountId }).from(sdTickets).where(eq(sdTickets.id, id));
      if (t) void import("./featureService").then((m) => m.checkBankAlerts(t.a)).catch((err) => console.error("bank alert:", err.message));
    }
    return row;
  });
}

export type UpdateInput = Partial<{
  title: string; description: string; severity: string | null; p0: Partial<P0Questionnaire> | null; priorityInternal: number;
  assigneeUserId: number | null; moduleArea: string; environment: string; sharedWithAccount: boolean;
  slaApplicable: boolean; productId: number | null; instanceId: number | null;
}>;
export async function updateTicket(id: number, userId: number, u: UpdateInput) {
  const now = new Date();
  const out = await db.transaction(async (tx) => {
    const t = await lockTicket(tx, id);
    const { p0, ...rest } = u;
    if (u.severity !== undefined && u.severity !== t.severity) {
      const v = validateSeverity(t.type, u.severity, p0);
      if (!v.ok) throw new TicketError(v.error);
    }
    if (u.assigneeUserId) {
      const a = await loadActor(u.assigneeUserId);
      if (!a || !a.roles.some((r) => ["owner", "support_manager", "agent_l2", "agent_l1"].includes(r)) || !(await visibleAccountIds(a)).includes(t.accountId)) throw new TicketError("El responsable no tiene acceso a esta cuenta");
    }
    if (u.instanceId) {
      const [inst] = await tx.select().from(sdInstances).where(and(eq(sdInstances.id, u.instanceId), eq(sdInstances.accountId, t.accountId)));
      if (!inst) throw new TicketError("Instancia inválida para la cuenta");
      rest.productId = inst.productId;
    }
    if (rest.productId) {
      const pm = await accountProductMap();
      if (!(pm.get(t.accountId) ?? []).includes(rest.productId)) throw new TicketError("Producto inválido para la cuenta");
    }
    const [row] = await tx.update(sdTickets).set({ ...rest, updatedAt: now }).where(eq(sdTickets.id, id)).returning();
    const changed: Record<string, unknown> = {};
    for (const k of Object.keys(rest) as (keyof typeof rest)[]) if ((t as any)[k] !== (row as any)[k]) changed[k] = { from: (t as any)[k], to: (row as any)[k] };
    if (Object.keys(changed).length) await addEvent(tx, id, { type: "user", id: userId }, "fields_changed", { changed, ...(p0 ? { p0 } : {}) });
    return row;
  });
  refreshSoon(id);
  return out;
}
