import { useEffect, useState } from "react";

const COLOR: Record<string, string> = { operational: "bg-green-500", degraded: "bg-yellow-400", outage: "bg-red-500", nodata: "bg-gray-200" };
const LABEL: Record<string, string> = { operational: "Operando con normalidad", degraded: "Degradado", outage: "Interrupción" };
const ILABEL: Record<string, string> = { investigating: "Investigando", identified: "Identificado", monitoring: "Monitoreando", resolved: "Resuelto" };
const fmt = (d: string) => new Date(d.endsWith("Z") ? d : d + "Z").toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

export default function StatusPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const load = () => fetch("/api/status").then((r) => r.json()).then((j) => { setD(j); setErr(false); }).catch(() => setErr(true));
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, []);
  useEffect(() => { document.title = "Estado del servicio · QSoftware Solutions"; }, []);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header><h1 className="text-2xl font-bold text-gray-900">Estado del servicio</h1><p className="text-sm text-gray-500">QSoftware Solutions · horario de Ciudad de México</p></header>
        {err && <p className="text-red-700 text-sm">No se pudo cargar el estado. Intenta de nuevo en un momento.</p>}
        {d && d.products.length === 0 && <p className="text-gray-600">Aún no hay componentes publicados.</p>}
        {d?.products.map((p: any) => (
          <section key={p.name} className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{p.name}</h2>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${p.status === "operational" ? "bg-green-100 text-green-800" : p.status === "degraded" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>{LABEL[p.status]}</span></div>
            {p.components.map((c: any) => (
              <div key={c.name} className="space-y-1">
                <div className="flex justify-between text-sm"><span>{c.name}</span><span className="text-gray-500">{c.uptime90 != null ? `${c.uptime90}% en 90 días` : "Sin datos"}</span></div>
                <div className="flex gap-px" aria-label={`Historial de 90 días de ${c.name}`}>{c.days.map((x: any) => <div key={x.day} title={`${x.day}: ${x.status === "nodata" ? "sin datos" : LABEL[x.status] ?? x.status}`} className={`h-7 flex-1 rounded-sm ${COLOR[x.status]}`} />)}</div>
                <div className="flex justify-between text-[11px] text-gray-400"><span>hace 90 días</span><span>hoy</span></div>
              </div>))}
            {p.maintenance.length > 0 && <div className="text-sm"><h3 className="font-semibold mb-1">Mantenimiento programado</h3>{p.maintenance.map((m: any, i: number) => <p key={i} className="text-gray-700">{m.title} — {fmt(m.startsAt)} a {fmt(m.endsAt)}</p>)}</div>}
            {p.incidents.length > 0 && <div className="text-sm space-y-3"><h3 className="font-semibold">Incidentes recientes</h3>{p.incidents.map((i: any) => (
              <div key={i.id} className="border-l-4 border-gray-300 pl-3"><p className="font-medium">{i.title} <span className="text-xs text-gray-500">· {ILABEL[i.status]}</span></p>
                {i.updates.map((u: any, k: number) => <p key={k} className="text-gray-600"><span className="text-xs text-gray-400">{fmt(u.at)} · {ILABEL[u.status]}</span><br />{u.body}</p>)}</div>))}</div>}
          </section>))}
      </div>
    </div>
  );
}
