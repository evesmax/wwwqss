import { useState, useRef, useEffect } from "react";
import { Send, GripVertical, Minus, Globe, MessageCircle } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onClose: () => void;
}

export default function GeminiChat({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y)),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, dragOffset]);

  const handleDragStart = (e: React.MouseEvent) => {
    const rect = chatRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setDragging(true);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: userMsg, history: messages, searchMode }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  assistantContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                    return updated;
                  });
                }
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error al conectar con el asistente. Intenta de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div
      ref={chatRef}
      className="fixed z-[100] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width: "400px",
        height: "540px",
      }}
    >
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#00aeef] to-[#0088cc] text-white rounded-t-2xl cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 opacity-60" />
          <span className="font-semibold text-sm">Asistente QSS</span>
          {searchMode && (
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-medium">
              Búsqueda Web
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition">
          <Minus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-4 space-y-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#00aeef] to-[#0077b6] rounded-xl flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <p className="font-semibold text-gray-700">Asistente QSS</p>
            <div className="text-left bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="font-medium text-gray-600 text-xs">Puedo ayudarte con:</p>
              <button
                onClick={() => setInput("¿Cómo creo una nueva oportunidad en el pipeline?")}
                className="w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-[#00aeef] hover:bg-[#00aeef]/5 transition text-gray-600"
              >
                ¿Cómo creo una oportunidad en el pipeline?
              </button>
              <button
                onClick={() => { setSearchMode(true); setInput("Busca empresas de transporte en Guadalajara para venderles QNexus Control"); }}
                className="w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-[#00aeef] hover:bg-[#00aeef]/5 transition text-gray-600"
              >
                Buscar leads de empresas de transporte
              </button>
              <button
                onClick={() => setInput("Tengo un prospecto que es una cadena de restaurantes con 5 sucursales, ¿qué producto le recomiendo y cómo lo abordo?")}
                className="w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-[#00aeef] hover:bg-[#00aeef]/5 transition text-gray-600"
              >
                Estrategia de venta para restaurantes
              </button>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#00aeef] text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
              }`}
            >
              {msg.content
                ? (msg.role === "assistant" ? formatContent(msg.content) : msg.content)
                : (loading && i === messages.length - 1 ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse">Pensando...</span>
                  </span>
                ) : "")}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5 mb-2">
          <button
            onClick={() => setSearchMode(false)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              !searchMode ? "bg-[#00aeef] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <MessageCircle className="w-3 h-3" />
            Chat
          </button>
          <button
            onClick={() => setSearchMode(true)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              searchMode ? "bg-[#00aeef] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <Globe className="w-3 h-3" />
            Buscar Leads
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={searchMode ? "Ej. empresas de logística en CDMX..." : "Escribe un mensaje..."}
            className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00aeef] focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="p-2.5 bg-[#00aeef] text-white rounded-xl hover:bg-[#0099d6] disabled:opacity-40 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
