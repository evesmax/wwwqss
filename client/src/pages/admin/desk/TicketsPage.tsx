import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { STATUS_LABEL, TYPE_LABEL, SEV_COLOR, fmt } from "./ticketUi";

const inp = "border rounded-lg px-3 py-2 text-sm";
const TYPES = ["incident", "service_request", "feature_request", "question", "internal_task"];

export default function TicketsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ q: "", status: "", type: "", assignee: "", open: "1" });
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    try {
      const r = await (await apiRequest("GET", `/api/desk/tickets?${qs}`)).json();
      setRows(r.rows); setTotal(r.total); setErr("");
    } catch { setErr("No se pudieron cargar los tickets (¿rol de soporte y MFA activo?)"); }
  };
  useEffect(() => { load(); }, [f.status, f.type, f.assignee, f.open]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tickets <span className="text-sm font-normal text-gray-500">({total})</span></h1>
        <button onClick={() => setShowNew(true)} className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold">Nuevo ticket</button>
      </div>
      <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className={inp} placeholder="Buscar folio o título" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Todos los estados</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">Todos los tipos</option>{TYPES.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
        </select>
        <select className={inp} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
          <option value="">Cualquier responsable</option><option value="me">Asignados a mí</option><option value="none">Sin asignar</option>
        </select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.open === "1"} onChange={(e) => setF({ ...f, open: e.target.checked ? "1" : "" })} />Solo abiertos</label>
        <button className="border rounded-lg px-3 py-2 text-sm">Buscar</button>
      </form>
      {err && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">{err}</div>}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="p-3">Folio</th><th>Título</th><th>Cliente</th><th>Tipo</th><th>Sev.</th><th>Estado</th><th>Actualizado</th>
          </tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono"><Link href={`/soporte/tickets/${t.id}`} className="text-[#0088c2] font-semibold">{t.key}</Link></td>
                <td>{t.title}</td><td>{t.cliente}</td><td>{TYPE_LABEL[t.type]}</td>
                <td>{t.severity ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${SEV_COLOR[t.severity]}`}>{t.severity}</span>
                  : t.perceivedSeverity ? <span className="text-xs text-gray-400" title="Severidad propuesta por el cliente (sin triage)">~{t.perceivedSeverity}</span> : "—"}</td>
                <td>{STATUS_LABEL[t.status] ?? t.status}</td><td>{fmt(t.updatedAt)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-gray-400">Sin tickets</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewTicket onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [f, setF] = useState<any>({ accountId: "", type: "incident", title: "", description: "", channel: "manual", severity: "", requesterContactId: "", instanceId: "", environment: "prod" });
  const [p0, setP0] = useState({ inaccessible: false, criticalBlocked: false, hasWorkaround: false, users: 0 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts); }, []);
  useEffect(() => {
    if (!f.accountId) return;
    apiRequest("GET", `/api/desk/contacts?accountId=${f.accountId}`).then((r) => r.json()).then(setContacts).catch(() => setContacts([]));
    apiRequest("GET", `/api/desk/instances?accountId=${f.accountId}`).then((r) => r.json()).then(setInstances).catch(() => setInstances([]));
  }, [f.accountId]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await apiRequest("POST", "/api/desk/tickets", {
        accountId: Number(f.accountId), type: f.type, title: f.title, description: f.description, channel: f.channel, environment: f.environment,
        severity: f.type === "incident" && f.severity ? f.severity : null, p0: f.severity === "P0" ? p0 : null,
        requesterContactId: f.requesterContactId ? Number(f.requesterContactId) : null, instanceId: f.instanceId ? Number(f.instanceId) : null,
      });
      onCreated();
    } catch (e: any) {
      let m = "No se pudo crear el ticket."; try { m = JSON.parse(e.message.replace(/^\d+: /, "")).message ?? m; } catch {}
      setErr(m);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-white rounded-xl p-5 w-full max-w-xl space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Nuevo ticket</h2>
        <div className="grid grid-cols-2 gap-3">
          <select className={inp} required value={f.accountId} onChange={set("accountId")}><option value="">Cuenta…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
          <select className={inp} value={f.type} onChange={set("type")}>{TYPES.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</select>
          <select className={inp} value={f.requesterContactId} onChange={set("requesterContactId")}><option value="">Solicitante (opcional)</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select>
          <select className={inp} value={f.instanceId} onChange={set("instanceId")}><option value="">Instancia (opcional)</option>{instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <select className={inp} value={f.channel} onChange={set("channel")}>{["manual", "email", "api", "portal", "widget"].map((c) => <option key={c}>{c}</option>)}</select>
          <select className={inp} value={f.environment} onChange={set("environment")}><option value="prod">Producción</option><option value="stg">Staging</option></select>
        </div>
        <input className={`${inp} w-full`} required minLength={3} placeholder="Título" value={f.title} onChange={set("title")} />
        <textarea className={`${inp} w-full`} rows={4} placeholder="Descripción" value={f.description} onChange={set("description")} />
        {f.type === "incident" && (
          <div className="space-y-2">
            <select className={inp} value={f.severity} onChange={set("severity")}><option value="">Severidad (definir en triage)</option>{["P0", "P1", "P2", "P3"].map((s) => <option key={s}>{s}</option>)}</select>
            {f.severity === "P0" && (
              <div className="border rounded-lg p-3 text-sm space-y-1 bg-red-50">
                <p className="font-semibold">Cuestionario P0 (anti-inflación)</p>
                <label className="flex gap-2"><input type="checkbox" checked={p0.inaccessible} onChange={(e) => setP0({ ...p0, inaccessible: e.target.checked })} />¿Producto inaccesible?</label>
                <label className="flex gap-2"><input type="checkbox" checked={p0.criticalBlocked} onChange={(e) => setP0({ ...p0, criticalBlocked: e.target.checked })} />¿Proceso crítico bloqueado?</label>
                <label className="flex gap-2"><input type="checkbox" checked={p0.hasWorkaround} onChange={(e) => setP0({ ...p0, hasWorkaround: e.target.checked })} />¿Existe workaround?</label>
                <label className="flex gap-2 items-center">Usuarios afectados <input type="number" min={0} className={`${inp} w-24`} value={p0.users} onChange={(e) => setP0({ ...p0, users: Number(e.target.value) })} /></label>
              </div>
            )}
          </div>
        )}
        {err && <div className="bg-red-50 text-red-600 text-sm p-2 rounded border border-red-200">{err}</div>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-sm">Cancelar</button>
          <button disabled={busy} className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Crear</button></div>
      </form>
    </div>
  );
}
