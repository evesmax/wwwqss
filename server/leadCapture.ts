import { db } from "./db";
import { clientes, oportunidades, actividades, productos, etapasVenta, historialEtapas } from "@shared/schema";
import { eq, sql, ilike, and, gte } from "drizzle-orm";

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

const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

function normalizePhone(s: string): string {
  return s.replace(/\D/g, "");
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

async function findOrCreateCliente(input: LeadInput, dbOrTx: any = db): Promise<number> {
  const [existing] = await dbOrTx
    .select()
    .from(clientes)
    .where(eq(clientes.telefonoContacto, input.telefono));

  if (existing) return existing.id;

  const [created] = await dbOrTx
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
  const telefono = normalizePhone(input.telefono?.trim() || "");
  const nombre = input.nombre?.trim();
  const empresa = input.empresa?.trim();
  if (!telefono || !nombre || !empresa) {
    throw new Error("Datos de lead incompletos");
  }
  if (telefono.length !== 10) {
    throw new Error("VALIDATION:Ese teléfono no parece completo — ¿me confirmas un número a 10 dígitos?");
  }

  const normalizedInput: LeadInput = { ...input, telefono, nombre, empresa };

  const productoId = await resolveProductoId(normalizedInput.producto);
  const etapaInicial = await resolveEtapaInicial();
  const codigo = await generateOportunidadCodigo();

  return await db.transaction(async (tx) => {
    const clienteId = await findOrCreateCliente(normalizedInput, tx);

    // Guard against the model calling crear_lead twice for the same client
    // within one conversation (e.g. the visitor adds a second product or
    // updates a detail later in the same session). Reuse the most recent
    // active opportunity for this client if it was created recently instead
    // of creating a duplicate oportunidad/historialEtapas pair.
    const recentThreshold = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const [existingOportunidad] = await tx
      .select()
      .from(oportunidades)
      .where(
        and(
          eq(oportunidades.clienteId, clienteId),
          eq(oportunidades.estado, "activa"),
          gte(oportunidades.createdAt, recentThreshold)
        )
      )
      .orderBy(sql`id DESC`)
      .limit(1);

    if (existingOportunidad) {
      // Still record the new conversation transcript as its own activity
      // note, since it may contain new information (e.g. a follow-up
      // question or a second product mentioned), even though we're not
      // creating a new opportunity/historialEtapas row for it.
      await tx.insert(actividades).values({
        oportunidadId: existingOportunidad.id,
        tipo: "nota",
        descripcion: `Lead generado por el agente de ventas del sitio web (conversación adicional).\n\n${normalizedInput.transcript}`,
        usuarioId: null,
      });

      return {
        clienteId,
        oportunidadId: existingOportunidad.id,
        codigo: existingOportunidad.codigo,
      };
    }

    const [oportunidad] = await tx
      .insert(oportunidades)
      .values({
        codigo,
        nombre: `${normalizedInput.empresa} - ${normalizedInput.producto}`,
        clienteId,
        productoId,
        etapaVentaId: etapaInicial.id,
        valorEstimado: "0",
        probabilidad: etapaInicial.probabilidad,
        responsableId: null,
        estado: "activa",
      })
      .returning();

    await tx.insert(historialEtapas).values({
      oportunidadId: oportunidad.id,
      etapaVentaId: etapaInicial.id,
      valorEstimado: "0",
      probabilidad: etapaInicial.probabilidad,
      entradaAt: new Date(),
    });

    await tx.insert(actividades).values({
      oportunidadId: oportunidad.id,
      tipo: "nota",
      descripcion: `Lead generado por el agente de ventas del sitio web.\n\n${normalizedInput.transcript}`,
      usuarioId: null,
    });

    return { clienteId, oportunidadId: oportunidad.id, codigo };
  });
}
