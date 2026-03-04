import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureIndexes() {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id)`,
    `CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)`,
    `CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module)`,
    `CREATE INDEX IF NOT EXISTS idx_clientes_tipo_negocio_id ON clientes(tipo_negocio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON clientes(tipo)`,
    `CREATE INDEX IF NOT EXISTS idx_etapas_venta_orden ON etapas_venta(orden)`,
    `CREATE INDEX IF NOT EXISTS idx_etapas_venta_kpi_id ON etapas_venta(kpi_id)`,
    `CREATE INDEX IF NOT EXISTS idx_producto_tipos_negocio_producto_id ON producto_tipos_negocio(producto_id)`,
    `CREATE INDEX IF NOT EXISTS idx_producto_tipos_negocio_tipo_negocio_id ON producto_tipos_negocio(tipo_negocio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_cliente_id ON oportunidades(cliente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_etapa_venta_id ON oportunidades(etapa_venta_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_responsable_id ON oportunidades(responsable_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_producto_id ON oportunidades(producto_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_tipo_negocio_id ON oportunidades(tipo_negocio_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_estado ON oportunidades(estado)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_estado_etapa ON oportunidades(estado, etapa_venta_id)`,
    `CREATE INDEX IF NOT EXISTS idx_oportunidades_created_at ON oportunidades(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_historial_etapas_oportunidad_id ON historial_etapas(oportunidad_id)`,
    `CREATE INDEX IF NOT EXISTS idx_historial_etapas_etapa_venta_id ON historial_etapas(etapa_venta_id)`,
    `CREATE INDEX IF NOT EXISTS idx_historial_etapas_etapa_entrada ON historial_etapas(etapa_venta_id, entrada_at)`,
    `CREATE INDEX IF NOT EXISTS idx_historial_etapas_salida_at ON historial_etapas(salida_at)`,
    `CREATE INDEX IF NOT EXISTS idx_historial_etapas_op_salida ON historial_etapas(oportunidad_id, salida_at)`,
    `CREATE INDEX IF NOT EXISTS idx_cotizaciones_oportunidad_id ON cotizaciones(oportunidad_id)`,
    `CREATE INDEX IF NOT EXISTS idx_actividades_oportunidad_id ON actividades(oportunidad_id)`,
    `CREATE INDEX IF NOT EXISTS idx_actividades_op_created ON actividades(oportunidad_id, created_at DESC)`,
  ];

  for (const idx of indexes) {
    await db.execute(sql.raw(idx));
  }
}
