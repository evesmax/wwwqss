# QSS Service Desk — Diseño de implementación

**Fecha:** 2026-11-07 · **Fuente de requerimientos:** `REQUERIMIENTOS_QSS_Ticketing_SLA.md` y `_parte2.md` (v0.2, en ~/Downloads). Este documento fija *cómo* se construye en este repo; los IDs RF-/RNF-/SDK- remiten a esos requerimientos.

## 1. Intención

Un solo sistema de soporte para QSS: intake (portal, widget, correo, API), tickets, SLA medible, disponibilidad, informe mensual y, después, proyectos. Hoy el soporte vive en hojas sin timestamps; cada mes sin datos es irrecuperable, por eso el motor de SLA y la captura de timestamps son prioridad.

## 2. Decisiones del Owner (confirmadas en chat 2026-11-07)

1. Entrega **incremental**: se termina un hito, se prueba, se sube a `main` (deploy automático a Cloud Run) y recién entonces se sigue con el siguiente.
2. **Proyectos (M2b/M10) quedan fuera de la primera fase**; el modelo de datos no debe estorbarles.
3. Tablas nuevas en la base de `NEW_DATABASE_URL` (Neon us-east-2, la misma del CRM), con prefijo `sd_`.
4. Correo saliente: **Nodemailer con SMTP configurable por el Owner desde una pantalla de ajustes** (mismo patrón que NexusTransporte `emailService.ts`). Hasta que se configure, los correos se registran en una bitácora como «no enviados» sin romper el flujo.
5. Infraestructura GCP (bucket, Scheduler) la crea el agente con `gcloud`, presupuesto bajo (<10 USD/mes por servicio).
6. Rutas sobre el dominio actual (`/admin/soporte`, `/portal`, `/status`, `/api/v1/sdk`).
7. Monitores: Cloud Scheduler en 2 regiones.
8. Se autoriza endurecer el login actual: sesión en Postgres, `SESSION_SECRET` obligatorio, cookie segura, retirar `admin/admin123`, MFA TOTP para internos.
9. Portal de cliente con enlace mágico por correo (sin contraseñas).
10. SDK sin modo anónimo: siempre JWT firmado por el backend del producto.
11. SLA v2 de la sección 10 de los requerimientos como valores iniciales, configurables.
12. Sin guardia 24x7 (M8 omitido): P0/P1 en horario hábil extendido; alertas por correo.
13. Minuto caído = falla en 2 ubicaciones consecutivas; mes en `America/Mexico_City`; caídas de terceros se listan, no se excluyen.
14. Informe mensual con aprobación manual del gerente antes del envío; logo QSS.
15. Planes: Suscripción, Proyecto, Bolsa de horas, Demo, Interno; sin tarifa de horas extra.
16. Piloto del SDK: QPulseMes / cuenta Rototec (repo local `~/projects/personal/QPulseMes`).
17. «Agentes» = usuarios finales de cada producto.
18. **Importadores** para CSV/xlsx de TRT, GQB, Rototec (y luego cronograma); sin los archivos reales se construyen contra el formato descrito y datos ficticios.
19. Cuentas semilla ficticias.
20. Buzón de pruebas: el que el Owner configure en la pantalla de SMTP.

## 3. Metas, no-metas, anti-metas

**Metas:** timestamps y tipo en el 100 % de tickets; SLA calculado por servidor y reproducible; aislamiento total entre cuentas; informe mensual sin números inventados (N/D cuando falte dato).
**No-metas v1:** facturación, chat en vivo, app móvil, base de conocimiento, repetición de sesión, guardia 24x7, proyectos.
**Anti-metas:** un 100 % ficticio en un informe; que un cliente vea datos de otro o notas internas; que el SDK rompa la app anfitriona.

## 4. Arquitectura (decisión del agente, ajustada al stack real)

El documento de requerimientos supone AWS/RLS/cola; el stack real es **GCP Cloud Run + Neon + Express + Drizzle + React/Wouter/shadcn**. Se adapta así:

| Requerimiento | Implementación |
|---|---|
| App separada | Módulo dentro de este repo: `server/serviceDesk/*`, `client/src/pages/desk/*`, `client/src/pages/portal/*` |
| RLS (RNF-SEC-01) | Capa de acceso a datos única (`scopedDb(actor)`) que obliga filtro por cuenta; prueba automática de fuga entre cuentas bloquea el merge. RLS de Postgres no se usa por fragilidad con el pool serverless. |
| Cola de jobs | Cloud Scheduler → endpoints internos protegidos con token (SLA tick cada minuto, monitores, informes, recordatorios) |
| S3 | Google Cloud Storage con URLs prefirmadas |
| SES | SMTP configurable (Nodemailer) |
| Sesiones | `connect-pg-simple` (ya es dependencia) |
| Maestro de clientes | Tabla `clientes` existente = cuenta cliente; `sd_*` la referencia por FK |
| Motor SLA | Módulo puro (`slaEngine.ts`) sin I/O, con suite dorada (RF-SLA-09) |
| Migraciones | `drizzle-kit push` contra tablas `sd_*` nuevas; no se tocan las existentes salvo columnas aditivas |
| Feature flag | `SD_ENABLED`; el CRM actual no cambia |

## 5. Hitos y orden (cada uno: probar → merge a `main` → siguiente)

- **H0 Endurecimiento de auth + fundaciones:** sesiones en PG, MFA, roles internos×alcance, usuarios de cliente, auditoría inmutable, jerarquía Producto/Cuenta/Instancia/Contrato, pantalla de ajustes SMTP, seed con 3 cuentas ficticias.
- **H1 Ticketing núcleo + portal:** tipos, estados, comentarios públicos/internos, adjuntos (GCS), horas, vistas, portal con enlace mágico, correo saliente. Correo entrante: webhook genérico, activable cuando exista proveedor.
- **H2 Motor de SLA:** RF-SLA-01…09, calendarios MX, alertas por correo, exclusiones, vista al cliente.
- **H3 Importadores:** CSV de TRT/GQB/Rototec (`sla_applicable=false`, marca de calidad de datos).
- **H4 SDK + ingesta:** widget (Shadow DOM), captura híbrida, anotación, contexto, JWT, subida prefirmada, cola offline; instalación en QPulseMes.
- **H5 Disponibilidad:** monitores, cálculo mensual, incidentes de plataforma, mantenimiento, status page.
- **H6 Informe mensual:** instantánea versionada, PDF/HTML, aprobación, envío.
- **H7 Features, cotización, UAT, bolsa de horas.**
- **Después:** proyectos (M2b/M10), endurecimiento final (M9).

Cada hito: pruebas automáticas, verificación en navegador local, `npm run check` en verde, commit, push a `main`, verificación del deploy.

## 6. Qué se deja al builder

Esquema exacto de tablas, nombres de rutas, diseño visual (se sigue el estilo del admin actual con shadcn), librería de PDF, librería TOTP. Cualquier ambigüedad en reglas de SLA se resuelve con la sección 10 de los requerimientos y se deja configurable.

## 7. Riesgos conocidos

- La `DATABASE_URL` de `conn.env.docker` está deshabilitada; se usa `NEW_DATABASE_URL`. Confirmar que Cloud Run apunta a la misma.
- Endurecer el login puede cerrar la sesión actual de admin: se crea primero un usuario Owner nuevo con MFA antes de retirar `admin123`.
- Correo entrante, SMTP real y SDK en producto real no se pueden verificar de extremo a extremo hasta que existan credenciales; se declara en cada entrega qué quedó sin probar.
