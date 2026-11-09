import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import qssLogo from "@assets/qss-logo.png";
import { STATUS_LABEL, TYPE_LABEL, SEV_COLOR, fmt } from "../admin/desk/ticketUi";

const inp = "w-full border rounded-lg px-3 py-2 text-sm";
const btn = "bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50";
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

function Shell({ children, email, onLogout }: { children: React.ReactNode; email?: string; onLogout?: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b"><div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
        <Link href="/"><img src={qssLogo} alt="QSoftware Solutions" className="h-9" /></Link>
        {email && <div className="text-sm text-gray-600">{email} · <button onClick={onLogout} className="text-[#0088c2]">Salir</button></div>}
      </div></header>
      <main className="max-w-4xl mx-auto p-4">{children}</main>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await apiRequest("POST", "/api/portal/auth/request", { email }); setSent(true); }
    catch (e) { setErr(errMsg(e, "Revisa tu correo e inténtalo de nuevo")); }
  };
  return (
    <Shell><div className="max-w-md mx-auto bg-white rounded-2xl border p-8 mt-10 space-y-4">
      <h1 className="text-2xl font-bold">Portal de soporte</h1>
      {sent ? <p className="text-sm text-gray-700">Si tu correo está registrado en una cuenta, te enviamos un enlace de acceso. Vence en 15 minutos y sirve una sola vez.</p> : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-gray-600">Escribe tu correo y te enviaremos un enlace para entrar, sin contraseña.</p>
          <input type="email" required className={inp} placeholder="tu@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className={`${btn} w-full`}>Enviarme el enlace</button>
        </form>)}
    </div></Shell>
  );
}

function Verify({ onDone }: { onDone: () => void }) {
  const [err, setErr] = useState("");
  const [, nav] = useLocation();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    apiRequest("POST", "/api/portal/auth/verify", { token }).then(() => { onDone(); nav("/"); }).catch(() => setErr("El enlace es inválido o ya venció. Solicita uno nuevo."));
  }, []);
  return <Shell><div className="max-w-md mx-auto mt-10 text-center text-gray-700">{err ? <><p>{err}</p><Link href="/" className="text-[#0088c2]">Volver</Link></> : "Verificando…"}</div></Shell>;
}

function TicketList({ me }: { me: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const load = () => apiRequest("GET", "/api/portal/tickets").then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center"><h1 className="text-xl font-bold">Mis tickets</h1><button className={btn} onClick={() => setShow(true)}>Nuevo ticket</button></div>
      <div className="bg-white rounded-xl border divide-y">
        {rows.map((t) => (
          <Link key={t.id} href={`/tickets/${t.id}`} className="flex justify-between p-3 hover:bg-gray-50 text-sm">
            <span><b className="font-mono">{t.key}</b> · {t.title}</span>
            <span className="text-gray-500">{STATUS_LABEL[t.status] ?? t.status} · {fmt(t.updatedAt)}</span>
          </Link>))}
        {!rows.length && <p className="p-6 text-center text-gray-400 text-sm">Aún no tienes tickets.</p>}
      </div>
      {show && <NewTicket me={me} onClose={() => setShow(false)} onCreated={() => { setShow(false); load(); }} />}
    </div>
  );
}

function NewTicket({ me, onClose, onCreated }: { me: any; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState<any>({ accountId: me.accounts[0]?.id, type: "incident", title: "", description: "", perceivedSeverity: "", instanceId: "" });
  const [err, setErr] = useState("");
  const acc = me.accounts.find((a: any) => a.id === Number(f.accountId));
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try {
      await apiRequest("POST", "/api/portal/tickets", { accountId: Number(f.accountId), type: f.type, title: f.title, description: f.description,
        perceivedSeverity: f.type === "incident" && f.perceivedSeverity ? f.perceivedSeverity : null, instanceId: f.instanceId ? Number(f.instanceId) : null });
      onCreated();
    } catch (e) { setErr(errMsg(e, "No se pudo crear el ticket")); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Nuevo ticket</h2>
        {me.accounts.length > 1 && <select className={inp} value={f.accountId} onChange={set("accountId")}>{me.accounts.map((a: any) => <option key={a.id} value={a.id}>{a.cliente}</option>)}</select>}
        <select className={inp} value={f.type} onChange={set("type")}>{["incident", "service_request", "feature_request", "question"].map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</select>
        {acc?.instances.length > 0 && <select className={inp} value={f.instanceId} onChange={set("instanceId")}><option value="">¿En qué sistema? (opcional)</option>{acc.instances.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>}
        <input className={inp} required minLength={3} placeholder="Resumen del problema o solicitud" value={f.title} onChange={set("title")} />
        <textarea className={inp} rows={5} placeholder="Describe qué ocurre, pasos para reproducirlo y a cuántas personas afecta" value={f.description} onChange={set("description")} />
        {f.type === "incident" && <label className="block text-sm">¿Qué tan grave es para ti?
          <select className={inp} value={f.perceivedSeverity} onChange={set("perceivedSeverity")}>
            <option value="">No estoy seguro</option><option value="P0">Sistema caído / proceso crítico detenido</option><option value="P1">Función importante afectada</option><option value="P2">Molestia con alternativa</option><option value="P3">Detalle menor</option></select>
          <span className="text-xs text-gray-500">Nuestro equipo confirmará la severidad al revisar tu caso.</span></label>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-sm">Cancelar</button><button className={btn}>Enviar</button></div>
      </form>
    </div>
  );
}

function TicketView({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => apiRequest("GET", `/api/portal/tickets/${id}`).then((r) => r.json()).then(setD).catch(() => setMsg("Ticket no encontrado"));
  useEffect(() => { load(); }, [id]);
  if (!d) return <p className="text-gray-500">{msg || "Cargando…"}</p>;
  const t = d.ticket;
  const closed = ["closed", "duplicate", "cancelled", "rejected"].includes(t.status);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    try { await apiRequest("POST", `/api/portal/tickets/${id}/comments`, { body }); setBody(""); load(); } catch (e) { setMsg(errMsg(e, "No se pudo enviar")); }
  };
  const upload = async (file: File) => {
    const r = await fetch(`/api/portal/tickets/${id}/attachments?filename=${encodeURIComponent(file.name)}`, { method: "POST", credentials: "include", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!r.ok) setMsg(errMsg(new Error(await r.text()), "No se pudo adjuntar (imágenes, PDF, hojas o texto, máx. 5 MB)")); else load();
  };
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-[#0088c2]">← Mis tickets</Link>
      <div><p className="font-mono text-sm text-gray-500">{t.key} · {TYPE_LABEL[t.type]}</p><h1 className="text-xl font-bold">{t.title}</h1>
        <p className="text-sm mt-1"><b>{STATUS_LABEL[t.status] ?? t.status}</b>{t.severity && <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${SEV_COLOR[t.severity]}`}>{t.severity}</span>}</p></div>
      {t.description && <div className="bg-white border rounded-xl p-4 text-sm whitespace-pre-wrap">{t.description}</div>}
      <div className="space-y-2">
        {d.comments.map((c: any) => (
          <div key={c.id} className={`rounded-xl p-3 text-sm border ${c.authorType === "contact" ? "bg-sky-50 border-sky-200" : "bg-white"}`}>
            <p className="text-xs text-gray-500 mb-1">{fmt(c.createdAt)} · {c.authorType === "contact" ? "Tú / tu equipo" : "Soporte QSS"}</p>
            <p className="whitespace-pre-wrap">{c.body}</p></div>))}
      </div>
      {d.attachments.length > 0 && <div className="text-sm">{d.attachments.map((a: any) => <a key={a.id} className="block text-[#0088c2]" href={`/api/portal/attachments/${a.id}`}>📎 {a.filename}</a>)}</div>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {!closed && <form onSubmit={send} className="space-y-2">
        <textarea className={inp} rows={3} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe tu respuesta o agrega información" />
        <div className="flex gap-3 items-center"><button className={btn}>Responder</button>
          <label className="text-sm text-[#0088c2] cursor-pointer">Adjuntar archivo<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label></div>
      </form>}
      {d.history.length > 0 && <details className="text-xs text-gray-500"><summary>Historial de estados</summary>{d.history.map((h: any, i: number) => <p key={i}>{fmt(h.at)} · {STATUS_LABEL[h.from] ?? h.from} → {STATUS_LABEL[h.to] ?? h.to}</p>)}</details>}
    </div>
  );
}

export default function PortalApp() {
  const [me, setMe] = useState<any>(undefined);
  const loadMe = () => apiRequest("GET", "/api/portal/me").then((r) => r.json()).then(setMe).catch(() => setMe(null));
  useEffect(() => { loadMe(); }, []);
  const logout = async () => { await apiRequest("POST", "/api/portal/auth/logout"); setMe(null); };
  return (
    <Switch>
      <Route path="/verify"><Verify onDone={loadMe} /></Route>
      <Route>
        {me === undefined ? <Shell>{null}</Shell> : me === null ? <Login /> : (
          <Shell email={me.email} onLogout={logout}>
            <Switch><Route path="/tickets/:id">{(p) => <TicketView id={p.id} />}</Route><Route><TicketList me={me} /></Route></Switch>
          </Shell>)}
      </Route>
    </Switch>
  );
}
