# Agente de ventas público (chat) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la burbuja de chat embebida (iframe a qssintelligence.replit.app) por un agente propio que conoce los productos de QSS, conversa con visitantes, y crea leads reales en el CRM (`clientes`/`oportunidades`/`actividades`) vía function-calling de Gemini una vez que tiene nombre, empresa y teléfono.

**Architecture:** Endpoint público `POST /api/agent/chat` (sin auth) en `server/salesAgentRoutes.ts`, reusando el patrón de cliente Gemini ya corregido en el proyecto (fallback a key directa sin el gateway de Replit). El modelo tiene una tool `crear_lead`; al invocarla, el backend ejecuta la escritura real en el CRM (`server/leadCapture.ts`) y responde con un mensaje de confirmación **generado por el backend** (no un segundo round-trip a Gemini — más simple y confiable, ver nota en Tarea 4). En el frontend, una burbuja pública nueva (`SalesAgentChat.tsx`) reemplaza el script embebido, controlada por un contexto compartido (`chatWidgetContext.tsx`) para que el botón de Contáctanos abra la misma ventana.

**Tech Stack:** Express + TypeScript, Drizzle ORM, `@google/genai` (ya en el proyecto), React + wouter, Tailwind. Sin frameworks de testing nuevos — verificación manual vía `curl`/`psql`/navegador, igual que se hizo para la migración a Cloud Run.

**Spec:** `docs/superpowers/specs/2026-09-10-sales-agent-chat-design.md`

## Global Constraints

- Sin streaming en `/api/agent/chat` — respuesta completa por turno (decisión del spec).
- Sin grabación/transcripción de voz — solo texto (no-objetivo explícito del spec).
- No tocar ni decidir nada sobre el proyecto `qssintelligence` en Replit — solo eliminar la referencia/embed en este repo.
- No introducir dependencias nuevas si se puede evitar (rate limiting en memoria, sin paquete nuevo).
- Los leads creados por el agente quedan sin `responsableId` (null) — el equipo los toma manualmente.
- `clientes.metadata` es la única forma de guardar el email (no hay columna dedicada).
- La etapa inicial de toda oportunidad nueva se resuelve consultando `etapasVenta.inicial = true`, nunca hardcodeando el id.

---

### Tarea 1: Agregar QPulseMES al catálogo de productos

**Files:**
- Ninguno (cambio directo en base de datos vía `psql`)

**Interfaces:**
- Produces: una fila en `productos` con `nombre = 'QPulseMES'`, que la Tarea 4 debe poder encontrar por coincidencia de nombre (`ilike`).

- [ ] **Paso 1: Insertar el producto**

Ejecutar contra la base de datos de producción (Neon, la cuenta propia — **no** la vieja de Replit):

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd /Users/evesmax/projects/personal/wwwqss
DST=$(grep "^NEW_DATABASE_URL=" conn.env.docker | cut -d= -f2-)
psql "$DST" -c "
INSERT INTO productos (codigo_producto, nombre, descripcion, precio)
VALUES (
  'SAAS004',
  'QPulseMES',
  'Sistema MES multi-tenant para manufactura de empaque flexible: planeación visual, ejecución en planta, grabado y coextrusión, con IA para optimización de programación y control de calidad.',
  0
);
"
```

- [ ] **Paso 2: Verificar**

```bash
psql "$DST" -t -c "SELECT id, codigo_producto, nombre FROM productos WHERE nombre = 'QPulseMES';"
```

Esperado: una fila con el `id` asignado (no importa cuál, solo que exista).

- [ ] **Paso 3: Commit**

No hay archivo que commitear en esta tarea (cambio directo en datos, no en código).

---

### Tarea 2: Lógica de creación de leads (`server/leadCapture.ts`)

**Files:**
- Create: `server/leadCapture.ts`

**Interfaces:**
- Consumes: `db` de `./db`, tablas `clientes`, `oportunidades`, `actividades`, `productos`, `etapasVenta` de `@shared/schema`.
- Produces:
  ```ts
  export interface LeadInput {
    nombre: string;
    empresa: string;
    telefono: string;
    email?: string;
    producto: string;
    transcript: string;
  }
  export interface LeadResult {
    clienteId: number;
    oportunidadId: number;
    codigo: string;
  }
  export async function createLeadFromAgent(input: LeadInput): Promise<LeadResult>
  ```
  Usado por la Tarea 4.

- [ ] **Paso 1: Escribir `server/leadCapture.ts`**

```ts
import { db } from "./db";
import { clientes, oportunidades, actividades, productos, etapasVenta } from "@shared/schema";
import { eq, sql, ilike } from "drizzle-orm";

export interface LeadInput {
  nombre: string;
  empresa: string;
  telefono: string;
  email?: string;
  producto: string;
  transcript: string;
}

export interface LeadResult {
  clienteId: number;
  oportunidadId: number;
  codigo: string;
}

function generateClienteCodigo(): string {
  return `WEB-${Date.now().toString().slice(-8)}`;
}

async function generateOportunidadCodigo(): Promise<string> {
  const lastOp = await db
    .select({ codigo: oportunidades.codigo })
    .from(oportunidades)
    .orderBy(sql`id DESC`)
    .limit(1);
  let nextNum = 101;
  if (lastOp.length > 0) {
    const match = lastOp[0].codigo.match(/OP-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  return `OP-${nextNum}`;
}

async function findOrCreateCliente(input: LeadInput): Promise<number> {
  const [existing] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.telefonoContacto, input.telefono));

  if (existing) return existing.id;

  const [created] = await db
    .insert(clientes)
    .values({
      codigo: generateClienteCodigo(),
      tipo: "Prospecto",
      nombreNegocio: input.empresa,
      nombreContacto: input.nombre,
      telefonoContacto: input.telefono,
      metadata: input.email ? { email: input.email } : {},
    })
    .returning();

  return created.id;
}

async function resolveProductoId(nombreProducto: string): Promise<number | null> {
  const normalized = nombreProducto.trim().toLowerCase();
  if (!normalized || normalized.includes("medida")) return null;

  const [match] = await db
    .select()
    .from(productos)
    .where(ilike(productos.nombre, `%${normalized}%`));

  return match?.id ?? null;
}

async function resolveEtapaInicial(): Promise<{ id: number; probabilidad: number }> {
  const [etapa] = await db.select().from(etapasVenta).where(eq(etapasVenta.inicial, true));
  if (!etapa) throw new Error("No hay una etapa de venta marcada como inicial");
  return { id: etapa.id, probabilidad: etapa.probabilidad };
}

export async function createLeadFromAgent(input: LeadInput): Promise<LeadResult> {
  const clienteId = await findOrCreateCliente(input);
  const productoId = await resolveProductoId(input.producto);
  const etapaInicial = await resolveEtapaInicial();
  const codigo = await generateOportunidadCodigo();

  const [oportunidad] = await db
    .insert(oportunidades)
    .values({
      codigo,
      nombre: `${input.empresa} - ${input.producto}`,
      clienteId,
      productoId,
      etapaVentaId: etapaInicial.id,
      valorEstimado: "0",
      probabilidad: etapaInicial.probabilidad,
      responsableId: null,
      estado: "activa",
    })
    .returning();

  await db.insert(actividades).values({
    oportunidadId: oportunidad.id,
    tipo: "nota",
    descripcion: `Lead generado por el agente de ventas del sitio web.\n\n${input.transcript}`,
    usuarioId: null,
  });

  return { clienteId, oportunidadId: oportunidad.id, codigo };
}
```

- [ ] **Paso 2: Verificar con un script desechable**

Crear un archivo temporal `server/_verify-task2.ts` (no se commitea, se borra al final del paso):

```ts
import { createLeadFromAgent } from "./leadCapture";

createLeadFromAgent({
  nombre: "Prueba Tarea 2",
  empresa: "Empresa de Prueba",
  telefono: "5500000002",
  producto: "QPulseMES",
  transcript: "Visitante: hola\nAgente: hola, ¿en qué te ayudo?",
}).then((result) => {
  console.log("RESULTADO:", JSON.stringify(result));
  process.exit(0);
}).catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
```

Ejecutar:

```bash
cd /Users/evesmax/projects/personal/wwwqss
export $(grep -v '^#' conn.env.docker | xargs)
npx tsx server/_verify-task2.ts
```

Esperado: imprime `RESULTADO: {"clienteId":...,"oportunidadId":...,"codigo":"OP-..."}` sin errores.

Confirmar en base de datos que el `productoId` quedó ligado a QPulseMES (no null):

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DST=$(grep "^NEW_DATABASE_URL=" conn.env.docker | cut -d= -f2-)
psql "$DST" -t -c "SELECT o.codigo, o.nombre, p.nombre AS producto, a.tipo FROM oportunidades o LEFT JOIN productos p ON p.id = o.producto_id JOIN actividades a ON a.oportunidad_id = o.id WHERE o.nombre LIKE 'Empresa de Prueba%';"
```

Esperado: una fila mostrando `producto = QPulseMES` y `tipo = nota`.

Borrar el archivo temporal:

```bash
rm server/_verify-task2.ts
```

- [ ] **Paso 3: Commit**

```bash
git add server/leadCapture.ts
git commit -m "feat: add CRM lead creation logic for sales agent"
```

---

### Tarea 3: Rate limiting en memoria (`server/rateLimiter.ts`)

**Files:**
- Create: `server/rateLimiter.ts`

**Interfaces:**
- Produces: `export function checkRateLimit(key: string): boolean` — usado por la Tarea 4.

- [ ] **Paso 1: Escribir `server/rateLimiter.ts`**

```ts
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    hits.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}
```

- [ ] **Paso 2: Verificar con un script desechable**

Crear `server/_verify-task3.ts` (temporal):

```ts
import { checkRateLimit } from "./rateLimiter";

const results: boolean[] = [];
for (let i = 0; i < 10; i++) {
  results.push(checkRateLimit("test-ip"));
}
console.log("RESULTADOS:", JSON.stringify(results));
```

Ejecutar:

```bash
cd /Users/evesmax/projects/personal/wwwqss
npx tsx server/_verify-task3.ts
```

Esperado: `RESULTADOS:[true,true,true,true,true,true,true,true,false,false]` — las primeras 8 pasan, las últimas 2 se bloquean.

Borrar el archivo temporal:

```bash
rm server/_verify-task3.ts
```

- [ ] **Paso 3: Commit**

```bash
git add server/rateLimiter.ts
git commit -m "feat: add in-memory rate limiter for public endpoints"
```

---

### Tarea 4: Endpoint del agente (`server/salesAgentRoutes.ts`)

**Files:**
- Create: `server/salesAgentRoutes.ts`
- Modify: `server/routes.ts:8-10` (agregar import), `server/routes.ts:41-43` (agregar registro)

**Interfaces:**
- Consumes: `createLeadFromAgent` de `./leadCapture` (Tarea 2), `checkRateLimit` de `./rateLimiter` (Tarea 3).
- Produces: endpoint público `POST /api/agent/chat`.
  - Request body: `{ message: string, history: { role: "user"|"assistant", content: string }[] }`
  - Response body: `{ reply: string, leadCreated: boolean }`
  - Usado por la Tarea 5 (frontend).

**Nota de diseño:** el spec original decía "se lo confirma al modelo... éste genera el mensaje de cierre" (un segundo round-trip a Gemini con el resultado de la función). Esta tarea simplifica eso: el backend genera el mensaje de confirmación directamente con una plantilla, sin segunda llamada a Gemini. Es más simple, más barato, y elimina el riesgo de que el modelo diga algo inesperado en la confirmación — el contenido de esa respuesta no necesita creatividad del modelo, necesita ser correcto.

- [ ] **Paso 1: Escribir `server/salesAgentRoutes.ts`**

```ts
import type { Express, Request, Response } from "express";
import { GoogleGenAI, Type } from "@google/genai";
import { createLeadFromAgent } from "./leadCapture";
import { checkRateLimit } from "./rateLimiter";

const ai = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
  ? new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    })
  : new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY });

const PRODUCTOS_INFO = `
- QNexus Control: Gestión integral de flotas vehiculares y cotizaciones con rastreo en tiempo real.
- QCampusOne: Control escolar completo con gestión de finanzas para instituciones educativas.
- QNexusApp: Sistema moderno de punto de venta y gestión de inventario bilingüe para retail multi-sucursal.
- HolaKura: Expedientes clínicos digitales y agenda inteligente para médicos y consultorios.
- Auranuba: Invitaciones digitales y confirmación de asistencia para eventos.
- QPulseMES: Sistema MES multi-tenant para manufactura de empaque flexible: planeación visual, ejecución en planta, grabado y coextrusión, con IA para optimización de programación y control de calidad.
- Software a la Medida: Desarrollo de soluciones personalizadas que se adaptan exactamente a los procesos únicos de tu empresa, integrando tecnologías modernas para maximizar la eficiencia operativa.
`.trim();

const SYSTEM_INSTRUCTION = `Eres un asesor experto de Q Software Solutions (QSS), una empresa de consultoría de software en Guadalajara, México. Hablas en español, con un tono cercano y consultivo, nunca robótico.

Tu objetivo es ayudar a visitantes del sitio a entender cuál de nuestros productos les conviene, resolver sus dudas, y — cuando el visitante muestre interés real — recopilar sus datos de contacto para que un asesor humano le dé seguimiento.

Estos son los productos que ofrecemos:
${PRODUCTOS_INFO}

Cuando el visitante muestre interés en alguno, guía la conversación para obtener: su nombre, el nombre de su empresa, y un teléfono de contacto (los tres son obligatorios), y ofrece pedir también su correo (opcional). No inventes información que no tengas. No llames a la función crear_lead hasta tener nombre, empresa y teléfono. Una vez que la tengas, llama a crear_lead con esos datos y el nombre del producto de interés (usa exactamente uno de los nombres de la lista de arriba, o "Software a la Medida" si es un desarrollo a la medida).`;

const CREAR_LEAD_TOOL = {
  functionDeclarations: [
    {
      name: "crear_lead",
      description:
        "Registra un nuevo prospecto interesado en el CRM de ventas, una vez que se tienen su nombre, empresa y teléfono.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          nombre: { type: Type.STRING, description: "Nombre de la persona de contacto" },
          empresa: { type: Type.STRING, description: "Nombre del negocio o empresa del contacto" },
          telefono: { type: Type.STRING, description: "Teléfono de contacto" },
          email: { type: Type.STRING, description: "Correo electrónico, si lo dio" },
          producto: {
            type: Type.STRING,
            description: "Producto de interés, exactamente como aparece en la lista de productos",
          },
        },
        required: ["nombre", "empresa", "telefono", "producto"],
      },
    },
  ],
};

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function buildTranscript(history: ChatTurn[], lastUserMessage: string): string {
  const turns = [...history, { role: "user" as const, content: lastUserMessage }];
  return turns.map((t) => `${t.role === "user" ? "Visitante" : "Agente"}: ${t.content}`).join("\n");
}

export function registerSalesAgentRoutes(app: Express): void {
  app.post("/api/agent/chat", async (req: Request, res: Response) => {
    const ip = req.ip || "unknown";
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        reply: "Estamos recibiendo muchos mensajes en este momento, intenta de nuevo en un minuto.",
        leadCreated: false,
      });
    }

    try {
      const { message, history } = req.body as { message: string; history: ChatTurn[] };

      const contents = [
        ...(history || []).map((h) => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [CREAR_LEAD_TOOL],
        },
      });

      const call = response.functionCalls?.[0];

      if (call && call.name === "crear_lead") {
        const args = call.args as {
          nombre: string;
          empresa: string;
          telefono: string;
          email?: string;
          producto: string;
        };
        try {
          const transcript = buildTranscript(history || [], message);
          await createLeadFromAgent({ ...args, transcript });
          return res.json({
            reply: `¡Gracias, ${args.nombre}! Ya registré tus datos — un asesor de QSS se va a poner en contacto contigo pronto al ${args.telefono} para platicar sobre ${args.producto}.`,
            leadCreated: true,
          });
        } catch (dbError) {
          console.error("Error al crear lead del agente:", dbError, JSON.stringify(args));
          return res.json({
            reply:
              "Tuve un problema guardando tus datos. Por favor usa el formulario de contacto de esta página para que no se pierda tu información.",
            leadCreated: false,
          });
        }
      }

      return res.json({ reply: response.text || "", leadCreated: false });
    } catch (error) {
      console.error("Error en el chat del agente de ventas:", error);
      res.status(500).json({ reply: "Hubo un problema, intenta de nuevo en un momento.", leadCreated: false });
    }
  });
}
```

- [ ] **Paso 2: Registrar la ruta en `server/routes.ts`**

Agregar el import junto a los otros tres, alrededor de la línea 10:

```ts
import { registerSalesAgentRoutes } from "./salesAgentRoutes";
```

Agregar el registro junto a los otros tres, alrededor de la línea 43:

```ts
  registerSalesAgentRoutes(app);
```

- [ ] **Paso 3: Verificar con el servidor de desarrollo**

```bash
cd /Users/evesmax/projects/personal/wwwqss
export $(grep -v '^#' conn.env.docker | xargs)
export SESSION_SECRET=$(openssl rand -base64 32)
npm run dev &
sleep 4
curl -s -X POST http://localhost:5000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hola, ¿qué es QPulseMES?", "history": []}' | head -c 500
echo ""
kill %1
```

Esperado: JSON con `"reply"` explicando QPulseMES, `"leadCreated":false` (todavía no dio sus datos).

- [ ] **Paso 4: Commit**

```bash
git add server/salesAgentRoutes.ts server/routes.ts
git commit -m "feat: add public sales agent chat endpoint with lead capture tool"
```

---

### Tarea 5: Widget de chat público (frontend)

**Files:**
- Create: `client/src/lib/chatWidgetContext.tsx`
- Create: `client/src/components/SalesAgentChat.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: endpoint `POST /api/agent/chat` de la Tarea 4.
- Produces:
  ```ts
  export function ChatWidgetProvider({ children }: { children: ReactNode }): JSX.Element
  export function useChatWidget(): { isOpen: boolean; openChat: () => void; closeChat: () => void }
  ```
  de `client/src/lib/chatWidgetContext.tsx` — usado por la Tarea 6.

- [ ] **Paso 1: Escribir `client/src/lib/chatWidgetContext.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";

interface ChatWidgetContextValue {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

const ChatWidgetContext = createContext<ChatWidgetContextValue | null>(null);

export function ChatWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ChatWidgetContext.Provider
      value={{
        isOpen,
        openChat: () => setIsOpen(true),
        closeChat: () => setIsOpen(false),
      }}
    >
      {children}
    </ChatWidgetContext.Provider>
  );
}

export function useChatWidget(): ChatWidgetContextValue {
  const ctx = useContext(ChatWidgetContext);
  if (!ctx) throw new Error("useChatWidget debe usarse dentro de ChatWidgetProvider");
  return ctx;
}
```

- [ ] **Paso 2: Escribir `client/src/components/SalesAgentChat.tsx`**

```tsx
import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useChatWidget } from "@/lib/chatWidgetContext";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function SalesAgentChat() {
  const { isOpen, openChat, closeChat } = useChatWidget();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leadCreated, setLeadCreated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: messages }),
      });
      const data = await res.json();
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      if (data.leadCreated) setLeadCreated(true);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Hubo un problema de conexión, intenta de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={openChat}
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full bg-[#00aeef] px-4 py-3 text-white shadow-lg transition hover:scale-105"
        aria-label="Habla con un experto"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-semibold">Habla con un experto</span>
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-5 z-[9999] flex h-[520px] w-[360px] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-[#00aeef] to-[#0088cc] px-4 py-3 text-white">
            <span className="text-sm font-semibold">Asesor QSS</span>
            <button onClick={closeChat} aria-label="Cerrar chat">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="mt-4 text-center text-sm text-gray-500">
                ¡Hola! Cuéntame qué necesitas y te ayudo a encontrar el producto de QSS que mejor te sirve.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-[#00aeef] text-white"
                      : "rounded-bl-sm bg-gray-100 text-gray-800"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && <p className="text-xs text-gray-400">Escribiendo…</p>}
            {leadCreated && (
              <div className="rounded-xl bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                Un asesor te contactará pronto.
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-2 border-t border-gray-100 p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Escribe tu mensaje..."
              className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#00aeef]"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-[#00aeef] p-2.5 text-white transition hover:bg-[#0099d6] disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Paso 3: Modificar `client/src/App.tsx`**

Reemplazar el contenido completo del archivo:

```tsx
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import QFoodControlPage from "@/pages/QFoodControlPage";
import QInventiaControlPage from "@/pages/QInventiaControlPage";
import QProfessionalServicesPage from "@/pages/QProfessionalServicesPage";
import QNexusControlPage from "@/pages/QNexusControlPage";
import QCampusOnePage from "@/pages/QCampusOnePage";
import QNexusAppPage from "@/pages/QNexusAppPage";
import HolaKuraPage from "@/pages/HolaKuraPage";
import AuranubaPage from "@/pages/AuranubaPage";
import AdminApp from "@/pages/admin/AdminApp";
import { ChatWidgetProvider } from "@/lib/chatWidgetContext";
import SalesAgentChat from "@/components/SalesAgentChat";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/qfood" component={QFoodControlPage} />
      <Route path="/qinventia" component={QInventiaControlPage} />
      <Route path="/qprofessional" component={QProfessionalServicesPage} />
      <Route path="/productos/qnexus-control" component={QNexusControlPage} />
      <Route path="/productos/qcampus-one" component={QCampusOnePage} />
      <Route path="/productos/qnexus-app" component={QNexusAppPage} />
      <Route path="/productos/holakura" component={HolaKuraPage} />
      <Route path="/productos/auranuba" component={AuranubaPage} />
      <Route path="/admin" nest component={AdminApp} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ChatWidgetProvider>
          <Toaster />
          <Router />
          {!isAdminRoute && <SalesAgentChat />}
        </ChatWidgetProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
```

- [ ] **Paso 4: Verificar en el navegador**

```bash
cd /Users/evesmax/projects/personal/wwwqss
export $(grep -v '^#' conn.env.docker | xargs)
export SESSION_SECRET=$(openssl rand -base64 32)
npm run dev
```

Abrir `http://localhost:5000` en el navegador. Verificar:
- Aparece el botón "Habla con un experto" abajo a la derecha.
- Al hacer clic, se abre la ventana de chat.
- Al escribir un mensaje, aparece la respuesta del agente.
- En `http://localhost:5000/admin`, el botón **no** aparece.

Detener el servidor con `Ctrl+C`.

- [ ] **Paso 5: Commit**

```bash
git add client/src/lib/chatWidgetContext.tsx client/src/components/SalesAgentChat.tsx client/src/App.tsx
git commit -m "feat: add public sales agent chat widget"
```

---

### Tarea 6: Botón en Contáctanos

**Files:**
- Modify: `client/src/components/ContactSection.tsx`

**Interfaces:**
- Consumes: `useChatWidget` de `client/src/lib/chatWidgetContext.tsx` (Tarea 5).

- [ ] **Paso 1: Agregar el import**

En `client/src/components/ContactSection.tsx`, agregar junto a los demás imports:

```tsx
import { useChatWidget } from "@/lib/chatWidgetContext";
```

- [ ] **Paso 2: Usar el hook dentro del componente**

Dentro de `export default function ContactSection() {`, junto a los otros hooks (después de `const { toast } = useToast();`):

```tsx
  const { openChat } = useChatWidget();
```

- [ ] **Paso 3: Agregar el botón en el JSX**

Insertar justo después del párrafo de introducción (`<p className="text-lg text-gray-600 mb-8">...</p>`) y antes de `<div className="space-y-6">`:

```tsx
            <button
              onClick={openChat}
              className="mb-8 inline-flex items-center gap-2 rounded-lg bg-[#00aeef] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0099d6]"
            >
              Habla ahora con un asesor
            </button>
```

- [ ] **Paso 4: Verificar en el navegador**

```bash
cd /Users/evesmax/projects/personal/wwwqss
export $(grep -v '^#' conn.env.docker | xargs)
export SESSION_SECRET=$(openssl rand -base64 32)
npm run dev
```

Abrir `http://localhost:5000`, bajar hasta la sección de Contáctanos, hacer clic en "Habla ahora con un asesor". Esperado: se abre la misma ventana de chat que la burbuja flotante.

Detener el servidor con `Ctrl+C`.

- [ ] **Paso 5: Commit**

```bash
git add client/src/components/ContactSection.tsx
git commit -m "feat: link contact section to the sales agent chat"
```

---

### Tarea 7: Eliminar la burbuja vieja

**Files:**
- Modify: `client/index.html:70-145`

**Interfaces:**
- Ninguna.

- [ ] **Paso 1: Eliminar el bloque de script**

En `client/index.html`, eliminar por completo este bloque (el comentario `<!-- Chat Agent Widget -->` y todo el `<script>` que le sigue, hasta su `</script>` de cierre, justo antes de `</body>`):

```html
    <!-- Chat Agent Widget -->
    <script>
    (function() {
        let iframeUrl = 'https://qssintelligence.replit.app/embed/407f1e29-0233-47ed-848d-15f716d4ae0c';
        ...
    })();
    </script>
```

El archivo debe terminar así:

```html
    <script type="module" src="/src/main.tsx"></script>
    <script type="text/javascript" src="https://replit.com/public/js/replit-dev-banner.js"></script>
  </body>
</html>
```

- [ ] **Paso 2: Verificar**

```bash
grep -c "qssintelligence" /Users/evesmax/projects/personal/wwwqss/client/index.html
```

Esperado: `0`.

- [ ] **Paso 3: Commit**

```bash
cd /Users/evesmax/projects/personal/wwwqss
git add client/index.html
git commit -m "chore: remove embedded qssintelligence chat bubble"
```

---

### Tarea 8: Verificación local end-to-end (Docker)

**Files:**
- Ninguno (solo verificación)

**Interfaces:**
- Ninguna.

- [ ] **Paso 1: Construir y correr el contenedor**

```bash
cd /Users/evesmax/projects/personal/wwwqss
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker build -t wwwqss:local .
docker rm -f wwwqss-test 2>/dev/null
docker run -d --name wwwqss-test \
  --env-file conn.env.docker \
  -e DATABASE_URL="$(grep '^NEW_DATABASE_URL=' conn.env.docker | cut -d= -f2-)" \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  -p 5050:5000 \
  wwwqss:local
sleep 4
docker logs wwwqss-test
```

Esperado: log `[express] serving on port 5000`, sin errores.

- [ ] **Paso 2: Conversación completa hasta creación de lead**

```bash
curl -s -X POST http://localhost:5050/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hola, me interesa QPulseMES para mi planta de empaque. Soy Juan Pérez de Empacadora del Bajío, mi teléfono es 5551234567",
    "history": []
  }'
```

Esperado: JSON con `"leadCreated":true` y un `"reply"` de confirmación mencionando a Juan.

- [ ] **Paso 3: Verificar la fila real en la base de datos**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
DST=$(grep "^NEW_DATABASE_URL=" conn.env.docker | cut -d= -f2-)
psql "$DST" -t -c "
SELECT o.codigo, o.nombre, c.nombre_contacto, c.telefono_contacto, p.nombre AS producto
FROM oportunidades o
JOIN clientes c ON c.id = o.cliente_id
LEFT JOIN productos p ON p.id = o.producto_id
WHERE c.telefono_contacto = '5551234567';
"
```

Esperado: una fila con `producto = QPulseMES` y los datos de Juan Pérez.

- [ ] **Paso 4: Caso límite — sin teléfono, no debe crear lead**

```bash
curl -s -X POST http://localhost:5050/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola, soy María de Consultores XYZ, me interesa HolaKura", "history": []}'
```

Esperado: `"leadCreated":false` — el agente debe pedir el teléfono, no crear el lead todavía.

- [ ] **Paso 5: Caso límite — Software a la Medida sin productoId**

```bash
curl -s -X POST http://localhost:5050/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Necesito un desarrollo a la medida para mi negocio. Soy Carlos Ruiz de Ruiz Logística, mi teléfono es 5559876543",
    "history": []
  }'
```

Verificar en base de datos:

```bash
psql "$DST" -t -c "
SELECT o.codigo, o.nombre, o.producto_id
FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id
WHERE c.telefono_contacto = '5559876543';
"
```

Esperado: `producto_id` es `NULL` (o vacío), y `nombre` incluye "Software a la Medida" o similar.

- [ ] **Paso 6: Caso límite — mismo teléfono no duplica cliente**

Repetir el Paso 2 con el mismo teléfono `5551234567` pero un mensaje distinto. Verificar:

```bash
psql "$DST" -t -c "SELECT count(*) FROM clientes WHERE telefono_contacto = '5551234567';"
```

Esperado: `1` (no `2`) — el cliente se reutilizó, solo se creó una nueva oportunidad.

- [ ] **Paso 7: Limpiar datos de prueba**

```bash
psql "$DST" -c "
DELETE FROM actividades WHERE oportunidad_id IN (SELECT id FROM oportunidades WHERE cliente_id IN (SELECT id FROM clientes WHERE telefono_contacto IN ('5551234567','5559876543')));
DELETE FROM oportunidades WHERE cliente_id IN (SELECT id FROM clientes WHERE telefono_contacto IN ('5551234567','5559876543'));
DELETE FROM clientes WHERE telefono_contacto IN ('5551234567','5559876543');
"
docker rm -f wwwqss-test
```

- [ ] **Paso 8: Commit (si hubo ajustes)**

Si alguno de los casos límite reveló un bug y se corrigió código, commitear esa corrección puntual con un mensaje descriptivo del fix. Si todo pasó sin cambios, no hay nada que commitear en este paso.

---

### Tarea 9: Deploy a producción

**Files:**
- Ninguno (deploy vía el pipeline ya existente)

**Interfaces:**
- Ninguna.

- [ ] **Paso 1: Push a main**

```bash
cd /Users/evesmax/projects/personal/wwwqss
git push origin main
```

Esto dispara el workflow de GitHub Actions (`.github/workflows/deploy.yml`) que construye y despliega a Cloud Run automáticamente.

- [ ] **Paso 2: Verificar que el workflow terminó bien**

```bash
gh run list --repo evesmax/wwwqss --limit 1
```

Esperado: el run más reciente en estado `completed` / `success`. Si no, revisar con `gh run view --log-failed --repo evesmax/wwwqss`.

- [ ] **Paso 3: Verificar en el dominio real**

```bash
curl -s --http1.1 -o /dev/null -w "HTTP %{http_code}\n" https://qsoftwaresolutions.com
curl -s --http1.1 -X POST https://qsoftwaresolutions.com/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hola, ¿qué productos tienen?", "history": []}'
```

Esperado: homepage 200, y el segundo comando devuelve una respuesta del agente mencionando los productos.

- [ ] **Paso 4: Verificación visual final**

Abrir `https://qsoftwaresolutions.com` en el navegador:
- Confirmar que el botón "Habla con un experto" aparece (y que la burbuja vieja ya no está).
- Confirmar que el botón en Contáctanos abre el mismo chat.
- Tener una conversación real de principio a fin y confirmar que el lead aparece en `/admin/pipeline` del panel de administración.

- [ ] **Paso 5: Limpiar el lead de prueba de producción**

Si se usó un teléfono de prueba real en el Paso 4, borrarlo desde el panel de admin (`/admin/pipeline`) para no dejar datos falsos en el CRM de producción.
