import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { SearchSelect } from "@/components/ui/search-select";
import { SEV_COLOR, STATUS_LABEL } from "./ticketUi";

const inp = "border rounded-lg px-3 py-2 text-sm";
const hrs = (h: number | null | undefined) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} d`);
const left = (m: number) => { const a = Math.abs(m), t = a >= 1440 ? `${Math.round(a / 144) / 10} d` : a >= 60 ? `${Math.round(a / 6) / 10} h` : `${a} min`; return m < 0 ? `Vencido hace ${t}` : `Quedan ${t}`; };
const SLA_METRIC: Record<string, string> = { first_response: "Primera respuesta", update: "Actualización", resolution: "Resolución" };
const BLUE = "#00aeef", ORANGE = "#f97316", GREEN = "#16a34a", GRAY = "#94a3b8";

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">{label}</div><div className={`text-2xl font-bold mt-1 ${tone ?? "text-gray-900"}`}>{value}</div>{sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}</div>;
}
function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold text-gray-900">{title}</h3>{hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}<div className="mt-2">{children}</div></div>;
}
const Empty = () => <p className="text-sm text-gray-500 py-6 text-center">Sin datos en el periodo.</p>;

export default function TicketDashboardPage() {
  const [, navigate] = useLocation();
  const [f, setF] = useState({ days: "90", accountId: "", productId: "" });
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  useEffect(() => {
    apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts).catch(() => {});
    apiRequest("GET", "/api/desk/products").then((r) => r.json()).then(setProducts).catch(() => {});
  }, []);
  useEffect(() => {
    setErr("");
    const qs = new URLSearchParams({ days: f.days, ...(f.accountId && { accountId: f.accountId }), ...(f.productId && { productId: f.productId }) });
    apiRequest("GET", `/api/desk/tickets/stats?${qs}`).then((r) => r.json()).then(setD).catch(() => setErr("No se pudo cargar el dashboard (¿rol de soporte y MFA activo?)"));
  }, [f]);
  const k = d?.kpis ?? {};
  const go = (id: number) => navigate(`/soporte/tickets/${id}`);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Dashboard de tickets</h1><p className="text-sm text-gray-600">Volumen, urgencia por SLA, recurrencia y desempeño de resolución.</p></div>
        <div className="flex flex-wrap gap-2">
          <SearchSelect className={`${inp} w-40`} value={f.days} onChange={(e: any) => setF({ ...f, days: e.target.value })}>
            <option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="180">Últimos 180 días</option><option value="365">Último año</option>
          </SearchSelect>
          <SearchSelect className={`${inp} w-52`} value={f.accountId} onChange={(e: any) => setF({ ...f, accountId: e.target.value })}>
            <option value="">Todos los clientes</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </SearchSelect>
          <SearchSelect className={`${inp} w-52`} value={f.productId} onChange={(e: any) => setF({ ...f, productId: e.target.value })}>
            <option value="">Todos los sistemas</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SearchSelect>
        </div>
      </div>
      {err && <div className="text-sm p-3 rounded-lg border bg-red-50 border-red-200 text-red-800">{err}</div>}
      {!d && !err && <p className="text-sm text-gray-500">Cargando…</p>}
      {d && <>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Kpi label="Abiertos ahora" value={k.openNow} />
          <Kpi label="Críticos abiertos (P0/P1)" value={k.criticalOpen} tone={k.criticalOpen ? "text-red-600" : undefined} />
          <Kpi label="Creados" value={k.created} sub={`últimos ${d.days} días`} />
          <Kpi label="Resueltos" value={k.resolved} sub={k.created ? `${Math.round((k.resolved / k.created) * 100)}% de los creados` : undefined} />
          <Kpi label="1ª respuesta (prom.)" value={hrs(k.avgFirstResponseH)} />
          <Kpi label="Resolución (mediana)" value={hrs(k.medianResolutionH)} sub={`promedio ${hrs(k.avgResolutionH)}`} />
          <Kpi label="Cumplimiento SLA" value={k.slaCompliancePct == null ? "—" : `${k.slaCompliancePct}%`} sub={`${k.slaDecided} métricas evaluadas`} tone={k.slaCompliancePct != null && k.slaCompliancePct < 90 ? "text-orange-600" : undefined} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Tickets creados vs. resueltos por semana" hint="Si la línea azul está arriba de la verde, el backlog crece.">
            {d.timeline.length ? <div className="h-64"><ResponsiveContainer><LineChart data={d.timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Line type="monotone" dataKey="created" name="Creados" stroke={BLUE} strokeWidth={2} /><Line type="monotone" dataKey="resolved" name="Resueltos" stroke={GREEN} strokeWidth={2} /></LineChart></ResponsiveContainer></div> : <Empty />}
          </Card>
          <Card title="Sistemas con más tickets" hint="Total del periodo; en naranja los abiertos.">
            {d.byProduct.length ? <div className="h-64"><ResponsiveContainer><BarChart data={d.byProduct} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} /><Tooltip /><Legend />
              <Bar dataKey="total" name="Total" fill={BLUE} /><Bar dataKey="open" name="Abiertos" fill={ORANGE} /></BarChart></ResponsiveContainer></div> : <Empty />}
          </Card>
        </div>

        <Card title="Más urgentes por tiempo de SLA" hint="Tickets abiertos con el reloj de SLA corriendo, ordenados por el menor tiempo restante (los vencidos primero).">
          {d.urgent.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th className="py-1">Folio</th><th>Título</th><th>Cliente / sistema</th><th>Severidad</th><th>Métrica</th><th>Tiempo</th></tr></thead><tbody>
            {d.urgent.map((u: any) => <tr key={`${u.id}${u.metric}`} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => go(u.id)}>
              <td className="py-1.5 font-mono text-xs">{u.key}</td><td className="max-w-xs truncate">{u.title}</td><td className="text-gray-600">{u.account}{u.product ? ` · ${u.product}` : ""}</td>
              <td>{u.severity ? <span className={`px-1.5 py-0.5 rounded text-xs ${SEV_COLOR[u.severity]}`}>{u.severity}</span> : "—"}</td><td>{SLA_METRIC[u.metric] ?? u.metric}</td>
              <td className={u.remaining_min < 0 ? "text-red-600 font-semibold" : u.state === "at_risk" ? "text-orange-600 font-medium" : ""}>{left(u.remaining_min)}</td></tr>)}
          </tbody></table></div> : <Empty />}
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Incidentes repetitivos por módulo" hint="Mismo sistema y módulo con 2 o más incidentes en el periodo: candidatos a corrección de raíz.">
            {d.repeatedModules.length ? <table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th>Sistema</th><th>Módulo</th><th className="text-right">Total</th><th className="text-right">Abiertos</th><th className="text-right">Último</th></tr></thead><tbody>
              {d.repeatedModules.map((m: any, i: number) => <tr key={i} className="border-t"><td className="py-1.5">{m.product}</td><td>{m.module}</td><td className="text-right font-semibold">{m.total}</td><td className="text-right">{m.open}</td><td className="text-right text-gray-500">{m.last_at}</td></tr>)}</tbody></table> : <Empty />}
          </Card>
          <Card title="Incidentes con el mismo título" hint="Títulos casi idénticos (sin acentos, mayúsculas ni signos): el mismo problema reportado varias veces.">
            {d.repeatedTitles.length ? <table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th>Título</th><th className="text-right">Veces</th><th className="text-right">Abiertos</th><th className="text-right">Clientes</th></tr></thead><tbody>
              {d.repeatedTitles.map((m: any, i: number) => <tr key={i} className="border-t"><td className="py-1.5 max-w-xs truncate">{m.title}</td><td className="text-right font-semibold">{m.total}</td><td className="text-right">{m.open}</td><td className="text-right">{m.accounts}</td></tr>)}</tbody></table> : <Empty />}
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Antigüedad del backlog" hint="Tickets abiertos por tiempo transcurrido.">
            {d.aging.length ? <div className="h-52"><ResponsiveContainer><BarChart data={d.aging}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="n" name="Tickets" fill={ORANGE} /></BarChart></ResponsiveContainer></div> : <Empty />}
          </Card>
          <Card title="Abiertos por estatus">
            {d.byStatus.length ? <ul className="text-sm space-y-1">{d.byStatus.map((s: any) => <li key={s.status} className="flex justify-between border-b py-1"><span>{STATUS_LABEL[s.status] ?? s.status}</span><b>{s.n}</b></li>)}</ul> : <Empty />}
          </Card>
          <Card title="Clientes con más tickets">
            {d.byAccount.length ? <ul className="text-sm space-y-1">{d.byAccount.map((a: any) => <li key={a.name} className="flex justify-between border-b py-1"><span className="truncate pr-2">{a.name}</span><span><b>{a.total}</b> <span className="text-gray-500">({a.open} abiertos)</span></span></li>)}</ul> : <Empty />}
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Desempeño de resolución por severidad" hint="Tiempo desde la creación hasta resolver, de los tickets resueltos en el periodo.">
            {d.resolutionBySeverity.length ? <table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th>Severidad</th><th className="text-right">Resueltos</th><th className="text-right">1ª respuesta</th><th className="text-right">Resolución</th></tr></thead><tbody>
              {d.resolutionBySeverity.map((r: any) => <tr key={r.severity} className="border-t"><td className="py-1.5">{r.severity === "none" ? "Sin severidad" : <span className={`px-1.5 py-0.5 rounded text-xs ${SEV_COLOR[r.severity]}`}>{r.severity}</span>}</td><td className="text-right">{r.n}</td><td className="text-right">{hrs(r.avg_first_response_h)}</td><td className="text-right font-semibold">{hrs(r.avg_resolution_h)}</td></tr>)}</tbody></table> : <Empty />}
          </Card>
          <Card title="Carga y desempeño por responsable">
            {d.byAssignee.length ? <table className="w-full text-sm"><thead className="text-left text-xs text-gray-500"><tr><th>Responsable</th><th className="text-right">Resueltos</th><th className="text-right">Abiertos</th><th className="text-right">Resolución prom.</th></tr></thead><tbody>
              {d.byAssignee.map((r: any) => <tr key={r.name} className="border-t"><td className="py-1.5">{r.name}</td><td className="text-right">{r.resolved}</td><td className="text-right">{r.open}</td><td className="text-right">{hrs(r.avg_resolution_h)}</td></tr>)}</tbody></table> : <Empty />}
          </Card>
        </div>
      </>}
    </div>
  );
}
