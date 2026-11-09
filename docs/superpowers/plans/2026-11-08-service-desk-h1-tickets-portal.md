# H1 — Tickets + portal de cliente (plan resumido)

Spec: docs/superpowers/specs/2026-11-07-service-desk-design.md (hito H1). Requerimientos RF-IN-01/05/07, RF-WK-01/02/04/06, §5.1–5.2.

Tareas (TDD, cada una con commit):
1. `ticketRules.ts` — módulo puro: tipos, máquinas de estado (ops y features), reglas de severidad/P0, RCA, pausas, reapertura, folio `PREFIJO-0001`. Tests.
2. Esquema `sd_tickets`, `sd_ticket_events` (inmutable), `sd_ticket_comments`, `sd_time_entries`, `sd_ticket_attachments`, `sd_portal_tokens`; contador por cuenta (`sd_accounts.ticket_seq`). DDL idempotente.
3. `ticketService.ts` + API admin `/api/desk/tickets*` (listar/filtrar, crear, detalle, transición, edición, comentarios públicos/internos, horas, adjuntos). Acuse automático y notificación al solicitante por correo.
4. Portal: enlace mágico (token hash, 15 min, un solo uso, límite por correo), sesión de contacto, API `/api/portal/*` (aislamiento por cuenta/solicitante; nunca notas internas).
5. UI admin: lista, detalle y alta de tickets.
6. UI portal: `/portal` (login, verificación, lista, alta, detalle).
7. Prueba HTTP de aislamiento (RUN_DB_TESTS), revisión, merge a main, verificación de deploy.

Rulings: adjuntos en Postgres (bytea, ≤5 MB) en lugar de GCS por ahora (sin dependencia de infra; migrable); correo entrante (webhook) queda para cuando exista proveedor.
