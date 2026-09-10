import { db } from "./db";
import { clientes, oportunidades, actividades, productos, etapasVenta } from "@shared/schema";
import { eq, sql, ilike } from "drizzle-orm";

export interface LeadInput {
  nombre: string;
  empresa: string;
  telefono: string;
  email?: string;
  producto: string;
  transcript: string;
}

export interface LeadResult {
  clienteId: number;
  oportunidadId: number;
  codigo: string;
}

function generateClienteCodigo(): string {
  return `WEB-${Date.now().toString().slice(-8)}`;
}

async function generateOportunidadCodigo(): Promise<string> {
  const lastOp = await db
    .select({ codigo: oportunidades.codigo })
    .from(oportunidades)
    .orderBy(sql`id DESC`)
    .limit(1);
  let nextNum = 101;
  if (lastOp.length > 0) {
    const match = lastOp[0].codigo.match(/OP-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  return `OP-${nextNum}`;
}

async function findOrCreateCliente(input: LeadInput): Promise<number> {
  const [existing] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.telefonoContacto, input.telefono));

  if (existing) return existing.id;

  const [created] = await db
    .insert(clientes)
    .values({
      codigo: generateClienteCodigo(),
      tipo: "Prospecto",
      nombreNegocio: input.empresa,
      nombreContacto: input.nombre,
      telefonoContacto: input.telefono,
      metadata: input.email ? { email: input.email } : {},
    })
    .returning();

  return created.id;
}

async function resolveProductoId(nombreProducto: string): Promise<number | null> {
  const normalized = nombreProducto.trim().toLowerCase();
  if (!normalized || normalized.includes("medida")) return null;

  const [match] = await db
    .select()
    .from(productos)
    .where(ilike(productos.nombre, `%${normalized}%`));

  return match?.id ?? null;
}

async function resolveEtapaInicial(): Promise<{ id: number; probabilidad: number }> {
  const [etapa] = await db.select().from(etapasVenta).where(eq(etapasVenta.inicial, true));
  if (!etapa) throw new Error("No hay una etapa de venta marcada como inicial");
  return { id: etapa.id, probabilidad: etapa.probabilidad };
}

export async function createLeadFromAgent(input: LeadInput): Promise<LeadResult> {
  const clienteId = await findOrCreateCliente(input);
  const productoId = await resolveProductoId(input.producto);
  const etapaInicial = await resolveEtapaInicial();
  const codigo = await generateOportunidadCodigo();

  const [oportunidad] = await db
    .insert(oportunidades)
    .values({
      codigo,
      nombre: `${input.empresa} - ${input.producto}`,
      clienteId,
      productoId,
      etapaVentaId: etapaInicial.id,
      valorEstimado: "0",
      probabilidad: etapaInicial.probabilidad,
      responsableId: null,
      estado: "activa",
    })
    .returning();

  await db.insert(actividades).values({
    oportunidadId: oportunidad.id,
    tipo: "nota",
    descripcion: `Lead generado por el agente de ventas del sitio web.\n\n${input.transcript}`,
    usuarioId: null,
  });

  return { clienteId, oportunidadId: oportunidad.id, codigo };
}
