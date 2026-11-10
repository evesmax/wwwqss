import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import qssLogo from "@assets/qss-logo.png";
import { STATUS_LABEL, TYPE_LABEL, SEV_COLOR, fmt } from "../admin/desk/ticketUi";

const inp = "w-full border rounded-lg px-3 py-2 text-sm";
const btn = "bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50";
const slaDur = (ms: number) => { const m = Math.round(ms / 60000), h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; };
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

function Shell({ children, email, onLogout }: { children: React.ReactNode; email?: string; onLogout?: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b"><div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
        <Link href="/"><img src={qssLogo} alt="QSoftware Solutions" className="h-9" /></Link>
        {email && <div className="text-sm text-gray-600"><Link href="/features" className="text-[#0088c2] mr-3">Funcionalidades</Link><Link href="/reports" className="text-[#0088c2] mr-3">Informes</Link>{email} · <button onClick={onLogout} className="text-[#0088c2]">Salir</button></div>}
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
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  useEffect(() => { window.history.replaceState(null, "", window.location.pathname); }, []);
  // Requires a click so email link scanners that load the page cannot burn the single-use token.
  const go = () => apiRequest("POST", "/api/portal/auth/verify", { token }).then(() => { onDone(); nav("/"); }).catch(() => setErr("El enlace es inválido o ya venció. Solicita uno nuevo."));
  return <Shell><div className="max-w-md mx-auto mt-10 text-center space-y-3">
    {err ? <><p className="text-gray-700">{err}</p><Link href="/" className="text-[#0088c2]">Volver</Link></> : <><p className="text-gray-700">Confirma para entrar al portal de soporte.</p><button className={btn} onClick={go}>Entrar al portal</button></>}
  </div></Shell>;
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
      {d.sla && <div className="bg-white border rounded-xl p-4 text-sm space-y-3">
        <h3 className="font-semibold">Tiempos de servicio</h3>
        {d.sla.metrics.map((m: any) => (
          <div key={m.key} className="space-y-0.5">
            <div className="flex justify-between"><span>{m.key === "first_response" ? "Primera respuesta" : "Resolución"} <span className="text-gray-500">(meta {slaDur(m.targetMinutes * 60000)} hábiles)</span></span>
              <span className={`font-semibold ${m.state === "met" ? "text-green-700" : m.state === "breached" ? "text-red-700" : "text-blue-700"}`}>
                {m.state === "met" ? "Cumplido" : m.state === "breached" ? "Fuera de tiempo" : m.paused ? "En pausa" : `Quedan ${slaDur(m.remainingMs)}`}</span></div>
            {m.dueAt && m.state === "running" && !m.paused && <p className="text-xs text-gray-500">Vence aproximadamente el {fmt(m.dueAt)}</p>}
            {m.pauses.map((p: any, i: number) => <p key={i} className="text-xs text-gray-500">Pausa: {p.label}{p.note ? ` (${p.note})` : ""} · {fmt(p.from)} → {p.to ? fmt(p.to) : "en curso"}</p>)}
          </div>))}
        <p className="text-xs text-gray-400">El reloj corre solo en horario laboral y se detiene mientras esperamos tu respuesta.</p>
      </div>}
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

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function Reports() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  useEffect(() => { apiRequest("GET", "/api/portal/reports").then((r) => r.json()).then(setRows).catch(() => setRows([])); }, []);
  const view = async (id: number) => setOpen(await (await apiRequest("GET", `/api/portal/reports/${id}`)).json());
  if (open) return (
    <div className="space-y-3">
      <div className="flex justify-between"><button className="text-sm text-[#0088c2]" onClick={() => setOpen(null)}>← Informes</button>
        <button className="text-sm text-[#0088c2]" onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(open.html); w.document.close(); w.focus(); w.print(); } }}>Imprimir / guardar PDF</button></div>
      <iframe title="Informe" sandbox="" srcDoc={open.html} className="w-full bg-white border rounded-xl" style={{ height: "80vh" }} />
    </div>);
  return (
    <div className="space-y-3">
      <Link href="/" className="text-sm text-[#0088c2]">← Mis tickets</Link>
      <h1 className="text-xl font-bold">Informes mensuales</h1>
      {rows && rows.length === 0 && <p className="text-sm text-gray-500">Aún no hay informes entregados. Los informes mensuales están disponibles para los administradores de cuenta.</p>}
      {rows?.map((r) => <button key={r.id} onClick={() => view(r.id)} className="block w-full text-left bg-white border rounded-xl p-3 hover:bg-gray-50 text-sm">
        <b>{MONTHS[r.month - 1]} de {r.year}</b>{r.version > 1 && <span className="ml-2 text-xs text-amber-700">v{r.version} · {r.note}</span>}</button>)}
    </div>);
}

const FST: Record<string, string> = { evaluating: "En evaluación", quoted: "Cotización disponible", approved: "Aprobada", in_development: "En desarrollo", uat: "Pruebas de aceptación", released: "Liberada", rejected: "Rechazada", deferred: "Diferida" };
function Features() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = () => apiRequest("GET", "/api/portal/features").then((r) => r.json()).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const act = async (path: string, body: unknown) => {
    setMsg("");
    try { await apiRequest("POST", path, body); await load(); } catch (e: any) { try { setMsg(JSON.parse(String(e.message).replace(/^\d+: /, "")).message); } catch { setMsg("No se pudo completar"); } }
  };
  return (
    <div className="space-y-3">
      <Link href="/" className="text-sm text-[#0088c2]">← Mis tickets</Link>
      <h1 className="text-xl font-bold">Funcionalidades solicitadas</h1>
      {msg && <div className="text-sm p-3 rounded-lg border bg-red-50 border-red-200 text-red-800">{msg}</div>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-500">No hay funcionalidades en seguimiento.</p>}
      {rows?.map((f) => <div key={f.id} className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2"><b>{f.title}</b><span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{FST[f.status] ?? f.status}</span></div>
        {f.targetDate && <p className="text-xs text-gray-600">Fecha comprometida: {f.targetDate}</p>}
        {f.quotes.filter((q: any) => q.state !== "superseded").map((q: any) => <div key={q.id} className="border rounded-lg p-3 space-y-1">
          <p><b>Cotización v{q.version}</b> · {q.hours} h · {q.cost.toLocaleString()} {q.currency} · vigente hasta {q.validUntil} {q.state === "expired" && <span className="text-red-600">(vencida)</span>}</p>
          <p className="whitespace-pre-wrap text-xs">{q.scope}</p>{q.assumptions && <p className="text-xs text-gray-600">Supuestos: {q.assumptions}</p>}
          {q.state !== "sent" && <p className="text-xs text-gray-600">{q.state === "approved" ? "Aprobada" : q.state === "rejected" ? `Rechazada${q.decisionNote ? `: ${q.decisionNote}` : ""}` : ""}</p>}
          {q.canDecide && <div className="flex flex-wrap gap-2 items-center"><button className="px-3 py-1.5 bg-green-600 text-white rounded-lg" onClick={() => act(`/api/portal/quotes/${q.id}/decision`, { decision: "approved" })}>Aprobar</button>
            <input className="border rounded-lg px-2 py-1 text-xs" placeholder="Motivo si rechazas" value={notes[`q${q.id}`] ?? ""} onChange={(e) => setNotes({ ...notes, [`q${q.id}`]: e.target.value })} />
            <button className="px-3 py-1.5 border rounded-lg text-red-600" onClick={() => act(`/api/portal/quotes/${q.id}/decision`, { decision: "rejected", note: notes[`q${q.id}`] ?? "" })}>Rechazar</button></div>}
        </div>)}
        {f.uat.length > 0 && <div className="space-y-2"><b>Pruebas de aceptación</b>
          {f.uat.map((u: any) => <div key={u.id} className="border rounded-lg p-3 space-y-1">
            <p><b>Qué hace:</b> {u.what}</p><p className="text-xs"><b>Cómo probarlo:</b> {u.how || "—"}</p>
            {u.status !== "pending" && <p className="text-xs">{u.status === "go" ? "Go" : "No Go"}{u.tacit ? " (aceptación tácita)" : ""}{u.comment ? ` · ${u.comment}` : ""}</p>}
            {u.canDecide && <div className="flex flex-wrap gap-2 items-center"><button className="px-3 py-1.5 bg-green-600 text-white rounded-lg" onClick={() => act(`/api/portal/uat/${u.id}/decision`, { status: "go" })}>Go</button>
              <input className="border rounded-lg px-2 py-1 text-xs" placeholder="Motivo si es No Go" value={notes[`u${u.id}`] ?? ""} onChange={(e) => setNotes({ ...notes, [`u${u.id}`]: e.target.value })} />
              <button className="px-3 py-1.5 border rounded-lg text-red-600" onClick={() => act(`/api/portal/uat/${u.id}/decision`, { status: "no_go", comment: notes[`u${u.id}`] ?? "" })}>No Go</button></div>}
          </div>)}</div>}
      </div>)}
    </div>);
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
            <Switch><Route path="/tickets/:id">{(p) => <TicketView id={p.id} />}</Route><Route path="/reports"><Reports /></Route><Route path="/features"><Features /></Route><Route><TicketList me={me} /></Route></Switch>
          </Shell>)}
      </Route>
    </Switch>
  );
}
