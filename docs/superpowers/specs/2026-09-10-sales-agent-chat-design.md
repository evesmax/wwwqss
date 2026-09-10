# Agente de ventas público (chat) — diseño

Fecha: 2026-09-10
Estado: aprobado, pendiente de plan de implementación

## Objetivo

Sustituir la burbuja de chat genérica embebida (iframe a `qssintelligence.replit.app`)
por un agente propio, integrado al código de wwwqss, que:

1. Conoce a fondo los 6 productos del home (QNexus Control, QCampusOne, QNexusApp,
   HolaKura, Auranuba, QPulseMES) y el servicio de Software a la Medida.
2. Conversa con el visitante para entender su interés y responder dudas.
3. Pide nombre, nombre de empresa y teléfono (obligatorios) y email (opcional).
4. Al tener esos datos, crea automáticamente un lead en el CRM (`oportunidades` +
   `clientes`), ligado al producto de interés cuando aplica, con el transcript
   completo de la conversación guardado como actividad.
5. Es accesible desde una burbuja flotante pública (con label visible, no icono
   genérico) y desde un botón en la sección de Contáctanos.

## No-objetivos (fuera de alcance)

- Grabación/transcripción de **voz** — se descartó explícitamente a favor de chat
  de texto con transcript guardado en base de datos.
- Streaming de respuesta token-por-token — se usa function-calling con respuesta
  completa por turno (ver "Decisión: streaming vs. no-streaming" abajo).
- Tocar o decidir nada sobre el proyecto `qssintelligence` en Replit — solo se
  elimina la referencia/embed en `wwwqss`. Qué pasa con ese proyecto queda para
  cuando se revise en la lista de "por confirmar" del plan de migración general.
- Framework de testing automatizado nuevo — no existe hoy en el repo; se valida
  con pruebas manuales guiadas end-to-end.
- Asignación automática de responsable en el CRM — los leads quedan sin asignar,
  el equipo los toma manualmente desde el Kanban.

## Decisión: streaming vs. no-streaming

Dos opciones evaluadas:

- **A (elegida): function-calling + respuesta completa por turno.** El modelo
  tiene una tool `crear_lead(...)` que invoca cuando ya reunió los datos
  requeridos. El backend ejecuta la creación real, se lo confirma al modelo, y
  éste genera el mensaje de cierre. Sin streaming — cada respuesta llega
  completa. Más simple y confiable de implementar correctamente.
- **B (descartada): extracción estructurada aparte + streaming.** Mantiene el
  efecto de escritura en vivo del chat de admin, pero requiere una segunda
  llamada a Gemini después de cada turno para detectar si ya hay datos
  suficientes — duplica costo de API y es más propenso a desincronización entre
  lo que el usuario ve y lo que el backend decide.

Se eligió A por confiabilidad: perder el efecto de streaming es un costo de UX
menor comparado con el riesgo de una lógica de extracción frágil que puede
fallar en crear el lead silenciosamente.

## Arquitectura

### Backend — `server/salesAgentRoutes.ts` (nuevo)

- `registerSalesAgentRoutes(app: Express): void`, registrado en `server/index.ts`
  o `server/routes.ts` igual que `registerCatalogRoutes`/`registerPipelineRoutes`.
- `POST /api/agent/chat` — **sin** `requireAuth` (endpoint público).
  - Body: `{ message: string, history: {role, content}[] }` — mismo shape que ya
    usa `GeminiChat.tsx` para el chat de admin.
  - Reutiliza el patrón de cliente Gemini ya corregido en esta sesión: usa
    `AI_INTEGRATIONS_GEMINI_API_KEY`, con `httpOptions`/`baseUrl` del proxy de
    Replit solo si `AI_INTEGRATIONS_GEMINI_BASE_URL` está definido (igual que
    `server/replit_integrations/chat/routes.ts` e `image/client.ts`).
  - Define una tool de function-calling para el modelo:
    ```
    crear_lead({
      nombre: string,        // nombre de la persona de contacto
      empresa: string,       // nombre del negocio
      telefono: string,
      email?: string,
      producto: string,      // nombre del producto tal como lo entiende el usuario
    })
    ```
  - El system prompt incluye:
    - Rol: asesor experto de QSS, tono cercano y consultivo, en español.
    - Descripción de cada uno de los 6 productos + Software a la Medida,
      redactada a partir del contenido real de sus páginas (`client/src/pages/*`),
      no inventada.
    - Instrucción explícita: no llamar `crear_lead` hasta tener nombre, empresa
      y teléfono; email es opcional pero se debe ofrecer pedirlo.
    - Instrucción de mapear `producto` a uno de los 6 nombres conocidos cuando
      aplique, o dejarlo como "Software a la Medida" si el interés es a medida.
  - Al recibir una function call válida del modelo:
    1. Buscar `cliente` existente por `telefonoContacto` (dedupe); si no existe,
       crear uno nuevo (`tipo: "Prospecto"`, `nombreNegocio: empresa`,
       `nombreContacto: nombre`, `telefonoContacto: telefono`, `metadata: {email}`
       si se dio email — `clientes` no tiene columna dedicada de email, va en
       `metadata` JSONB).
    2. Resolver `productoId`: buscar en la tabla `productos` por nombre
       (case-insensitive, coincidencia parcial tolerante); si es "Software a la
       Medida" o no hay match, `productoId = null`.
    3. Resolver `etapaVentaId`: la etapa con `inicial = true` (hoy
       "Prospección (BDR)", id 1) — consultar en vez de hardcodear el id.
    4. Generar `codigo` `OP-NNN` reusando el mismo patrón de
       `server/pipelineRoutes.ts` (buscar el último código, incrementar).
    5. Insertar `oportunidad`: `nombre` = `"<empresa> - <producto>"`,
       `clienteId`, `tipoNegocioId: null`, `productoId`, `etapaVentaId`,
       `valorEstimado: 0`, `probabilidad` = la de la etapa inicial,
       `responsableId: null`, `estado: "activa"`.
    6. Insertar `actividad`: `tipo: "nota"`, `descripcion` = transcript completo
       de la conversación (todos los turnos usuario/asistente), `usuarioId: null`.
    7. Devolver el resultado de la function call al modelo (Gemini) para que
       genere el mensaje de cierre natural al usuario.
  - Respuesta al frontend: `{ reply: string, leadCreated: boolean }`.
  - Rate limiting básico por IP (in-memory, sin dependencia nueva si es viable
    con un `Map` + ventana de tiempo simple; si no alcanza, evaluar
    `express-rate-limit` como dependencia nueva, proporcional al riesgo de un
    endpoint público que cuesta dinero y escribe en la base).

### Frontend

- `client/src/lib/chatWidgetContext.tsx` (nuevo) — contexto de React chico:
  `{ isOpen, openChat(), closeChat() }`. Sin dependencia externa de estado
  global, solo `useState` + `createContext`.
- `client/src/components/SalesAgentChat.tsx` (nuevo) — burbuja flotante pública:
  - Visible en todas las páginas públicas (no en `/admin`).
  - Icono + label visible junto al botón (ej. "Habla con un experto"), no un
    ícono genérico sin contexto.
  - Ventana de chat de texto simple: sin drag (a diferencia del chat de admin),
    input + envío, muestra "escribiendo…" mientras espera respuesta (sin
    streaming real, es una espera con indicador).
  - Cuando `leadCreated: true` llega en la respuesta, mostrar un estado visual
    de confirmación (ej. banner "Un asesor te contactará pronto") sin cerrar el
    chat a la fuerza — el usuario puede seguir escribiendo si quiere.
- `client/src/App.tsx` — envolver `<Router />` en `ChatWidgetProvider`, montar
  `<SalesAgentChat />` una sola vez a nivel global (mismo lugar que `<Toaster />`).
- `client/src/components/ContactSection.tsx` — agregar un botón/CTA que llama
  `openChat()` del contexto, cerca del formulario de contacto tradicional
  (ambos caminos coexisten, no se reemplaza el formulario).
- `client/index.html` — eliminar el bloque `<script>` (líneas ~71-145) que
  inyecta el iframe de `qssintelligence.replit.app`.

### Base de datos

- Un `INSERT` en `productos` para QPulseMES (código sugerido `SAAS004`, a
  confirmar convención con los existentes `SAAS001-003`/`TIER001-002`).
- Sin cambios de schema — se reutilizan `clientes`, `oportunidades`,
  `actividades`, `productos`, `etapasVenta` tal como existen hoy.

## Manejo de errores

- Falla de red/API de Gemini → mensaje amigable en el chat ("Hubo un problema,
  intenta de nuevo"), sin crashear el server (try/catch igual que el patrón ya
  usado en `/api/admin/chat`).
- Falla al escribir en la base durante la creación del lead → **nunca se pierde
  el lead silenciosamente**: loguear server-side el payload completo
  (nombre/empresa/teléfono/email/producto/transcript) para recuperación manual,
  y responder al usuario sugiriendo el formulario de contacto tradicional como
  respaldo.
- Rate limit excedido → mensaje simple no técnico ("Estamos recibiendo muchos
  mensajes, intenta en un momento"), no un error 500 genérico.

## Testing

Sin framework de tests automatizados en el repo. Validación manual guiada
end-to-end, mismo enfoque que se usó para verificar la migración a Cloud Run:

- Conversación completa hasta creación de lead → verificar fila real en
  `oportunidades` y `actividades` en la base de datos.
- Caso: usuario no quiere dar teléfono → el agente no debe crear el lead.
- Caso: usuario pide "Software a la Medida" → lead se crea con `productoId null`
  y el texto correcto en nombre/nota.
- Caso: mismo teléfono contacta dos veces → debe reusar el `cliente` existente,
  no duplicarlo.
- Caso: mensajes fuera de tema / intento de abuso → el agente no debe intentar
  crear leads con datos falsos o inventados.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `server/salesAgentRoutes.ts` | Nuevo |
| `server/routes.ts` (o `index.ts`) | Registrar `registerSalesAgentRoutes` |
| `client/src/lib/chatWidgetContext.tsx` | Nuevo |
| `client/src/components/SalesAgentChat.tsx` | Nuevo |
| `client/src/App.tsx` | Montar provider + widget |
| `client/src/components/ContactSection.tsx` | Agregar botón que abre el chat |
| `client/index.html` | Eliminar script del iframe viejo |
| DB `productos` | Insert de QPulseMES |

## Puntos a verificar durante la implementación

- Confirmar convención de `codigoProducto` para QPulseMES contra los existentes.
- Redactar las descripciones de producto del system prompt a partir del
  contenido real de cada página (`client/src/pages/*Page.tsx`), no inventarlas.
- Decidir el mecanismo exacto de rate-limit (in-memory simple vs. dependencia)
  al momento de implementar, según cuánta fricción agregue.
