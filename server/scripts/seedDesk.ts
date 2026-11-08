import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users, clientes, sdProducts, sdAccounts, sdInstances, sdContracts, sdContacts, sdRoleAssignments } from "@shared/schema";
import { hashPassword } from "../auth";
import { ensureServiceDeskSchema } from "../serviceDesk/migrate";

const PRODUCTS = [["QNEXUSCONTROL", "QNexusControl"], ["QPULSEMES", "QPulseMES"], ["QCAMPUSONE", "QCampusOne"]] as const;
const DEMOS = [
  { codigo: "DEMO-SUSC", nombre: "[DEMO] Transportes Suscripción", type: "suscripcion", prefix: "DSU", product: "QNEXUSCONTROL", plan: "estandar", hours: null },
  { codigo: "DEMO-PROY", nombre: "[DEMO] Manufactura Proyecto", type: "proyecto", prefix: "DPR", product: "QPULSEMES", plan: "proyecto", hours: null },
  { codigo: "DEMO-BOLSA", nombre: "[DEMO] Escuela Bolsa de Horas", type: "bolsa_horas", prefix: "DBO", product: "QCAMPUSONE", plan: "bolsa", hours: "15" },
] as const;

async function main() {
  await ensureServiceDeskSchema();
  const prod: Record<string, number> = {};
  for (const [code, name] of PRODUCTS) {
    await db.insert(sdProducts).values({ code, name }).onConflictDoNothing();
    prod[code] = (await db.select().from(sdProducts).where(eq(sdProducts.code, code)))[0].id;
  }
  const acc: Record<string, number> = {};
  for (const d of DEMOS) {
    await db.insert(clientes).values({ codigo: d.codigo, tipo: "Cliente", nombreNegocio: d.nombre }).onConflictDoNothing();
    const [c] = await db.select().from(clientes).where(eq(clientes.codigo, d.codigo));
    await db.insert(sdAccounts).values({ clienteId: c.id, accountType: d.type, ticketPrefix: d.prefix }).onConflictDoNothing();
    const [a] = await db.select().from(sdAccounts).where(eq(sdAccounts.clienteId, c.id));
    acc[d.codigo] = a.id;
    const pid = prod[d.product];
    if (!(await db.select().from(sdInstances).where(and(eq(sdInstances.accountId, a.id), eq(sdInstances.productId, pid)))).length)
      await db.insert(sdInstances).values({ accountId: a.id, productId: pid, name: `${d.nombre} prod`, baseUrl: "https://demo.invalid" });
    if (!(await db.select().from(sdContracts).where(and(eq(sdContracts.accountId, a.id), eq(sdContracts.productId, pid)))).length)
      await db.insert(sdContracts).values({ accountId: a.id, productId: pid, plan: d.plan, hoursBank: d.hours });
    await db.insert(sdContacts).values({ accountId: a.id, email: `admin@${d.codigo.toLowerCase()}.invalid`, name: "Admin demo", role: "account_admin" }).onConflictDoNothing();
  }

  let [agent] = await db.select().from(users).where(eq(users.username, "demo.agente"));
  if (!agent) {
    const pw = crypto.randomBytes(15).toString("base64url");
    [agent] = await db.insert(users).values({ username: "demo.agente", password: hashPassword(pw), fullName: "Agente demo", email: "demo.agente@qsoftwaresolutions.invalid", active: false }).returning();
    console.log("Usuario demo.agente creado DESACTIVADO (actívalo y define contraseña desde Alta de Usuarios si lo necesitas).");
  }
  if (!(await db.select().from(sdRoleAssignments).where(eq(sdRoleAssignments.userId, agent.id))).length)
    await db.insert(sdRoleAssignments).values({ userId: agent.id, role: "agent_l2", scopeType: "account", scopeId: acc["DEMO-SUSC"] });
  console.log("Semilla lista:", acc);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
