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
- QNexusControl: Gestión integral de flotas vehiculares y cotizaciones con rastreo en tiempo real.
- QCampusOne: Control escolar completo con gestión de finanzas para instituciones educativas.
- QNexus App: Sistema moderno de punto de venta y gestión de inventario bilingüe para retail multi-sucursal.
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

const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CONTENT_LENGTH = 4000;

/**
 * The `history` array in the request body is entirely client-controlled.
 * Sanitize it before it's ever used: cap how many turns we consider (cost,
 * and how much a client can inject), cap each turn's length (a crafted
 * request could otherwise write up to the JSON body limit into one CRM
 * activity row), and drop any turn whose role isn't exactly "user" or
 * "assistant" (a client could inject fabricated "assistant" turns to try to
 * steer the model into a bogus crear_lead call).
 */
function sanitizeHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];

  const sanitized: ChatTurn[] = [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    sanitized.push({ role, content: content.slice(0, MAX_TURN_CONTENT_LENGTH) });
  }

  return sanitized.slice(-MAX_HISTORY_TURNS);
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
      const { message, history: rawHistory } = req.body as { message: string; history: unknown };
      const history = sanitizeHistory(rawHistory);

      const contents = [
        ...history.map((h) => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
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
          const transcript = buildTranscript(history, message);
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
