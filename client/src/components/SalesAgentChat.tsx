import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useChatWidget } from "@/lib/chatWidgetContext";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function formatContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
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
                  {msg.role === "assistant" ? formatContent(msg.content) : msg.content}
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
