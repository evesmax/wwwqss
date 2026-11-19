import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { SearchSelect } from "@/components/ui/search-select";
import { TYPE_LABEL } from "./ticketUi";

const inp = "border rounded-lg px-3 py-2 text-sm";
const BLUE = "#00aeef", ORANGE = "#f97316";
const iso = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;

function presets() {
  const now = new Date(), today = iso(now), y = now.getFullYear(), mo = now.getMonth();
  const first = (yy: number, mm: number) => iso(new Date(yy, mm, 1, 12)), last = (yy: number, mm: number) => iso(new Date(yy, mm + 1, 0, 12));
  return {
    today: { label: "Hoy", from: today, to: today },
    d7: { label: "Últimos 7 días", from: iso(addDays(now, -6)), to: today },
    d30: { label: "Últimos 30 días", from: iso(addDays(now, -29)), to: today },
    d90: { label: "Últimos 90 días", from: iso(addDays(now, -89)), to: today },
    month: { label: "Este mes", from: first(y, mo), to: today },
    prevMonth: { label: "Mes anterior", from: first(y, mo - 1), to: last(y, mo - 1) },
    year: { label: "Este año", from: `${y}-01-01`, to: today },
  } as Record<string, { label: string; from: string; to: string }>;
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-bold mt-1 text-gray-900">{value}</div>{sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}</div>;
}

export default function TimeReportPage() {
  const [, navigate] = useLocation();
  const P = useMemo(presets, []);
  const [preset, setPreset] = useState("d30");
  const [f, setF] = useState({ from: P.d30.from, to: P.d30.to, accountId: "", productId: "", type: "", kind: "all" });
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [rate, setRate] = useState({ perHour: "", currency: "MXN" });
  useEffect(() => {
    apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts).catch(() => {});
    apiRequest("GET", "/api/desk/products").then((r) => r.json()).then(setProducts).catch(() => {});
  }, []);
  useEffect(() => {
    setErr("");
    const qs = new URLSearchParams({ from: f.from, to: f.to, kind: f.kind, ...(f.accountId && { accountId: f.accountId }), ...(f.productId && { productId: f.productId }), ...(f.type && { type: f.type }) });
    apiRequest("GET", `/api/desk/time-report?${qs}`).then((r) => r.json()).then((x) => { setD(x); setRate({ perHour: String(x.rate.perHour), currency: x.rate.currency }); })
      .catch(() => setErr("No se pudo cargar el reporte (requiere rol de gerente de soporte o dueño)."));
  }, [f]);
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: d?.rate?.currency ?? "MXN" }).format(n);
  const pick = (k: string) => { setPreset(k); if (k !== "custom") setF({ ...f, from: P[k].from, to: P[k].to }); };
  const saveRate = async () => {
    try { await apiRequest("PUT", "/api/desk/settings/time-rate", { perHour: Number(rate.perHour), currency: rate.currency }); setF({ ...f }); }
    catch { setErr("No se pudo guardar la tarifa (solo el dueño puede cambiarla)."); }
  };
  const csv = () => {
    if (!d) return;
    const rows = [["Cuenta · Producto", "Tickets", "Minutos", "Humano (min)", "Agente IA (min)", `Costo ${d.rate.currency}`], ...d.byAccountProduct.map((b: any) => [b.name, b.tickets, b.minutes, b.humanMinutes, b.agentMinutes, b.cost])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `inversion-tiempo-${f.from}_${f.to}.csv`; a.click();
  };
  const t = d?.totals;
  const table = (title: string, rows: any[], label = (b: any) => b.name) => (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      {!rows?.length ? <p className="text-sm text-gray-500 py-4 text-center">Sin datos en el periodo.</p> : (
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Nombre</th><th className="text-right">Tickets</th><th className="text-right">Tiempo</th><th className="text-right">👤</th><th className="text-right">🤖</th><th className="text-right">Costo est.</th></tr></thead>
          <tbody>{rows.map((b) => <tr key={String(b.id)} className="border-t"><td className="py-1.5">{label(b)}</td><td className="text-right">{b.tickets}</td><td className="text-right">{hm(b.minutes)}</td><td className="text-right text-gray-500">{hm(b.humanMinutes)}</td><td className="text-right text-gray-500">{hm(b.agentMinutes)}</td><td className="text-right font-medium">{money(b.cost)}</td></tr>)}</tbody></table>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Inversión de tiempo</h1><p className="text-sm text-gray-600">Tiempo y costo estimado de desarrollo por cuenta, producto y tipo de ticket (vista interna).</p></div>
        <button className={`${inp} bg-white hover:bg-gray-50`} onClick={csv}>Exportar CSV</button>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <SearchSelect className={`${inp} w-44`} value={preset} onChange={(e: any) => pick(e.target.value)}>
          {Object.entries(P).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}<option value="custom">Personalizado…</option>
        </SearchSelect>
        <input type="date" className={inp} value={f.from} onChange={(e) => { setPreset("custom"); setF({ ...f, from: e.target.value }); }} />
        <input type="date" className={inp} value={f.to} onChange={(e) => { setPreset("custom"); setF({ ...f, to: e.target.value }); }} />
        <SearchSelect className={`${inp} w-48`} value={f.accountId} onChange={(e: any) => setF({ ...f, accountId: e.target.value })}><option value="">Todas las cuentas</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</SearchSelect>
        <SearchSelect className={`${inp} w-48`} value={f.productId} onChange={(e: any) => setF({ ...f, productId: e.target.value })}><option value="">Todos los productos</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SearchSelect>
        <SearchSelect className={`${inp} w-44`} value={f.type} onChange={(e: any) => setF({ ...f, type: e.target.value })}><option value="">Todos los tipos</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SearchSelect>
        <SearchSelect className={`${inp} w-40`} value={f.kind} onChange={(e: any) => setF({ ...f, kind: e.target.value })}><option value="all">Humano + agente</option><option value="human">Solo humano</option><option value="agent">Solo agente IA</option></SearchSelect>
      </div>
      {err && <div className="text-sm p-3 rounded-lg border bg-red-50 border-red-200 text-red-800">{err}</div>}
      {!d && !err && <p className="text-sm text-gray-500">Cargando…</p>}
      {d && <>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Tiempo total" value={hm(t.minutes)} sub={`${t.entries} entradas`} />
          <Kpi label="👤 Humano" value={hm(t.humanMinutes)} />
          <Kpi label="🤖 Agente IA" value={hm(t.agentMinutes)} />
          <Kpi label="Costo estimado" value={money(t.cost)} sub={`${d.rate.perHour} ${d.rate.currency}/h`} />
          <Kpi label="Tickets con tiempo" value={t.tickets} />
        </div>
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-900">Tiempo por día</h3>
          {d.timeline.length ? <div className="h-56 mt-2"><ResponsiveContainer><BarChart data={d.timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => `${Math.round(v / 60)}h`} /><Tooltip formatter={(v: any) => hm(Number(v))} /><Legend />
            <Bar dataKey="humanMinutes" name="Humano" stackId="a" fill={BLUE} /><Bar dataKey="agentMinutes" name="Agente IA" stackId="a" fill={ORANGE} /></BarChart></ResponsiveContainer></div> : <p className="text-sm text-gray-500 py-6 text-center">Sin datos en el periodo.</p>}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          {table("Por cuenta", d.byAccount)}
          {table("Por producto", d.byProduct)}
        </div>
        {table("Por cuenta y producto", d.byAccountProduct)}
        <div className="grid lg:grid-cols-2 gap-4">
          {table("Por tipo de ticket", d.byType, (b) => TYPE_LABEL[b.id] ?? b.name)}
          <div className="bg-white border rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Tickets con más inversión</h3>
            {!d.topTickets.length ? <p className="text-sm text-gray-500 py-4 text-center">Sin datos en el periodo.</p> : (
              <table className="w-full text-sm"><tbody>{d.topTickets.map((b: any) => <tr key={b.id} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/soporte/tickets/${b.id}`)}><td className="py-1.5">{b.name}</td><td className="text-right">{hm(b.minutes)}</td><td className="text-right font-medium">{money(b.cost)}</td></tr>)}</tbody></table>
            )}
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex flex-wrap items-end gap-2 text-sm">
          <span className="font-semibold text-gray-900 mr-2">Tarifa para el costo estimado</span>
          <input type="number" min={0} className={`${inp} w-28`} value={rate.perHour} onChange={(e) => setRate({ ...rate, perHour: e.target.value })} />
          <input className={`${inp} w-20 uppercase`} maxLength={3} value={rate.currency} onChange={(e) => setRate({ ...rate, currency: e.target.value })} />
          <span className="text-gray-500">por hora (aplica igual a humano y agente IA; solo el dueño puede cambiarla)</span>
          <button className={`${inp} bg-white hover:bg-gray-50`} onClick={saveRate}>Guardar tarifa</button>
        </div>
      </>}
    </div>
  );
}
