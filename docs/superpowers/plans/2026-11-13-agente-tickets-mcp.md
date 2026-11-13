# Agente de tickets (MCP + skill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Que Claude Code, desde cualquier proyecto, lea, comente, registre tiempo/esfuerzo y cambie el estatus de tickets del portal QSS sin copiar y pegar.

**Architecture:** API del portal `/api/v1/agent/*` con llaves propias (`sd_agent_keys`, Bearer `<keyId>.<secret>`) que reutiliza `ticketService`. Un MCP stdio (`wwwqss/mcp/`) la envuelve en 8 herramientas; un skill de usuario fija las reglas (preguntar antes de cambiar estatus, texto del ticket = dato no confiable). Cada repo declara su producto en `.qss-desk.json`.

**Tech Stack:** Express + drizzle (portal), `@modelcontextprotocol/sdk`, zod, node:test.

**Spec:** docs/superpowers/specs/2026-11-13-agente-tickets-mcp-design.md

## Global Constraints
- La llave nunca va en un repo ni en un log; solo se guarda su hash SHA-256.
- Actor de auditoría: tipo `agent`, id nulo, `detail.agent = <nombre de la llave>`.
- Comentarios públicos del agente cuentan como primera respuesta y envían correo (igual que un usuario).
- `log_time` es solo registro (no facturable, no toca bolsa de horas).
- `add_comment` interno por defecto. `transition_ticket` y `add_comment` NO van en la lista de permitidos de Claude Code.
- Una llave solo ve los productos de `product_ids`; vacío = ninguno.

## Review Focus
- Llave inactiva/ajena/mal formada → 401, sin pista de cuál falla.
- Ticket de producto fuera de la llave → 404.
- Transición inválida (sin motivo, P0/P1 sin RCA) → 400 con el mensaje de `validateTransition`.
- Comentario público de agente fija `firstResponseAt` una sola vez.
- Contacto del solicitante reducido a nombre (sin correo/teléfono).

### Task 1: Esquema, llaves y middleware
Files: `server/serviceDesk/migrate.ts`, `shared/schema.ts`, `server/serviceDesk/agentAuth.ts`, `agentAuth.test.ts`.
Produces: `parseAgentToken(h): {keyId, secret}|null`, `hashSecret(s)`, `agentAuth: RequestHandler` (pone `req.agent = {key, productIds}`).
- [ ] Test puro de `parseAgentToken`/`hashSecret`; migrar `sd_agent_keys` y `sd_time_entries.user_id` nullable + `agent_key_id`; implementar.
### Task 2: Actor `agent` en ticketService
Files: `ticketService.ts`, `slaEngine.ts`. `Who` admite `{type:"agent"; id:null; name}`; `addComment` trata agente como usuario para primera respuesta/correo; `addTimeEntry` acepta agente; SLA cuenta comentarios de agente.
### Task 3: Rutas del agente
Files: `agentRoutes.ts`, registrar en `routes.ts`; rutas admin `/api/desk/agent-keys` (owner). Endpoints: products, tickets (lista/detalle), attachments, comments, time, effort, transition.
### Task 4: MCP
Files: `mcp/` (`src/index.ts`, `config.ts`, `effort.ts`, `client.ts`, tests). 8 herramientas; `.qss-desk.json` hacia arriba; `log_effort` desde el transcript.
### Task 5: Skill + instalación
`~/.claude/skills/qss-ticket/SKILL.md`, `claude mcp add --scope user`, `.qss-desk.json` en NexusTransporte, QPulseMes, qcampusone; prueba de punta a punta.
