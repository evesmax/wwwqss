import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  tiposNegocio,
  clientes,
  etapasVenta,
  productos,
  productoTiposNegocio,
  kpis,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerCatalogRoutes(app: Express, requireAuth: any) {
  app.get("/api/catalog/tipos-negocio", requireAuth, async (_req: Request, res: Response) => {
    try {
      const data = await db.select().from(tiposNegocio);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/catalog/tipos-negocio", requireAuth, async (req: Request, res: Response) => {
    try {
      const { codigo, nombre, descripcion } = req.body;
      const [item] = await db.insert(tiposNegocio).values({ codigo, nombre, descripcion }).returning();
      res.status(201).json(item);
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.constraint) {
        return res.status(400).json({ message: "El código ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/catalog/tipos-negocio/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { codigo, nombre, descripcion } = req.body;
      const [updated] = await db.update(tiposNegocio).set({ codigo, nombre, descripcion }).where(eq(tiposNegocio.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "No encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/catalog/tipos-negocio/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(tiposNegocio).where(eq(tiposNegocio.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/catalog/clientes", requireAuth, async (_req: Request, res: Response) => {
    try {
      const data = await db.select().from(clientes);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/catalog/clientes", requireAuth, async (req: Request, res: Response) => {
    try {
      const { codigo, tipo, nombreNegocio, tipoNegocioId, nombreContacto, telefonoContacto, metadata } = req.body;
      const [item] = await db.insert(clientes).values({
        codigo, tipo, nombreNegocio, tipoNegocioId, nombreContacto, telefonoContacto, metadata: metadata || {},
      }).returning();
      res.status(201).json(item);
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.constraint) {
        return res.status(400).json({ message: "El código ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/catalog/clientes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { codigo, tipo, nombreNegocio, tipoNegocioId, nombreContacto, telefonoContacto, metadata } = req.body;
      const [updated] = await db.update(clientes).set({
        codigo, tipo, nombreNegocio, tipoNegocioId, nombreContacto, telefonoContacto, metadata: metadata || {},
      }).where(eq(clientes.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "No encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/catalog/clientes/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(clientes).where(eq(clientes.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/catalog/etapas-venta", requireAuth, async (_req: Request, res: Response) => {
    try {
      const data = await db
        .select({
          id: etapasVenta.id,
          codigoEtapa: etapasVenta.codigoEtapa,
          etapa: etapasVenta.etapa,
          descripcion: etapasVenta.descripcion,
          inicial: etapasVenta.inicial,
          final: etapasVenta.final,
          probabilidad: etapasVenta.probabilidad,
          orden: etapasVenta.orden,
          kpiId: etapasVenta.kpiId,
          kpiNombre: kpis.kpi,
          createdAt: etapasVenta.createdAt,
        })
        .from(etapasVenta)
        .leftJoin(kpis, eq(etapasVenta.kpiId, kpis.id));
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/catalog/etapas-venta", requireAuth, async (req: Request, res: Response) => {
    try {
      const { codigoEtapa, etapa, descripcion, inicial, final: esFinal, probabilidad, orden, kpiId } = req.body;
      const [item] = await db.insert(etapasVenta).values({ codigoEtapa, etapa, descripcion, inicial, final: esFinal, probabilidad: probabilidad ?? 0, orden: orden ?? 0, kpiId: kpiId || null }).returning();
      res.status(201).json(item);
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.constraint) {
        return res.status(400).json({ message: "El código ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/catalog/etapas-venta/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { codigoEtapa, etapa, descripcion, inicial, final: esFinal, probabilidad, orden, kpiId } = req.body;
      const [updated] = await db.update(etapasVenta).set({ codigoEtapa, etapa, descripcion, inicial, final: esFinal, probabilidad: probabilidad ?? 0, orden: orden ?? 0, kpiId: kpiId || null }).where(eq(etapasVenta.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "No encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/catalog/etapas-venta/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(etapasVenta).where(eq(etapasVenta.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/catalog/productos", requireAuth, async (_req: Request, res: Response) => {
    try {
      const allProductos = await db.select().from(productos);
      const result = await Promise.all(
        allProductos.map(async (p) => {
          const tipos = await db
            .select({ tipoNegocioId: productoTiposNegocio.tipoNegocioId, nombre: tiposNegocio.nombre })
            .from(productoTiposNegocio)
            .innerJoin(tiposNegocio, eq(productoTiposNegocio.tipoNegocioId, tiposNegocio.id))
            .where(eq(productoTiposNegocio.productoId, p.id));
          return { ...p, tiposNegocio: tipos };
        })
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/catalog/productos", requireAuth, async (req: Request, res: Response) => {
    try {
      const { codigoProducto, nombre, descripcion, precio, tipoNegocioIds } = req.body;
      const [item] = await db.insert(productos).values({ codigoProducto, nombre, descripcion, precio: String(precio) }).returning();
      if (tipoNegocioIds && tipoNegocioIds.length > 0) {
        await db.insert(productoTiposNegocio).values(
          tipoNegocioIds.map((tipoNegocioId: number) => ({ productoId: item.id, tipoNegocioId }))
        );
      }
      res.status(201).json(item);
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.constraint) {
        return res.status(400).json({ message: "El código ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/catalog/productos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { codigoProducto, nombre, descripcion, precio, tipoNegocioIds } = req.body;
      const [updated] = await db.update(productos).set({ codigoProducto, nombre, descripcion, precio: String(precio) }).where(eq(productos.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "No encontrado" });
      if (tipoNegocioIds !== undefined) {
        await db.delete(productoTiposNegocio).where(eq(productoTiposNegocio.productoId, id));
        if (tipoNegocioIds.length > 0) {
          await db.insert(productoTiposNegocio).values(
            tipoNegocioIds.map((tipoNegocioId: number) => ({ productoId: id, tipoNegocioId }))
          );
        }
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/catalog/productos/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(productoTiposNegocio).where(eq(productoTiposNegocio.productoId, id));
      await db.delete(productos).where(eq(productos.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.get("/api/catalog/kpis", requireAuth, async (_req: Request, res: Response) => {
    try {
      const data = await db.select().from(kpis);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.post("/api/catalog/kpis", requireAuth, async (req: Request, res: Response) => {
    try {
      const { codigoKpi, kpi, descripcion, valor } = req.body;
      const [item] = await db.insert(kpis).values({ codigoKpi, kpi, descripcion, valor }).returning();
      res.status(201).json(item);
    } catch (error: any) {
      if (error?.message?.includes("unique") || error?.constraint) {
        return res.status(400).json({ message: "El código ya existe" });
      }
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.put("/api/catalog/kpis/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { codigoKpi, kpi, descripcion, valor } = req.body;
      const [updated] = await db.update(kpis).set({ codigoKpi, kpi, descripcion, valor }).where(eq(kpis.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "No encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });

  app.delete("/api/catalog/kpis/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(kpis).where(eq(kpis.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error del servidor" });
    }
  });
}
