// Self-registration from the SDK widget: the host product vouched for the user and tenant (signed token),
// so an unknown tenant can register its business and get an account + instance + contact in Service Desk.
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { clientes, sdAccounts, sdContacts, sdInstances } from "@shared/schema";
import { writeAudit } from "./audit";

export const registerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).default(""),
});

/** 2-6 uppercase letters, unique among `taken`: tries the name's first letters, then widens, then random. */
export function derivePrefix(name: string, taken: Set<string>): string {
  const letters = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  const base = letters.padEnd(3, "X");
  for (const n of [3, 4, 5, 6]) { const p = base.slice(0, n); if (p.length >= 2 && !taken.has(p)) return p; }
  for (let i = 0; i < 26; i++) { const p = base.slice(0, 2) + String.fromCharCode(65 + i); if (!taken.has(p)) return p; }
  for (;;) { const p = Array.from({ length: 4 }, () => String.fromCharCode(65 + crypto.randomInt(26))).join(""); if (!taken.has(p)) return p; }
}

export type Registration = { accountId: number; instanceId: number; ticketPrefix: string };

export async function registerTenant(input: z.infer<typeof registerSchema>, ctx: { productId: number; tenant: string; email: string }): Promise<Registration> {
  const inp = registerSchema.parse(input);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: sdInstances.id }).from(sdInstances).where(and(eq(sdInstances.productId, ctx.productId), eq(sdInstances.name, ctx.tenant)));
    if (dup) throw Object.assign(new Error("Este negocio ya está registrado"), { status: 409 });
    const taken = new Set((await tx.select({ p: sdAccounts.ticketPrefix }).from(sdAccounts)).map((r) => r.p));
    const prefix = derivePrefix(inp.businessName, taken);
    const codigo = `AUTO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const [cli] = await tx.insert(clientes).values({
      codigo, tipo: "Cliente", nombreNegocio: inp.businessName, nombreContacto: inp.contactName, telefonoContacto: inp.phone,
      metadata: { email: ctx.email, origen: "widget-sdk", tenant: ctx.tenant },
    }).returning();
    const [acc] = await tx.insert(sdAccounts).values({ clienteId: cli.id, accountType: "suscripcion", ticketPrefix: prefix }).returning();
    const [inst] = await tx.insert(sdInstances).values({ accountId: acc.id, productId: ctx.productId, name: ctx.tenant, environment: "prod" }).returning();
    await tx.insert(sdContacts).values({ accountId: acc.id, email: ctx.email, name: inp.contactName, role: "contact" }).onConflictDoNothing();
    await writeAudit({ actorUserId: null, action: "sdk.self_register", entity: "sd_accounts", entityId: String(acc.id), detail: { businessName: inp.businessName, tenant: ctx.tenant, productId: ctx.productId, email: ctx.email, prefix } }, tx as any);
    return { accountId: acc.id, instanceId: inst.id, ticketPrefix: prefix };
  });
}
