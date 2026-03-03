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
} from "@shared/schema";
import { eq, and, sql, count, sum } from "drizzle-orm";

export function registerPipelineRoutes(app: Express, requireAuth: any) {
  app.get("/api/pipeline/oportunidades", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allOps = await db.select().from(oportunidades);
      const result = await Promise.all(
        allOps.map(async (op) => {
          const [cliente] = op.clienteId
            ? await db.select({ id: clientes.id, codigo: clientes.codigo, nombreNegocio: clientes.nombreNegocio }).from(clientes).where(eq(clientes.id, op.clienteId))
            : [null];
          const [etapa] = await db.select().from(etapasVenta).where(eq(etapasVenta.id, op.etapaVentaId));
          const [responsable] = op.responsableId
            ? await db.select({ id: users.id, username: users.username, fullName: users.fullName }).from(users).where(eq(users.id, op.responsableId))
            : [null];
          const [producto] = op.productoId
            ? await db.select({ id: productos.id, nombre: productos.nombre }).from(productos).where(eq(productos.id, op.productoId))
            : [null];
          const [tipoNeg] = op.tipoNegocioId
            ? await db.select({ id: tiposNegocio.id, nombre: tiposNegocio.nombre }).from(tiposNegocio).where(eq(tiposNegocio.id, op.tipoNegocioId))
            : [null];

          const actCount = await db.select({ count: count() }).from(actividades).where(eq(actividades.oportunidadId, op.id));
          const cotCount = await db.select({ count: count() }).from(cotizaciones).where(eq(cotizaciones.oportunidadId, op.id));

          const daysSinceUpdate = Math.floor((Date.now() - new Date(op.updatedAt).getTime()) / (1000 * 60 * 60 * 24));

          return {
            ...op,
            cliente,
            etapa,
            responsable,
            producto,
            tipoNegocio: tipoNeg,
            actividadesCount: actCount[0]?.count || 0,
            cotizacionesCount: cotCount[0]?.count || 0,
            diasInactividad: daysSinceUpdate,
          };
        })
      );
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

      const [updated] = await db.update(oportunidades).set({
        etapaVentaId,
        probabilidad: etapa.probabilidad,
        updatedAt: new Date(),
      }).where(eq(oportunidades.id, id)).returning();

      if (!updated) return res.status(404).json({ message: "No encontrada" });

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

      const [updated] = await db.update(oportunidades).set({
        estado,
        motivoCierre: motivoCierre || null,
        fechaCierre: new Date(),
        probabilidad: estado === "ganada" ? 100 : 0,
        updatedAt: new Date(),
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

  app.get("/api/pipeline/kpi-tracking", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allKpis = await db.select().from(kpis);
      const allEtapas = await db.select().from(etapasVenta);
      const allOps = await db.select().from(oportunidades);

      const result = allKpis.map(kpi => {
        const etapasLinked = allEtapas.filter(e => e.kpiId === kpi.id);
        const etapaIds = etapasLinked.map(e => e.id);

        const opsInKpi = allOps.filter(op => etapaIds.includes(op.etapaVentaId));
        const opsActivas = opsInKpi.filter(op => op.estado === "activa");
        const opsGanadas = allOps.filter(op => op.estado === "ganada" && etapaIds.length > 0 &&
          etapasLinked.some(e => e.final));
        const opsPerdidas = allOps.filter(op => op.estado === "perdida" && etapaIds.length > 0 &&
          etapasLinked.some(e => e.final));

        const allOpsForKpiStages = allOps.filter(op =>
          etapaIds.includes(op.etapaVentaId) ||
          (op.estado === "ganada" && etapasLinked.some(e => e.final)) ||
          (op.estado === "perdida" && etapasLinked.some(e => e.final))
        );

        const valorTotal = opsActivas.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0"), 0);
        const valorPonderado = opsActivas.reduce((sum, op) => sum + parseFloat(op.valorEstimado || "0") * (op.probabilidad / 100), 0);

        const metaValor = parseFloat(kpi.valor) || 0;
        const cumplimiento = metaValor > 0 ? Math.min(100, Math.round((valorPonderado / metaValor) * 100)) : 0;

        const opsGanadasTotal = allOps.filter(op => op.estado === "ganada");
        const opsGanadasKpi = opsGanadasTotal.filter(op => {
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
      const totalPonderado = result.reduce((s, k) => s + k.valorPonderado, 0);
      const totalGanado = result.reduce((s, k) => s + k.valorGanado, 0);
      const cumplimientoGeneral = totalMeta > 0 ? Math.min(100, Math.round((totalPonderado / totalMeta) * 100)) : 0;

      res.json({
        kpis: result,
        resumen: {
          totalKpis: allKpis.length,
          totalMeta,
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
