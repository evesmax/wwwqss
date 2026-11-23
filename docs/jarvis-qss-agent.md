# Llave de agente `jarvis-qss`: configuración, revocación y rotación

## Qué puede y qué no (lo impone el SERVIDOR)
Permisos por llave en `sd_agent_keys.permissions` y bandera `all_products`:

| Permiso | Habilita |
|---|---|
| `transition_terminal` | pasar a `closed`, `rejected`, `cancelled`, `duplicate` |
| `release` | pasar a `resolved` / `released` (lo que hace `release_ticket`) |
| `create_ticket` | `create_ticket` (solo producto `PLATAFORMAQSS`, origen `transversal` o `negocio`, máx. 20/hora) |

- `jarvis-qss` nace con `all_products=true` y `permissions=["create_ticket"]`: ve todos los productos activos (también los futuros), comenta, clasifica, registra tiempo/esfuerzo, pide información y mueve entre estados no terminales. No cierra, rechaza, cancela, marca duplicado ni libera.
- Las llaves existentes conservan `["transition_terminal","release"]` y `all_products=false` (la migración usa esos valores por omisión).
- Para autorizar más adelante a Jarvis a liberar (nivel N2): `PUT /api/desk/agent-keys/:id` (rol owner) con `permissions: ["create_ticket","release"]`. Sin cambios de código.

## Auditoría
Cada petición con una llave (aceptada o rechazada, incluidos 401/403/404/429) queda en `sd_agent_audit` con el id numérico de la llave, método, ruta, acción, ticket, estatus, resultado y motivo. Los eventos del ticket guardan el id de la llave en `actor_id`.
Consulta: `SELECT at, method, route, action, ticket_ref, status, outcome, reason FROM sd_agent_audit WHERE key_id = <id> ORDER BY id DESC LIMIT 100;`

## Configurar el MCP (sin la llave real)
Variables de entorno del servidor MCP `qss-desk` (la llave se carga en TU terminal/entorno, nunca en archivos del repo):
```
QSS_DESK_URL=https://<dominio-del-portal-QSS>
QSS_DESK_AGENT_KEY=<token qa_xxxxxxxxxxxxxxxx.yyyy…>   # se muestra una sola vez al crearla
```
Ejemplo (`claude mcp add`): `claude mcp add qss-desk -e QSS_DESK_URL=... -e QSS_DESK_AGENT_KEY="$QSS_DESK_AGENT_KEY" -- node /ruta/a/mcp/dist/index.js`

## Crear la llave (una sola vez, en tu terminal)
`DATABASE_URL=<producción> npm run desk:seed-jarvis -- key --inactive` imprime el token UNA vez; en la base solo queda su SHA-256. Se crea INACTIVA para no activarla antes de que el código que impone los permisos esté desplegado; se activa con `PUT /api/desk/agent-keys/:id` `{ "active": true, ... }` (o `UPDATE sd_agent_keys SET active = true WHERE name = 'jarvis-qss'`).

## Revocar
`PUT /api/desk/agent-keys/:id` (owner) con `active:false` o `UPDATE sd_agent_keys SET active=false WHERE name='jarvis-qss'`. Efecto inmediato (el siguiente request recibe 401 y queda auditado).

## Rotar
`POST /api/desk/agent-keys/:id/rotate` (owner): devuelve un secreto nuevo UNA vez; el anterior deja de funcionar al instante. Actualiza `QSS_DESK_AGENT_KEY` en el entorno del MCP.

## Migración (aditiva, reversible)
Se aplica al arrancar (`ensureServiceDeskSchema`, idempotente). Reversa manual: `server/serviceDesk/migrations/2026-11-22-jarvis.down.sql`.

## Pruebas
`RUN_DB_TESTS=1 DB_TEST_ON_BRANCH=1 DATABASE_URL=<rama de pruebas de Neon> npm test`. Sin `DB_TEST_ON_BRANCH=1` la suite se niega a correr contra la base (nunca contra `main`).
