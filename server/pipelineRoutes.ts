import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  oportunidades,
  cotizaciones,
  actividades,
  etapasVenta,
  clientes,
  productos,
  tiposNegocio,
  users,
  kpis,
  historialEtapas,
} from "@shared/schema";
import { eq, and, isNull, sql, count, sum } from "drizzle-orm";

export function registerPipelineRoutes(app: Express, requireAuth: any) {
  app.get("/api/pipeline/oportunidades", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          o.*,
          json_build_object('id', c.id, 'codigo', c.codigo, 'nombreNegocio', c.nombre_negocio, 'telefonoContacto', c.telefono_contacto) AS cliente,
          json_build_object('id', e.id, 'codigoEtapa', e.codigo_etapa, 'etapa', e.etapa, 'descripcion', e.descripcion, 'inicial', e.inicial, 'final', e.final, 'probabilidad', e.probabilidad, 'orden', e.orden, 'kpiId', e.kpi_id) AS etapa,
          json_build_object('id', u.id, 'username', u.username, 'fullName', u.full_name) AS responsable,
          json_build_object('id', p.id, 'nombre', p.nombre) AS producto,
          json_build_object('id', tn.id, 'nombre', tn.nombre) AS "tipoNegocio",
          COALESCE(act.cnt, 0) AS "actividadesCount",
          COALESCE(cot.cnt, 0) AS "cotizacionesCount"
        FROM oportunidades o
        LEFT JOIN clientes c ON c.id = o.cliente_id
        JOIN etapas_venta e ON e.id = o.etapa_venta_id
        LEFT JOIN users u ON u.id = o.responsable_id
        LEFT JOIN productos p ON p.id = o.producto_id
        LEFT JOIN tipos_negocio tn ON tn.id = o.tipo_negocio_id
        LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM actividades WHERE oportunidad_id = o.id) act ON true
        LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cnt FROM cotizaciones WHERE oportunidad_id = o.id) cot ON true
        ORDER BY o.id DESC
      `);

      const result = ((rows as any).rows || rows as any[]).map((row: any) => ({
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        clienteId: row.cliente_id,
        tipoNegocioId: row.tipo_negocio_id,
        productoId: row.producto_id,
        etapaVentaId: row.etapa_venta_id,
        valorEstimado: row.valor_estimado,
        probabilidad: row.probabilidad,
        responsableId: row.responsable_id,
        estado: row.estado,
        motivoCierre: row.motivo_cierre,
        fechaCierre: row.fecha_cierre,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        cliente: row.cliente?.id ? row.cliente : null,
        etapa: row.etapa,
        responsable: row.responsable?.id ? row.responsable : null,
        producto: row.producto?.id ? row.producto : null,
        tipoNegocio: row.tipoNegocio?.id ? row.tipoNegocio : null,
        actividadesCount: row.actividadesCount || 0,
        cotizacionesCount: row.cotizacionesCount || 0,
        diasInactividad: Math.floor((Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      }));
      res.json(result);
    } catch (error) {
      console.error("Error fetching oportunidades:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/pipeline/oportunidades", requireAuth, async (req: Request, res: Response) => {
    try {
      const { nombre, clienteId, tipoNegocioId, productoId, etapaVentaId, valorEstimado, responsableId } = req.body;

      const [etapa] = await db.select().from(etapasVenta).where(eq(etapasVenta.id, etapaVentaId));
      const probabilidad = etapa?.probabilidad || 0;

      const lastOp = await db.select({ codigo: oportunidades.codigo }).from(oportunidades).orderBy(sql`id DESC`).limit(1);
      let nextNum = 101;
      if (lastOp.length > 0) {
        const match = lastOp[0].codigo.match(/OP-(\d+)/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      const codigo = `OP-${nextNum}`;

      const [item] = await db.insert(oportunidades).values({
        codigo,
        nombre,
        clienteId: clienteId || null,
        tipoNegocioId: tipoNegocioId || null,
        productoId: productoId || null,
        etapaVentaId,
        valorEstimado: String(valorEstimado || 0),
        probabilidad,
        responsableId: responsableId || req.session.userId,
        estado: "activa",
      }).returning();

      await db.insert(actividades).values({
        oportunidadId: item.id,
        tipo: "nota",
        descripcion: "Oportunidad creada",
        usuarioId: req.session.userId,
      });

      await db.insert(historialEtapas).values({
        oportunidadId: item.id,
        etapaVentaId,
        valorEstimado: String(valorEstimado || 0),
        probabilidad,
        entradaAt: new Date(),
      });

      res.status(201).json(item);
    } catch (error: any) {
      console.error("Error creating oportunidad:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/pipeline/oportunidades/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { nombre, clienteId, tipoNegocioId, productoId, etapaVentaId, valorEstimado, responsableId } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (nombre !== undefined) updateData.nombre = nombre;
      if (clienteId !== undefined) updateData.clienteId = clienteId || null;
      if (tipoNegocioId !== undefined) updateData.tipoNegocioId = tipoNegocioId || null;
      if (productoId !== undefined) updateData.productoId = productoId || null;
      if (valorEstimado !== undefined) updateData.valorEstimado = String(valorEstimado);
      if (responsableId !== undefined) updateData.responsableId = responsableId || null;

      if (etapaVentaId !== undefined) {
        updateData.etapaVentaId = etapaVentaId;
        const [etapa] = await db.select().from(etapasVenta).where(eq(etapasVenta.id, etapaVentaId));
        if (etapa) updateData.probabilidad = etapa.probabilidad;
      }

      const [updated] = await db.update(oportunidades).set(updateData).where(eq(oportunidades.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "No encontrada" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating oportunidad:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/pipeline/oportunidades/:id/etapa", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { etapaVentaId } = req.body;

      const [etapa] = await db.select().from(etapasVenta).where(eq(etapasVenta.id, etapaVentaId));
      if (!etapa) return res.status(404).json({ message: "Etapa no encontrada" });

      const now = new Date();

      await db.update(historialEtapas).set({ salidaAt: now })
        .where(and(
          eq(historialEtapas.oportunidadId, id),
          isNull(historialEtapas.salidaAt)
        ));

      const [updated] = await db.update(oportunidades).set({
        etapaVentaId,
        probabilidad: etapa.probabilidad,
        updatedAt: now,
      }).where(eq(oportunidades.id, id)).returning();

      if (!updated) return res.status(404).json({ message: "No encontrada" });

      await db.insert(historialEtapas).values({
        oportunidadId: id,
        etapaVentaId,
        valorEstimado: updated.valorEstimado,
        probabilidad: etapa.probabilidad,
        entradaAt: now,
      });

      await db.insert(actividades).values({
        oportunidadId: id,
        tipo: "nota",
        descripcion: `Movida a etapa: ${etapa.etapa}`,
        usuarioId: req.session.userId,
      });

      res.json({ ...updated, etapa });
    } catch (error) {
      console.error("Error moving oportunidad:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/pipeline/oportunidades/:id/cerrar", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { estado, motivoCierre } = req.body;

      if (!["ganada", "perdida"].includes(estado)) {
        return res.status(400).json({ message: "Estado debe ser 'ganada' o 'perdida'" });
      }

      const now = new Date();

      await db.update(historialEtapas).set({ salidaAt: now })
        .where(and(
          eq(historialEtapas.oportunidadId, id),
          isNull(historialEtapas.salidaAt)
        ));

      const [updated] = await db.update(oportunidades).set({
        estado,
        motivoCierre: motivoCierre || null,
        fechaCierre: now,
        probabilidad: estado === "ganada" ? 100 : 0,
        updatedAt: now,
      }).where(eq(oportunidades.id, id)).returning();

      if (!updated) return res.status(404).json({ message: "No encontrada" });

      await db.insert(actividades).values({
        oportunidadId: id,
        tipo: "nota",
        descripcion: `Oportunidad ${estado === "ganada" ? "GANADA" : "PERDIDA"}${motivoCierre ? `: ${motivoCierre}` : ""}`,
        usuarioId: req.session.userId,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error closing oportunidad:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/pipeline/oportunidades/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(actividades).where(eq(actividades.oportunidadId, id));
      await db.delete(cotizaciones).where(eq(cotizaciones.oportunidadId, id));
      await db.delete(oportunidades).where(eq(oportunidades.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/pipeline/oportunidades/:id/cotizaciones", requireAuth, async (req: Request, res: Response) => {
    try {
      const oportunidadId = parseInt(req.params.id);
      const data = await db.select().from(cotizaciones).where(eq(cotizaciones.oportunidadId, oportunidadId));
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/pipeline/oportunidades/:id/cotizaciones", requireAuth, async (req: Request, res: Response) => {
    try {
      const oportunidadId = parseInt(req.params.id);
      const { descripcion, monto, estado } = req.body;
      const existing = await db.select({ id: cotizaciones.id }).from(cotizaciones);
      const nextNum = existing.length + 1;
      const codigo = `COT-${String(nextNum).padStart(3, "0")}`;
      const [item] = await db.insert(cotizaciones).values({
        codigo,
        oportunidadId,
        descripcion,
        monto: String(monto || 0),
        estado: estado || "borrador",
      }).returning();

      await db.insert(actividades).values({
        oportunidadId,
        tipo: "nota",
        descripcion: `Cotización ${codigo} agregada`,
        usuarioId: req.session.userId,
      });

      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/pipeline/cotizaciones/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(cotizaciones).where(eq(cotizaciones.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/pipeline/oportunidades/:id/actividades", requireAuth, async (req: Request, res: Response) => {
    try {
      const oportunidadId = parseInt(req.params.id);
      const data = await db
        .select({
          id: actividades.id,
          oportunidadId: actividades.oportunidadId,
          tipo: actividades.tipo,
          descripcion: actividades.descripcion,
          usuarioId: actividades.usuarioId,
          createdAt: actividades.createdAt,
          usuarioNombre: users.fullName,
        })
        .from(actividades)
        .leftJoin(users, eq(actividades.usuarioId, users.id))
        .where(eq(actividades.oportunidadId, oportunidadId))
        .orderBy(sql`${actividades.createdAt} DESC`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/pipeline/oportunidades/:id/actividades", requireAuth, async (req: Request, res: Response) => {
    try {
      const oportunidadId = parseInt(req.params.id);
      const { tipo, descripcion } = req.body;
      const [item] = await db.insert(actividades).values({
        oportunidadId,
        tipo: tipo || "nota",
        descripcion,
        usuarioId: req.session.userId,
      }).returning();

      await db.update(oportunidades).set({ updatedAt: new Date() }).where(eq(oportunidades.id, oportunidadId));

      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/pipeline/kpi-tracking", requireAuth, async (req: Request, res: Response) => {
    try {
      const { desde, hasta } = req.query as { desde?: string; hasta?: string };
      const allKpis = await db.select().from(kpis);
      const allEtapas = await db.select().from(etapasVenta);
      const allOps = await db.select().from(oportunidades);
      const allHistorial = await db.select().from(historialEtapas);

      const hasDateFilter = !!(desde || hasta);
      let desdeDate: Date | null = null;
      let hastaDate: Date | null = null;
      if (desde) desdeDate = new Date(desde);
      if (hasta) {
        hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);
      }

      const result = allKpis.map(kpi => {
        const etapasLinked = allEtapas.filter(e => e.kpiId === kpi.id);
        const etapaIds = etapasLinked.map(e => e.id);

        if (hasDateFilter && allHistorial.length > 0) {
          const historialInRange = allHistorial.filter(h => {
            if (!etapaIds.includes(h.etapaVentaId)) return false;
            const entrada = new Date(h.entradaAt);
            const salida = h.salidaAt ? new Date(h.salidaAt) : null;
            if (hastaDate && entrada > hastaDate) return false;
            if (desdeDate && salida && salida < desdeDate) return false;
            return true;
          });

          const opIdsInRange = [...new Set(historialInRange.map(h => h.oportunidadId))];
          const opsInKpi = allOps.filter(op => opIdsInRange.includes(op.id));

          const opsActivas = opsInKpi.filter(op => op.estado === "activa");
          const opsGanadas = opsInKpi.filter(op => op.estado === "ganada");

          const valorTotal = opsInKpi.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0"), 0);
          const valorPonderado = opsInKpi.reduce((sum, op) => {
            const h = historialInRange.find(hi => hi.oportunidadId === op.id);
            const prob = h ? h.probabilidad : op.probabilidad;
            return sum + parseFloat(op.valorEstimado || "0") * (prob / 100);
          }, 0);

          const metaValor = parseFloat(kpi.valor) || 0;
          const cumplimiento = metaValor > 0 ? Math.min(100, Math.round((valorTotal / metaValor) * 100)) : 0;

          const valorGanado = opsGanadas.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0"), 0);

          return {
            id: kpi.id,
            codigoKpi: kpi.codigoKpi,
            nombre: kpi.kpi,
            descripcion: kpi.descripcion,
            metaValor,
            periodoEvaluacion: kpi.periodoEvaluacion,
            cumplimiento,
            valorTotal: Math.round(valorTotal),
            valorPonderado: Math.round(valorPonderado),
            valorGanado: Math.round(valorGanado),
            oportunidadesActivas: opsActivas.length,
            oportunidadesGanadas: opsGanadas.length,
            etapasVinculadas: etapasLinked.map(e => {
              const histEtapa = historialInRange.filter(h => h.etapaVentaId === e.id);
              const opIdsEtapa = [...new Set(histEtapa.map(h => h.oportunidadId))];
              const opsEtapa = allOps.filter(op => opIdsEtapa.includes(op.id));
              return {
                id: e.id,
                etapa: e.etapa,
                orden: e.orden,
                probabilidad: e.probabilidad,
                oportunidades: opsEtapa.map(op => {
                  const h = histEtapa.find(hi => hi.oportunidadId === op.id);
                  return {
                    id: op.id,
                    codigo: op.codigo,
                    nombre: op.nombre,
                    valorEstimado: parseFloat(op.valorEstimado || "0"),
                    probabilidad: h ? h.probabilidad : op.probabilidad,
                    estado: op.estado,
                    diasInactividad: Math.floor((Date.now() - new Date(op.updatedAt).getTime()) / (1000 * 60 * 60 * 24)),
                  };
                }),
              };
            }),
          };
        }

        const opsInKpi = allOps.filter(op => etapaIds.includes(op.etapaVentaId));
        const opsActivas = opsInKpi.filter(op => op.estado === "activa");

        const valorTotal = opsActivas.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0"), 0);
        const valorPonderado = opsActivas.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0") * (op.probabilidad / 100), 0);

        const metaValor = parseFloat(kpi.valor) || 0;
        const cumplimiento = metaValor > 0 ? Math.min(100, Math.round((valorTotal / metaValor) * 100)) : 0;

        const opsGanadasKpi = allOps.filter(op => {
          if (op.estado !== "ganada") return false;
          const hist = allHistorial.filter(h => h.oportunidadId === op.id && etapaIds.includes(h.etapaVentaId));
          if (hist.length > 0) return true;
          const etapaOrig = allEtapas.find(e => e.id === op.etapaVentaId);
          return etapaOrig && etapaOrig.kpiId === kpi.id;
        });
        const valorGanado = opsGanadasKpi.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0"), 0);

        return {
          id: kpi.id,
          codigoKpi: kpi.codigoKpi,
          nombre: kpi.kpi,
          descripcion: kpi.descripcion,
          metaValor,
          periodoEvaluacion: kpi.periodoEvaluacion,
          cumplimiento,
          valorTotal: Math.round(valorTotal),
          valorPonderado: Math.round(valorPonderado),
          valorGanado: Math.round(valorGanado),
          oportunidadesActivas: opsActivas.length,
          oportunidadesGanadas: opsGanadasKpi.length,
          etapasVinculadas: etapasLinked.map(e => ({
            id: e.id,
            etapa: e.etapa,
            orden: e.orden,
            probabilidad: e.probabilidad,
            oportunidades: allOps.filter(op => op.etapaVentaId === e.id && op.estado === "activa").map(op => ({
              id: op.id,
              codigo: op.codigo,
              nombre: op.nombre,
              valorEstimado: parseFloat(op.valorEstimado || "0"),
              probabilidad: op.probabilidad,
              estado: op.estado,
              diasInactividad: Math.floor((Date.now() - new Date(op.updatedAt).getTime()) / (1000 * 60 * 60 * 24)),
            })),
          })),
        };
      });

      const totalMeta = result.reduce((s, k) => s + k.metaValor, 0);
      const totalValor = result.reduce((s, k) => s + k.valorTotal, 0);
      const totalPonderado = result.reduce((s, k) => s + k.valorPonderado, 0);
      const totalGanado = result.reduce((s, k) => s + k.valorGanado, 0);
      const cumplimientoGeneral = totalMeta > 0 ? Math.min(100, Math.round((totalValor / totalMeta) * 100)) : 0;

      res.json({
        kpis: result,
        resumen: {
          totalKpis: allKpis.length,
          totalMeta,
          totalValor: Math.round(totalValor),
          totalPonderado: Math.round(totalPonderado),
          totalGanado: Math.round(totalGanado),
          cumplimientoGeneral,
          oportunidadesTotales: allOps.filter(op => op.estado === "activa").length,
        },
      });
    } catch (error) {
      console.error("Error fetching KPI tracking:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/pipeline/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allOps = await db.select().from(oportunidades);
      const activeOps = allOps.filter(op => op.estado === "activa");
      const closedOps = allOps.filter(op => op.estado === "ganada" || op.estado === "perdida");
      const wonOps = allOps.filter(op => op.estado === "ganada");

      const pipelineValue = activeOps.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0") * (op.probabilidad / 100), 0);
      const totalValue = activeOps.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0"), 0);

      const winRate = closedOps.length > 0 ? Math.round((wonOps.length / closedOps.length) * 100) : 0;

      const atRisk = activeOps.filter(op => {
        const daysSinceUpdate = Math.floor((Date.now() - new Date(op.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceUpdate > 7;
      });

      res.json({
        pipelineValue: Math.round(pipelineValue),
        totalValue: Math.round(totalValue),
        activeCount: activeOps.length,
        winRate,
        atRiskCount: atRisk.length,
        totalCount: allOps.length,
        wonCount: wonOps.length,
        lostCount: allOps.filter(op => op.estado === "perdida").length,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Error del servidor" });
    }
  });
}
