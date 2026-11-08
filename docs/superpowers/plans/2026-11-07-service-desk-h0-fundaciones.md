# Service Desk H0 — Auth endurecido y fundaciones: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer el login del admin (sesión en Postgres, MFA TOTP, sin `admin123`) y crear las fundaciones del Service Desk: tablas `sd_*`, modelo rol×alcance, auditoría inmutable, configuración SMTP editable, catálogo de soporte (productos/cuentas/instancias/contratos/contactos) y cuentas semilla.

**Architecture:** Módulo `server/serviceDesk/` dentro del Express actual, detrás de `SD_ENABLED`. Todo acceso a datos de soporte pasa por una capa de alcance (`access.ts`) derivada de `sd_role_assignments`. UI en `client/src/pages/admin/desk/` montada en el `AdminApp` existente bajo `/soporte/*`.

**Tech Stack:** Express + Drizzle + Neon (existentes); nuevas dependencias `otplib`, `qrcode`, `nodemailer`, `@types/nodemailer`, `@types/qrcode`. Pruebas con `node:test` ejecutado por `tsx --test` (no hay framework de pruebas hoy; no se agrega uno).

**Spec:** `docs/superpowers/specs/2026-11-07-service-desk-design.md` (requerimientos fuente en `~/Downloads/REQUERIMIENTOS_QSS_Ticketing_SLA*.md`: RNF-SEC-01, §4, RF-ADM-02/03).

## Global Constraints

- Tablas nuevas con prefijo `sd_`, en la base de `NEW_DATABASE_URL`; solo cambios aditivos a tablas existentes (`users`).
- No pruebas contra datos reales: las pruebas con BD corren dentro de una transacción que se revierte, o usan funciones puras.
- Timestamps en UTC (`timestamp` con default `CURRENT_TIMESTAMP`, como el resto del esquema).
- Textos de UI en español (es-MX). Estilo visual: el del admin actual (shadcn, color `#00aeef`).
- Un usuario de cliente nunca ve otra cuenta (RNF-SEC-01): ante un id fuera de alcance se responde 404, no 403.
- Secretos nunca en el repo ni en logs; la contraseña SMTP nunca sale de ningún endpoint.
- Funcionalidad del CRM actual intacta; todo lo nuevo detrás de `SD_ENABLED=true`, salvo el endurecimiento de auth que aplica siempre.
- Mensajes de commit terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Cada tarea termina con `npm run check` y `npm test` en verde.

## Review Focus

1. Sesión con MFA pendiente (`pendingUserId`) no debe pasar `requireAuth` en ninguna ruta.
2. Usuario con cero asignaciones de rol ve cero cuentas (nunca «todas»).
3. Usuario desactivado con sesión viva pierde acceso en la siguiente petición.
4. Fuerza bruta de login/MFA: 5 intentos fallidos por IP+usuario en 15 min bloquean con 429.
5. Contraseña SMTP no aparece en respuestas, bitácora de auditoría ni logs; `PUT` sin campo contraseña conserva la guardada.

---

## File Structure

- Modify `package.json` — scripts `test`, `desk:seed`, `desk:create-owner`; dependencias.
- Modify `shared/schema.ts` — columnas `totpSecret`, `totpEnabled` en `users`; tablas `sd_*`.
- Modify `server/auth.ts` — `verifyPassword` en tiempo constante; `seedAdminUser` ya no crea `admin/admin123`.
- Modify `server/routes.ts` — sesión en PG, secreto obligatorio, cookie segura, flujo MFA, rate limit, usuario activo en cada petición.
- Modify `server/index.ts` — registrar rutas desk si `SD_ENABLED`.
- Modify `server/dbIndexes.ts` — índices `sd_*` y trigger de inmutabilidad de auditoría.
- Create `server/serviceDesk/totp.ts` — generar/verificar TOTP.
- Create `server/serviceDesk/access.ts` — `resolveScope`, `loadActor`, `canAccessAccount`.
- Create `server/serviceDesk/audit.ts` — `writeAudit`.
- Create `server/serviceDesk/crypto.ts` — cifrado AES-256-GCM de secretos de configuración.
- Create `server/serviceDesk/settings.ts` — lectura/escritura de `sd_settings`.
- Create `server/serviceDesk/emailService.ts` — `sendEmail`, bitácora `sd_email_log`.
- Create `server/serviceDesk/routes.ts` — API `/api/desk/*`.
- Create `server/scripts/createOwner.ts`, `server/scripts/seedDesk.ts`.
- Create `client/src/pages/admin/desk/{SecurityPage,SmtpSettingsPage,SupportCatalogPage}.tsx`; modify `AdminApp.tsx`, `AdminLayout.tsx`, `AdminLogin.tsx`.
- Tests junto al código: `server/serviceDesk/*.test.ts`.

---

### Task 1: Pruebas, dependencias y TOTP puro

**Files:**
- Modify: `package.json`
- Create: `server/serviceDesk/totp.ts`
- Test: `server/serviceDesk/totp.test.ts`

**Interfaces:**
- Produces: `generateTotpSecret(): string`, `totpUri(secret: string, account: string): string`, `verifyTotp(secret: string, token: string): boolean` (ventana ±1 paso de 30 s).

- [ ] **Step 1: Instalar** `npm i otplib qrcode nodemailer && npm i -D @types/nodemailer @types/qrcode`; agregar script `"test": "tsx --test server/**/*.test.ts"`.
- [ ] **Step 2: Escribir pruebas** en `totp.test.ts`: `verifyTotp(secret, authenticator.generate(secret))` es `true`; token `"000000"` es `false`; token de 30 s atrás es `true`, de 90 s atrás es `false`; `totpUri` empieza con `otpauth://totp/` y contiene el issuer `QSS`.
- [ ] **Step 3: Correr** `npm test` — falla (módulo inexistente).
- [ ] **Step 4: Implementar** `totp.ts` con `otplib` (`authenticator.options = { window: 1 }`, issuer `QSS`).
- [ ] **Step 5: Correr** `npm test` y `npm run check` — pasan.
- [ ] **Step 6: Commit** `feat(desk): add test runner and TOTP helpers`.

---

### Task 2: Esquema `sd_*` y columnas MFA

**Files:**
- Modify: `shared/schema.ts`, `server/dbIndexes.ts`, `package.json` (script `db:push` ya existe)

**Interfaces:**
- Produces (exportados desde `shared/schema.ts`):
  - `users.totpSecret: text|null`, `users.totpEnabled: boolean default false`.
  - `sdProducts(id, code unique, name, active, createdAt)`.
  - `sdAccounts(id, clienteId FK clientes unique, accountType text, ticketPrefix text unique, active, createdAt)` — `accountType` ∈ `suscripcion|proyecto|bolsa_horas|demo|interno`.
  - `sdInstances(id, accountId FK, productId FK, name, environment text default 'prod', baseUrl text, active)`.
  - `sdContracts(id, accountId FK, productId FK, plan text, slaActiveFrom timestamp|null, calendar text default 'America/Mexico_City', reportRecipients jsonb default [], hoursBank numeric|null, active)`.
  - `sdContacts(id, accountId FK, email text, name, role text)` — `role` ∈ `account_admin|contact|reporter`; unique `(accountId, email)`.
  - `sdRoleAssignments(id, userId FK users, role text, scopeType text, scopeId integer|null)` — `role` ∈ `owner|support_manager|agent_l2|agent_l1|finance|readonly`; `scopeType` ∈ `global|product|account`.
  - `sdSettings(key text pk, value jsonb, updatedAt, updatedBy integer|null)`.
  - `sdEmailLog(id, toAddress, subject, status text, error text|null, createdAt)` — `status` ∈ `sent|failed|not_configured`.
  - `sdAuditLog(id bigserial, at timestamp, actorUserId integer|null, action text, entity text, entityId text|null, detail jsonb)`.

- [ ] **Step 1: Escribir prueba** `schema.test.ts`: importar los exports anteriores y afirmar que `getTableConfig(sdContacts).uniqueConstraints` incluye `(account_id, email)` y que los nombres SQL empiezan con `sd_`.
- [ ] **Step 2: Correr** — falla.
- [ ] **Step 3: Agregar tablas y columnas** a `shared/schema.ts` con el mismo estilo (serial pk, `createdAt` con `CURRENT_TIMESTAMP`).
- [ ] **Step 4: En `ensureIndexes`** agregar índices por `account_id`, `user_id`, `(entity, entity_id)` de auditoría, y el trigger `sd_audit_immutable` (`BEFORE UPDATE OR DELETE ON sd_audit_log` → `RAISE EXCEPTION`), creado con `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS`.
- [ ] **Step 5: Aplicar** `source conn.env.docker; DATABASE_URL=$NEW_DATABASE_URL npm run db:push`; revisar que el diff solo muestre tablas `sd_*` y las 2 columnas de `users`. Verificar con `information_schema` que existen.
- [ ] **Step 6: Correr** `npm test`, `npm run check`; **Commit** `feat(desk): add sd_* schema and MFA columns`.

---

### Task 3: Alcance rol×alcance y auditoría

**Files:**
- Create: `server/serviceDesk/access.ts`, `server/serviceDesk/audit.ts`
- Test: `server/serviceDesk/access.test.ts`, `server/serviceDesk/audit.test.ts`

**Interfaces:**
- Consumes: tablas de Task 2.
- Produces:
  - `type Scope = { global: boolean; productIds: Set<number>; accountIds: Set<number> }`
  - `resolveScope(assignments: {scopeType: string; scopeId: number|null}[]): Scope` (puro).
  - `type Actor = { userId: number; roles: string[]; scope: Scope }`
  - `loadActor(userId: number): Promise<Actor|null>` — `null` si el usuario no existe o `active=false`.
  - `canAccessAccount(actor: Actor, accountId: number, accountProductIds: number[]): boolean` (puro): `global` → true; si no, `accountIds` contiene la cuenta **o** algún producto de la cuenta está en `productIds`.
  - `hasRole(actor: Actor, ...roles: string[]): boolean`.
  - `writeAudit(entry: {actorUserId: number|null; action: string; entity: string; entityId?: string; detail?: object}, tx?): Promise<void>`; elimina del `detail` cualquier clave `password|secret|token` (recursivo) antes de guardar.

- [ ] **Step 1: Pruebas de `access.test.ts`:** sin asignaciones → `canAccessAccount` false para cualquier cuenta; `global` → true; asignación de cuenta 5 → true para 5 y false para 6; asignación de producto 2 → true si la cuenta tiene producto 2 y false si no.
- [ ] **Step 2: Pruebas de `audit.test.ts`** (dentro de transacción revertida): `writeAudit` con `detail: {password: 'x', nested: {token: 'y', ok: 1}}` guarda `{nested: {ok: 1}}`; un `UPDATE` y un `DELETE` sobre `sd_audit_log` lanzan error por el trigger.
- [ ] **Step 3: Correr** — fallan.
- [ ] **Step 4: Implementar** ambos módulos.
- [ ] **Step 5: Correr** tests y check — pasan. **Commit** `feat(desk): scope resolution and immutable audit`.

---

### Task 4: Endurecer autenticación

**Files:**
- Modify: `server/auth.ts`, `server/routes.ts`
- Create: `server/scripts/createOwner.ts`
- Test: `server/auth.test.ts`

**Interfaces:**
- Consumes: `totp.ts` (Task 1), `writeAudit` (Task 3), `rateLimiter.ts` existente.
- Produces: `verifyPassword` con `crypto.timingSafeEqual` (mismo formato `salt:hash`, compatible con hashes existentes); `requireAuth` exige `session.userId` y usuario activo (consulta a BD); `SessionData.pendingUserId?: number`.
- Rutas nuevas: `POST /api/auth/mfa {token}` completa el login; `POST /api/auth/mfa/setup` → `{secret, otpauthUri, qrDataUrl}` (guarda secreto aún no habilitado); `POST /api/auth/mfa/enable {token}`; `POST /api/auth/mfa/disable {token}`. `POST /api/auth/login` responde `{mfaRequired: true}` si `totpEnabled` y establece solo `pendingUserId`.

- [ ] **Step 1: Pruebas de `auth.test.ts`:** `verifyPassword` acepta un hash generado por `hashPassword`, rechaza contraseña errónea y rechaza hash malformado sin lanzar excepción.
- [ ] **Step 2: Correr** — la de hash malformado falla.
- [ ] **Step 3: En `auth.ts`:** `timingSafeEqual`; `seedAdminUser` pasa a crear un administrador solo si la tabla `users` está vacía **y** existen `BOOTSTRAP_ADMIN_USER`/`BOOTSTRAP_ADMIN_PASSWORD`; nunca `admin123`.
- [ ] **Step 4: En `routes.ts`:** store `connect-pg-simple` con el `Pool` de `db.ts` (`createTableIfMissing: true`, tabla `session`); en producción `SESSION_SECRET` obligatorio (lanzar si falta) y cookie `secure: true, sameSite: 'lax'`; en desarrollo se permite un secreto aleatorio por proceso. Rate limit 5 fallos / 15 min por IP+usuario en login y MFA → 429. `requireAuth` valida usuario activo. Auditar login ok/fallido, activar/desactivar MFA.
- [ ] **Step 5: Script `createOwner.ts`** (`npm run desk:create-owner -- --username x --email y [--disable-default-admin]`): crea usuario con contraseña aleatoria de 20 caracteres impresa una sola vez, rol `Administrador` del RBAC actual y asignación `sd_role_assignments(owner, global)`; con el flag desactiva (`active=false`) el usuario `admin` solo si ya existe otro usuario activo con rol Administrador.
- [ ] **Step 6: Verificación manual local:** `npm run dev`, login con el Owner nuevo, activar MFA con una app TOTP, cerrar sesión, entrar con código; sesión con solo `pendingUserId` recibe 401 en `GET /api/admin/users`; confirmar con `curl -i` que la cookie lleva `HttpOnly` (y `Secure` con `NODE_ENV=production`).
- [ ] **Step 7: Correr** tests y check; **Commit** `feat(auth): pg sessions, TOTP MFA, rate limit, no default admin`.

---

### Task 5: Pantallas de login MFA y seguridad

**Files:**
- Modify: `client/src/pages/admin/AdminLogin.tsx`, `AdminApp.tsx`, `AdminLayout.tsx`
- Create: `client/src/pages/admin/desk/SecurityPage.tsx`

**Interfaces:**
- Consumes: rutas MFA de Task 4.
- Produces: ruta `/security` en el admin; `AdminLogin` muestra segundo paso «Código de verificación» cuando la respuesta trae `mfaRequired`.

- [ ] **Step 1: Implementar** el segundo paso en `AdminLogin` (input de 6 dígitos, error «Código incorrecto», mensaje de bloqueo en 429).
- [ ] **Step 2: Implementar `SecurityPage`:** estado de MFA, botón «Activar» (muestra QR y campo para confirmar código), «Desactivar» (pide código); entrada «Seguridad» en el menú lateral.
- [ ] **Step 3: Verificar en navegador** (Chrome/Playwright): activar MFA, salir, entrar con código; captura del flujo. `npm run check` en verde.
- [ ] **Step 4: Commit** `feat(admin): MFA login step and security page`.

---

### Task 6: Cifrado, ajustes y servicio de correo SMTP

**Files:**
- Create: `server/serviceDesk/crypto.ts`, `settings.ts`, `emailService.ts`
- Test: `crypto.test.ts`, `emailService.test.ts`

**Interfaces:**
- Produces:
  - `encryptSecret(plain: string): string` / `decryptSecret(blob: string): string` — AES-256-GCM, clave = SHA-256 de `SETTINGS_ENCRYPTION_KEY` o, si no existe, de `SESSION_SECRET`; formato `iv:tag:cipher` en base64.
  - `type SmtpConfig = { host: string; port: number; secure: boolean; user: string; password: string; fromName: string; fromEmail: string }`
  - `getSmtpConfig(): Promise<SmtpConfig|null>`; `saveSmtpConfig(input: Omit<SmtpConfig,'password'> & {password?: string}, userId: number): Promise<void>` — si `password` es `undefined` o `''` conserva la guardada.
  - `sendEmail(msg: {to: string|string[]; subject: string; html: string; text?: string}): Promise<{status: 'sent'|'failed'|'not_configured'}>` — siempre inserta en `sd_email_log`; sin configuración no lanza.

- [ ] **Step 1: Pruebas:** `decryptSecret(encryptSecret('abc')) === 'abc'`; dos cifrados del mismo texto difieren; blob alterado lanza; `sendEmail` con transport inyectado falso devuelve `sent`; sin config devuelve `not_configured` y registra fila; con transport que lanza devuelve `failed` con `error` guardado.
- [ ] **Step 2: Correr** — fallan.
- [ ] **Step 3: Implementar.** `sendEmail` recibe el transport por parámetro opcional para pruebas (`createTransport` de nodemailer por defecto); `settings.ts` guarda `smtp` en `sd_settings` con el campo `password` cifrado.
- [ ] **Step 4: Correr** tests y check; **Commit** `feat(desk): encrypted SMTP settings and email service`.

---

### Task 7: API `/api/desk` y pantallas de ajustes y catálogo

**Files:**
- Create: `server/serviceDesk/routes.ts`, `client/src/pages/admin/desk/SmtpSettingsPage.tsx`, `SupportCatalogPage.tsx`
- Modify: `server/index.ts` (o `routes.ts`) para registrar bajo `SD_ENABLED`; `AdminApp.tsx`, `AdminLayout.tsx` (grupo «Soporte»).
- Test: `server/serviceDesk/routes.test.ts`

**Interfaces:**
- Consumes: `loadActor`, `hasRole`, `canAccessAccount`, `writeAudit`, `getSmtpConfig`, `saveSmtpConfig`, `sendEmail`.
- Produces (todas exigen `requireAuth` + MFA habilitado para usuarios con asignaciones sd, y rol indicado):
  - `GET/PUT /api/desk/settings/smtp` (solo `owner`; `GET` devuelve `hasPassword: boolean`, nunca la contraseña), `POST /api/desk/settings/smtp/test {to}`.
  - `GET/POST/PUT /api/desk/products`, `/api/desk/accounts`, `/api/desk/instances`, `/api/desk/contracts`, `/api/desk/contacts` (escritura: `owner|support_manager`; lectura filtrada por alcance del actor).
  - `GET/PUT /api/desk/users/:id/assignments` (solo `owner`).
  - Cuenta fuera de alcance → 404.

- [ ] **Step 1: Pruebas de rutas** con la app Express levantada en memoria y actor simulado: `GET smtp` jamás contiene la cadena de la contraseña guardada; agente con alcance de cuenta A recibe 404 al pedir la cuenta B y no la ve en el listado; usuario sin asignaciones recibe lista vacía; `agent_l1` recibe 403 en `PUT /accounts/:id`; `PUT smtp` sin `password` conserva la anterior.
- [ ] **Step 2: Correr** — fallan.
- [ ] **Step 3: Implementar rutas** validando entradas con `zod`; cada escritura llama `writeAudit`.
- [ ] **Step 4: UI `SmtpSettingsPage`:** formulario (servidor, puerto, seguro, usuario, contraseña con placeholder «•••• guardada», remitente), botón «Enviar correo de prueba». **UI `SupportCatalogPage`:** pestañas Productos, Cuentas, Instancias, Contratos, Contactos, Asignaciones; tablas con alta/edición en diálogo.
- [ ] **Step 5: Verificar en navegador:** guardar SMTP, probar envío (sin credenciales reales se espera estado `not_configured`/`failed` registrado, sin romper); crear una cuenta ligada a un cliente existente; recargar y ver persistencia. `npm run check` verde.
- [ ] **Step 6: Commit** `feat(desk): desk API, SMTP settings page and support catalog`.

---

### Task 8: Semilla, despliegue y verificación en producción

**Files:**
- Create: `server/scripts/seedDesk.ts`; modify `package.json` (`desk:seed`); modify `replit.md` o `CLAUDE.md` raíz con sección corta de Service Desk.

**Interfaces:**
- Produces: `npm run desk:seed` idempotente: productos QNexusControl, QPulseMes, QCampusOne; cuentas ficticias `DEMO-SUSC` (suscripción), `DEMO-PROY` (proyecto), `DEMO-BOLSA` (bolsa de horas) creadas como filas nuevas en `clientes` con código `DEMO-*`, cada una con instancia, contrato y un contacto `account_admin`; un usuario interno `demo.agente` con rol `agent_l2` alcance solo `DEMO-SUSC`.

- [ ] **Step 1: Escribir y correr el seed dos veces**; la segunda no duplica filas (contar antes/después).
- [ ] **Step 2: Verificar en Cloud Run** (solo lectura): `gcloud run services describe wwwqss --region us-central1 --project qss-wwwqss` y comparar el **host** del secreto `DATABASE_URL` con el de `NEW_DATABASE_URL` sin imprimir credenciales; confirmar que `SESSION_SECRET` existe como secreto. Si difieren, detenerse y reportar.
- [ ] **Step 3: Agregar `SD_ENABLED=true`** al servicio con `gcloud run services update --update-env-vars`; crear el Owner real con `desk:create-owner` apuntando a la base de producción y entregar la contraseña única al Owner; luego correr con `--disable-default-admin`.
- [ ] **Step 4: Merge a `main`**, esperar el workflow «Deploy to Cloud Run» en verde (`gh run watch`), y verificar en producción: login con MFA, pantalla SMTP, catálogo con cuentas demo, `curl -I` de cookie con `Secure`.
- [ ] **Step 5: Commit** `chore(desk): seed script and docs`; reportar al Owner qué quedó verificado y qué no.

---

## Self-review

- **Cobertura del spec H0:** auth endurecido (T1, T4, T5), jerarquía producto/cuenta/instancia/contrato (T2, T7), roles×alcance (T2, T3, T7), auditoría inmutable (T2, T3), SMTP configurable (T6, T7), semilla (T8), flag `SD_ENABLED` (T7, T8). Fuera de H0 a propósito: tickets, SLA, portal, importadores, SDK.
- **Consistencia:** `Actor`, `Scope`, `writeAudit`, `sendEmail`, `SmtpConfig` se definen en T3/T6 y se usan con los mismos nombres en T4/T7.
- **Riesgo operativo:** T4 y T8 retiran `admin/admin123`; el orden (crear Owner → verificar → desactivar `admin`) está fijado en el script para no dejar al Owner sin acceso.
