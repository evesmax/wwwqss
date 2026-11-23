// Idempotent provisioning for Jarvis QSS: missing products, the internal account and the restricted agent key.
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clientes, sdAccounts, sdAgentKeys, sdInstances, sdProducts } from "@shared/schema";
import { hashSecret } from "./agentAuth";
import { CREATE_PRODUCT_CODE } from "./agentPermissions";
import { writeAudit } from "./audit";

export const NEW_PRODUCTS = [
  ["TROOXER", "Trooxer"], ["QNEXUSAPP", "QNexusApp"], ["HOLAKURA", "HolaKura"], ["QFACTURAHUB", "QFactura Hub"],
  ["APPMINISTRA", "Appministra"], ["AURANUBA", "AuraNuba"], ["WWWQSS", "wwwqss"], [CREATE_PRODUCT_CODE, "Plataforma QSS"],
] as const;
export const INTERNAL = { codigo: "QSS-INTERNO", nombre: "QSS interno", prefix: "QSI" } as const;

/** Creates only the missing products (existing ones are never touched). Returns the codes created. */
export async function seedProducts(): Promise<string[]> {
  const made: string[] = [];
  for (const [code, name] of NEW_PRODUCTS) {
    const r = await db.insert(sdProducts).values({ code, name }).onConflictDoNothing().returning({ id: sdProducts.id });
    if (r.length) made.push(code);
  }
  return made;
}

/** Internal account "QSS interno" (no contacts, no contract, flagged internal) with an instance of Plataforma QSS. */
export async function seedInternalAccount(): Promise<{ accountId: number; instanceId: number }> {
  await db.insert(clientes).values({ codigo: INTERNAL.codigo, tipo: "Interno", nombreNegocio: INTERNAL.nombre }).onConflictDoNothing();
  const [c] = await db.select().from(clientes).where(eq(clientes.codigo, INTERNAL.codigo));
  await db.insert(sdAccounts).values({ clienteId: c.id, accountType: "interno", ticketPrefix: INTERNAL.prefix, internal: true }).onConflictDoNothing();
  const [a] = await db.select().from(sdAccounts).where(eq(sdAccounts.clienteId, c.id));
  if (!a.internal) await db.update(sdAccounts).set({ internal: true }).where(eq(sdAccounts.id, a.id));
  const [p] = await db.select().from(sdProducts).where(eq(sdProducts.code, CREATE_PRODUCT_CODE));
  if (!p) throw new Error(`Falta el producto ${CREATE_PRODUCT_CODE}`);
  let [i] = await db.select().from(sdInstances).where(and(eq(sdInstances.accountId, a.id), eq(sdInstances.productId, p.id)));
  if (!i) [i] = await db.insert(sdInstances).values({ accountId: a.id, productId: p.id, name: "Plataforma QSS (interno)", environment: "prod", baseUrl: "" }).returning();
  return { accountId: a.id, instanceId: i.id };
}

/** Mints the restricted jarvis key. Only the SHA-256 is stored; the token is returned once. */
export async function createJarvisKey(o: { name?: string; active: boolean }): Promise<{ id: number; token: string }> {
  const name = o.name ?? "jarvis-qss";
  const [dup] = await db.select({ id: sdAgentKeys.id }).from(sdAgentKeys).where(eq(sdAgentKeys.name, name));
  if (dup) throw new Error(`Ya existe una llave "${name}" (id ${dup.id}). Rótala en vez de crear otra.`);
  const keyId = `qa_${crypto.randomBytes(8).toString("hex")}`, secret = crypto.randomBytes(32).toString("hex");
  const [k] = await db.insert(sdAgentKeys).values({
    keyId, name, secretHash: hashSecret(secret), productIds: [], allProducts: true, permissions: ["create_ticket"], active: o.active,
  }).returning();
  await writeAudit({ actorUserId: null, action: "agent.key.create", entity: "agent_key", entityId: String(k.id), detail: { name, allProducts: true, permissions: ["create_ticket"], active: o.active, via: "script" } });
  return { id: k.id, token: `${keyId}.${secret}` };
}
