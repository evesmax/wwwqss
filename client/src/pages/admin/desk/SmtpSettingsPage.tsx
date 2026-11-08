import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type Form = { host: string; port: string; secure: boolean; user: string; password: string; fromName: string; fromEmail: string };
const empty: Form = { host: "", port: "587", secure: false, user: "", password: "", fromName: "QSS Soporte", fromEmail: "" };

export default function SmtpSettingsPage() {
  const [f, setF] = useState<Form>(empty);
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest("GET", "/api/desk/settings/smtp").then((r) => r.json()).then((c) => {
      if (c) { setF({ ...empty, ...c, port: String(c.port), password: "" }); setHasPassword(!!c.hasPassword); }
    }).catch(() => setMsg({ kind: "err", text: "No se pudo cargar la configuración (¿tienes rol Owner y MFA activo?)" }));
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await apiRequest("PUT", "/api/desk/settings/smtp", { ...f, port: Number(f.port), password: f.password || undefined });
      const c = await res.json();
      setHasPassword(!!c.hasPassword); setF({ ...f, password: "" });
      setMsg({ kind: "ok", text: "Configuración guardada." });
    } catch { setMsg({ kind: "err", text: "No se pudo guardar. Revisa los datos." }); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await (await apiRequest("POST", "/api/desk/settings/smtp/test", { to: testTo })).json();
      setMsg(r.status === "sent" ? { kind: "ok", text: `Correo de prueba enviado a ${testTo}.` }
        : r.status === "not_configured" ? { kind: "err", text: "Aún no hay configuración SMTP guardada." }
        : { kind: "err", text: `Falló el envío: ${r.error ?? "error desconocido"}` });
    } catch { setMsg({ kind: "err", text: "Escribe un correo válido." }); }
    finally { setBusy(false); }
  };

  const input = "w-full border rounded-lg px-3 py-2 text-sm";
  return (
    <div className="max-w-2xl p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Correo saliente (SMTP)</h1>
      <form onSubmit={save} className="bg-white rounded-xl border p-5 grid grid-cols-2 gap-4">
        <label className="col-span-2 sm:col-span-1 text-sm font-medium">Servidor<input className={input} value={f.host} onChange={set("host")} required placeholder="smtp.ejemplo.com" /></label>
        <label className="col-span-2 sm:col-span-1 text-sm font-medium">Puerto<input className={input} value={f.port} onChange={set("port")} required inputMode="numeric" /></label>
        <label className="col-span-2 text-sm flex items-center gap-2"><input type="checkbox" checked={f.secure} onChange={set("secure")} /> Conexión segura directa (SSL, normalmente puerto 465)</label>
        <label className="col-span-2 sm:col-span-1 text-sm font-medium">Usuario<input className={input} value={f.user} onChange={set("user")} autoComplete="off" /></label>
        <label className="col-span-2 sm:col-span-1 text-sm font-medium">Contraseña
          <input className={input} type="password" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder={hasPassword ? "•••••••• (guardada)" : ""} />
        </label>
        <label className="col-span-2 sm:col-span-1 text-sm font-medium">Nombre del remitente<input className={input} value={f.fromName} onChange={set("fromName")} /></label>
        <label className="col-span-2 sm:col-span-1 text-sm font-medium">Correo del remitente<input className={input} type="email" value={f.fromEmail} onChange={set("fromEmail")} required /></label>
        <div className="col-span-2"><button disabled={busy} className="px-4 py-2 bg-[#00aeef] text-white rounded-lg text-sm font-semibold disabled:opacity-50">Guardar</button></div>
      </form>
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <p className="font-semibold text-gray-800">Enviar correo de prueba</p>
        <div className="flex gap-2">
          <input className={input} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tu@correo.com" />
          <button onClick={test} disabled={busy || !testTo} className="px-4 py-2 border rounded-lg text-sm font-semibold disabled:opacity-50">Enviar</button>
        </div>
        <p className="text-xs text-gray-500">Guarda primero la configuración. Todos los envíos quedan en la bitácora de correo.</p>
      </div>
      {msg && <div className={`text-sm p-3 rounded-lg border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>{msg.text}</div>}
    </div>
  );
}
