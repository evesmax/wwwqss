import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { SearchSelect } from "@/components/ui/search-select";
import { STATUS_LABEL, STATUS_COLOR, TYPE_LABEL, CHANNEL_LABEL, SEV_COLOR, fmt, ago } from "./ticketUi";
import { buildTicketContext } from "./ticketContext";
import { copyText } from "./clipboard";

const inp = "border rounded-lg px-3 py-2 text-sm";
const TYPES = ["incident", "service_request", "feature_request", "question", "internal_task"];
const CHANNELS = ["manual", "email", "api", "portal", "widget"];
const VIEW_KEY = "desk.tickets.view.v1";

type Filters = { q: string; status: string; type: string; severity: string; channel: string; accountId: string; productId: string; assignee: string; createdFrom: string; createdTo: string; open: string; noResponse: string };
const DEFAULTS: Filters = { q: "", status: "", type: "", severity: "", channel: "", accountId: "", productId: "", assignee: "", createdFrom: "", createdTo: "", open: "1", noResponse: "" };
type Sort = { sort: string; dir: "asc" | "desc" };
const SORTS: [string, Sort][] = [
  ["Prioridad (severidad y actividad)", { sort: "priority", dir: "desc" }], ["Actualizados recientemente", { sort: "updated", dir: "desc" }], ["Menos recientes", { sort: "updated", dir: "asc" }],
  ["Más nuevos", { sort: "created", dir: "desc" }], ["Más antiguos", { sort: "created", dir: "asc" }], ["Severidad (P0 primero)", { sort: "severity", dir: "asc" }],
  ["Título A–Z", { sort: "title", dir: "asc" }], ["Cliente A–Z", { sort: "client", dir: "asc" }], ["Estado", { sort: "status", dir: "asc" }],
];
const sortKey = (s: Sort) => `${s.sort}:${s.dir}`;

function loadView(): { f: Filters; sort: Sort; pageSize: number } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (v?.f && v?.sort) return { f: { ...DEFAULTS, ...v.f, q: "" }, sort: v.sort, pageSize: [25, 50, 100].includes(v.pageSize) ? v.pageSize : 50 };
  } catch { /* first visit or blocked storage */ }
  return { f: DEFAULTS, sort: { sort: "priority", dir: "desc" }, pageSize: 50 };
}

const initials = (n?: string | null) => (n ? n.slice(0, 2).toUpperCase() : "");

export default function TicketsPage() {
  const initial = useRef(loadView()).current;
  const [, nav] = useLocation();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState<Filters>(initial.f);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState(initial.f.q);
  const [summary, setSummary] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const seq = useRef(0);

  // Debounced search-as-you-type.
  useEffect(() => { const t = setTimeout(() => { setF((x) => (x.q === q ? x : { ...x, q })); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ f: { ...f, q: "" }, sort, pageSize })); } catch { /* ignore */ } }, [f, sort, pageSize]);
  useEffect(() => {
    apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts).catch(() => {});
    apiRequest("GET", "/api/desk/products").then((r) => r.json()).then(setProducts).catch(() => {});
    apiRequest("GET", "/api/desk/agents").then((r) => r.json()).then(setAgents).catch(() => {});
  }, []);

  const loadSummary = useCallback(() => { apiRequest("GET", "/api/desk/tickets/summary").then((r) => r.json()).then(setSummary).catch(() => {}); }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    qs.set("sort", sort.sort); qs.set("dir", sort.dir); qs.set("limit", String(pageSize)); qs.set("offset", String(page * pageSize));
    setLoading(true);
    try {
      const r = await (await apiRequest("GET", `/api/desk/tickets?${qs}`)).json();
      if (my !== seq.current) return; // a newer request already answered
      setRows(r.rows); setTotal(r.total); setErr("");
    } catch (e: any) {
      if (my !== seq.current) return;
      setErr(String(e?.message).includes("mfa_required") ? "Activa la verificación en dos pasos (menú Seguridad) para usar Soporte." : "No se pudieron cargar los tickets. Revisa que tengas un rol de soporte y el MFA activo.");
    } finally { if (my === seq.current) setLoading(false); }
  }, [f, sort, pageSize, page]);
  useEffect(() => { load(); }, [load]);

  const set = (patch: Partial<Filters>) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const clear = () => { setQ(""); setF(DEFAULTS); setPage(0); };

  const CHIPS: { id: string; label: string; count?: number; patch: Partial<Filters> }[] = [
    { id: "open", label: "Abiertos", count: summary?.open, patch: { open: "1" } },
    { id: "mine", label: "Mis tickets", count: summary?.mine, patch: { open: "1", assignee: "me" } },
    { id: "unassigned", label: "Sin asignar", count: summary?.unassigned, patch: { open: "1", assignee: "none" } },
    { id: "critical", label: "Críticos P0/P1", count: summary?.critical, patch: { open: "1", severity: "P0,P1" } },
    { id: "noresp", label: "Sin primera respuesta", count: summary?.noResponse, patch: { open: "1", noResponse: "1" } },
    { id: "all", label: "Todos", patch: { open: "" } },
  ];
  const chipKeys: (keyof Filters)[] = ["open", "assignee", "severity", "noResponse"];
  const isActive = (c: (typeof CHIPS)[number]) => chipKeys.every((k) => (f[k] ?? "") === ((c.patch as any)[k] ?? ""));
  const others: (keyof Filters)[] = ["q", "status", "type", "channel", "accountId", "productId", "createdFrom", "createdTo"];
  const activeCount = others.filter((k) => f[k]).length + (chipKeys.some((k) => f[k] !== DEFAULTS[k]) ? 1 : 0);

  const headSort = (key: string, dflt: "asc" | "desc") => setSort((s) => ({ sort: key, dir: s.sort === key ? (s.dir === "asc" ? "desc" : "asc") : dflt }));
  const Th = ({ k, label, dflt = "asc", className = "" }: { k: string; label: string; dflt?: "asc" | "desc"; className?: string }) => (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <button type="button" onClick={() => headSort(k, dflt)} className="inline-flex items-center gap-1 hover:text-gray-900" title="Ordenar">
        {label}<span className="text-xs">{sort.sort === k ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  const copyContext = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const d = await (await apiRequest("GET", `/api/desk/tickets/${id}`)).json();
      if (await copyText(buildTicketContext(d))) { setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800); }
    } catch { setErr("No se pudo copiar el contexto del ticket."); }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? page * pageSize + 1 : 0, to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Tickets <span className="text-sm font-normal text-gray-500">({total})</span></h1>
        <div className="flex gap-2">
          <button onClick={() => { load(); loadSummary(); }} className="border rounded-lg px-3 py-2 text-sm" title="Actualizar">↻ Actualizar</button>
          <button onClick={() => setShowNew(true)} className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold">Nuevo ticket</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CHIPS.map((c) => (
          <button key={c.id} onClick={() => { setQ(""); setF({ ...DEFAULTS, ...{ open: "" }, ...c.patch }); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-sm border ${isActive(c) ? "bg-[#00aeef] text-white border-[#00aeef]" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
            {c.label}{c.count !== undefined && <span className={`ml-1.5 text-xs font-semibold ${isActive(c) ? "text-white/90" : "text-gray-500"}`}>{c.count}</span>}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl p-3 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <input className={`${inp} flex-1 min-w-[16rem]`} placeholder="Buscar folio, título o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          <SearchSelect className={`${inp} w-52`} value={f.status} onChange={(e: any) => set({ status: e.target.value })}>
            <option value="">Todos los estados</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SearchSelect>
          <SearchSelect className={`${inp} w-52`} value={f.assignee} onChange={(e: any) => set({ assignee: e.target.value })}>
            <option value="">Cualquier responsable</option><option value="me">Asignados a mí</option><option value="none">Sin asignar</option>
            {agents.map((a) => <option key={a.id} value={String(a.id)}>{a.username}</option>)}
          </SearchSelect>
          <SearchSelect className={`${inp} w-72`} value={sortKey(sort)} onChange={(e: any) => { const [k, d] = String(e.target.value).split(":"); setSort({ sort: k, dir: d as any }); setPage(0); }}>
            {SORTS.map(([l, s]) => <option key={sortKey(s)} value={sortKey(s)}>Ordenar: {l}</option>)}
          </SearchSelect>
          <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={() => setShowMore((v) => !v)}>{showMore ? "Menos filtros" : "Más filtros"}</button>
          {activeCount > 0 && <button type="button" className="text-sm text-[#0088c2]" onClick={clear}>Limpiar filtros ({activeCount})</button>}
        </div>
        {showMore && (
          <div className="flex gap-2 flex-wrap items-center border-t pt-3">
            <SearchSelect className={`${inp} w-52`} value={f.accountId} onChange={(e: any) => set({ accountId: e.target.value })}>
              <option value="">Todos los clientes</option>{accounts.map((a) => <option key={a.id} value={String(a.id)}>{a.nombre}</option>)}
            </SearchSelect>
            <SearchSelect className={`${inp} w-48`} value={f.productId} onChange={(e: any) => set({ productId: e.target.value })}>
              <option value="">Todos los productos</option>{products.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </SearchSelect>
            <SearchSelect className={`${inp} w-48`} value={f.type} onChange={(e: any) => set({ type: e.target.value })}>
              <option value="">Todos los tipos</option>{TYPES.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
            </SearchSelect>
            <SearchSelect className={`${inp} w-44`} value={f.severity} onChange={(e: any) => set({ severity: e.target.value })}>
              <option value="">Cualquier severidad</option>{["P0", "P1", "P2", "P3"].map((s) => <option key={s} value={s}>{s}</option>)}<option value="none">Sin severidad</option><option value="P0,P1">Críticos P0/P1</option>
            </SearchSelect>
            <SearchSelect className={`${inp} w-44`} value={f.channel} onChange={(e: any) => set({ channel: e.target.value })}>
              <option value="">Cualquier canal</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </SearchSelect>
            <label className="text-sm text-gray-600 flex items-center gap-1">Desde <input type="date" className={inp} value={f.createdFrom} onChange={(e) => set({ createdFrom: e.target.value })} /></label>
            <label className="text-sm text-gray-600 flex items-center gap-1">Hasta <input type="date" className={inp} value={f.createdTo} onChange={(e) => set({ createdTo: e.target.value })} /></label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.open === "1"} onChange={(e) => set({ open: e.target.checked ? "1" : "" })} />Solo abiertos</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.noResponse === "1"} onChange={(e) => set({ noResponse: e.target.checked ? "1" : "" })} />Sin primera respuesta</label>
          </div>
        )}
      </div>

      {err && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">{err}</div>}

      <div className={`bg-white rounded-xl border overflow-x-auto ${loading ? "opacity-70" : ""}`}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <Th k="created" label="Folio" dflt="desc" className="pl-3" /><Th k="title" label="Título" /><Th k="severity" label="Sev." />
            <Th k="status" label="Estado" /><th className="px-3 py-2 font-medium">Responsable</th><th className="px-3 py-2 font-medium">Canal</th>
            <Th k="updated" label="Actualizado" dflt="desc" /><th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t hover:bg-sky-50/50 cursor-pointer" onClick={() => nav(`/soporte/tickets/${t.id}`)}>
                <td className="p-3 font-mono whitespace-nowrap"><Link href={`/soporte/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className="text-[#0088c2] font-semibold">{t.key}</Link>
                  <div className="text-[11px] text-gray-400 font-sans" title={fmt(t.createdAt)}>{ago(t.createdAt)}</div></td>
                <td className="px-3 py-2 max-w-md"><div className="font-medium text-gray-900 truncate">{t.title}</div>
                  <div className="text-xs text-gray-500 truncate">{[t.cliente, t.productCode, TYPE_LABEL[t.type]].filter(Boolean).join(" · ")}</div></td>
                <td className="px-3">{t.severity ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${SEV_COLOR[t.severity]}`}>{t.severity}</span>
                  : t.perceivedSeverity ? <span className="text-xs text-gray-400" title="Severidad propuesta por el cliente (sin triage)">~{t.perceivedSeverity}</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status] ?? "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                  {!t.firstResponseAt && !["resolved", "closed", "cancelled", "rejected", "duplicate", "released", "deferred"].includes(t.status) && <div className="text-[11px] text-amber-600 mt-0.5">Sin 1ª respuesta</div>}</td>
                <td className="px-3 whitespace-nowrap">{t.assigneeName ? <span className="inline-flex items-center gap-1.5"><span className="w-6 h-6 rounded-full bg-gray-200 text-[10px] font-semibold flex items-center justify-center">{initials(t.assigneeName)}</span>{t.assigneeName}</span> : <span className="text-gray-400">Sin asignar</span>}</td>
                <td className="px-3 text-gray-600">{CHANNEL_LABEL[t.channel] ?? t.channel}</td>
                <td className="px-3 text-gray-600 whitespace-nowrap" title={fmt(t.updatedAt)}>{ago(t.updatedAt)}</td>
                <td className="px-3 text-right"><button type="button" onClick={(e) => copyContext(e, t.id)} className="text-xs border rounded px-2 py-1 hover:bg-white" title="Copiar el contexto completo del ticket para pegarlo en Claude">{copied === t.id ? "✓ Copiado" : "Copiar contexto"}</button></td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">Sin tickets con estos filtros.{activeCount > 0 && <> <button className="text-[#0088c2]" onClick={clear}>Limpiar filtros</button></>}</td></tr>
            )}
            {!rows.length && loading && <tr><td colSpan={8} className="p-8 text-center text-gray-400">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600">
        <span>{total ? `Mostrando ${from}–${to} de ${total}` : "0 resultados"}</span>
        <div className="flex items-center gap-2">
          <SearchSelect className={`${inp} w-36`} value={String(pageSize)} onChange={(e: any) => { setPageSize(Number(e.target.value)); setPage(0); }}>
            <option value="25">25 por página</option><option value="50">50 por página</option><option value="100">100 por página</option>
          </SearchSelect>
          <button className="border rounded-lg px-3 py-2 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
          <span>Página {page + 1} de {pages}</span>
          <button className="border rounded-lg px-3 py-2 disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
        </div>
      </div>
      {showNew && <NewTicket onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); loadSummary(); }} />}
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
          <SearchSelect className={inp} required value={f.accountId} onChange={set("accountId")}><option value="">Cuenta…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={f.type} onChange={set("type")}>{TYPES.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={f.requesterContactId} onChange={set("requesterContactId")}><option value="">Solicitante (opcional)</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={f.instanceId} onChange={set("instanceId")}><option value="">Instancia (opcional)</option>{instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={f.channel} onChange={set("channel")}>{["manual", "email", "api", "portal", "widget"].map((c) => <option key={c}>{c}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={f.environment} onChange={set("environment")}><option value="prod">Producción</option><option value="stg">Staging</option></SearchSelect>
        </div>
        <input className={`${inp} w-full`} required minLength={3} placeholder="Título" value={f.title} onChange={set("title")} />
        <textarea className={`${inp} w-full`} rows={4} placeholder="Descripción" value={f.description} onChange={set("description")} />
        {f.type === "incident" && (
          <div className="space-y-2">
            <SearchSelect className={inp} value={f.severity} onChange={set("severity")}><option value="">Severidad (definir en triage)</option>{["P0", "P1", "P2", "P3"].map((s) => <option key={s}>{s}</option>)}</SearchSelect>
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
