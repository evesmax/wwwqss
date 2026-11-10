import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";

const inp = "border rounded-lg px-3 py-2 text-sm";
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };
const IST: Record<string, string> = { investigating: "Investigando", identified: "Identificado", monitoring: "Monitoreando", resolved: "Resuelto" };
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function AvailabilityPage() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [av, setAv] = useState<any>(null);
  const [mons, setMons] = useState<any[]>([]);
  const [insts, setInsts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [incs, setIncs] = useState<any[]>([]);
  const [maint, setMaint] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [nm, setNm] = useState({ instanceId: "", name: "", url: "", isPublic: false });
  const [ni, setNi] = useState({ productId: "", title: "", impact: "minor", body: "" });
  const [nt, setNt] = useState({ productId: "", title: "", startsAt: localInput(new Date(Date.now() + 49 * 3600_000)), endsAt: localInput(new Date(Date.now() + 51 * 3600_000)) });
  const [upd, setUpd] = useState<Record<number, { status: string; body: string; cause: string; fix: string; prevention: string }>>({});

  const get = async (u: string) => (await apiRequest("GET", u)).json();
  const load = async () => {
    try {
      setMons(await get("/api/desk/monitors")); setIncs(await get("/api/desk/platform-incidents")); setMaint(await get("/api/desk/maintenance"));
      setProducts(await get("/api/desk/products")); setInsts(await get("/api/desk/instances"));
      setAv(await get(`/api/desk/availability?year=${ym.y}&month=${ym.m}`));
    } catch { setMsg("No se pudo cargar (requiere rol de soporte y MFA)."); }
  };
  useEffect(() => { load(); }, [ym.y, ym.m]);
  const run = async (fn: () => Promise<any>, ok: string) => { setMsg(""); try { const r = await fn(); setMsg(r?.warning ? `${ok} Aviso: ${r.warning}` : ok); await load(); } catch (e) { setMsg(errMsg(e, "No se pudo completar")); } };
  const pn = (id: number) => products.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-gray-900">Disponibilidad</h1>
        <a href="/status" target="_blank" rel="noreferrer" className="text-sm text-[#0088c2]">Ver página pública de estado ↗</a></div>
      {msg && <div className="bg-blue-50 border border-blue-200 text-blue-900 text-sm p-3 rounded-lg">{msg}</div>}

      <section className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <div className="flex items-center gap-3"><h2 className="font-semibold">Disponibilidad mensual</h2>
          <input className={inp} type="month" value={`${ym.y}-${String(ym.m).padStart(2, "0")}`} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y && m) setYm({ y, m }); }} /></div>
        <p className="text-xs text-gray-500">Un minuto cuenta como caído cuando falla desde 2 ubicaciones. Mes en hora de Ciudad de México; mantenimientos anunciados con ≥48 h se excluyen y se muestran aparte. Minutos sin dato no se cuentan como caída.</p>
        <table className="w-full text-xs"><thead><tr className="text-left text-gray-500"><th>Componente</th><th>Instancia</th><th>Disponibilidad</th><th>Caídos</th><th>Mantenimiento</th><th>Sin confirmar</th><th>Cobertura</th></tr></thead>
          <tbody>{av?.monitors.map((r: any) => <tr key={r.monitorId} className="border-t"><td className="py-1">{r.name}</td><td>{r.instance}</td>
            <td className={`font-semibold ${r.pct != null && r.pct < 99 ? "text-red-700" : ""}`}>{r.pct != null ? `${r.pct}%` : "N/D"}</td><td>{dur(r.downMinutes)}</td><td>{dur(r.maintenanceMinutes)}</td><td>{dur(r.unconfirmedMinutes)}</td><td>{Math.round(r.coverage * 100)}%</td></tr>)}
            {av && av.monitors.length === 0 && <tr><td colSpan={7} className="py-3 text-gray-500">Aún no hay monitores.</td></tr>}</tbody></table>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Monitores (health check profundo)</h2>
        <div className="grid sm:grid-cols-5 gap-2 items-end">
          <select className={inp} value={nm.instanceId} onChange={(e) => setNm({ ...nm, instanceId: e.target.value })}><option value="">Instancia…</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <input className={inp} placeholder="Nombre del componente" value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} />
          <input className={`${inp} sm:col-span-2`} placeholder="https://app.cliente.com/health/deep" value={nm.url} onChange={(e) => setNm({ ...nm, url: e.target.value })} />
          <label className="flex gap-1 items-center"><input type="checkbox" checked={nm.isPublic} onChange={(e) => setNm({ ...nm, isPublic: e.target.checked })} />Pública</label>
          <button className="px-3 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50" disabled={!nm.instanceId || !nm.name || !nm.url}
            onClick={() => run(async () => { await apiRequest("POST", "/api/desk/monitors", { instanceId: Number(nm.instanceId), name: nm.name, url: nm.url, isPublic: nm.isPublic }); setNm({ instanceId: "", name: "", url: "", isPublic: false }); }, "Monitor creado.")}>Agregar</button>
        </div>
        <ul className="text-xs space-y-1">{mons.map((m) => <li key={m.id} className="flex justify-between border-t pt-1"><span>{m.name} · {m.instance} · <span className="text-gray-500">{m.url}</span> {m.isPublic && <b className="text-green-700">pública</b>}</span>
          <button className="text-red-600" onClick={() => confirm(`¿Eliminar el monitor "${m.name}" y su historial?`) && run(() => apiRequest("DELETE", `/api/desk/monitors/${m.id}`), "Monitor eliminado.")}>Eliminar</button></li>)}</ul>
        <p className="text-xs text-gray-500">Los chequeos los ejecuta Cloud Scheduler cada minuto desde 2 regiones hacia <code>/api/internal/probe</code>.</p>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Incidentes de plataforma</h2>
        <div className="grid sm:grid-cols-4 gap-2">
          <select className={inp} value={ni.productId} onChange={(e) => setNi({ ...ni, productId: e.target.value })}><option value="">Producto…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={inp} placeholder="Título" value={ni.title} onChange={(e) => setNi({ ...ni, title: e.target.value })} />
          <select className={inp} value={ni.impact} onChange={(e) => setNi({ ...ni, impact: e.target.value })}><option value="minor">Menor</option><option value="major">Mayor</option><option value="critical">Crítico</option></select>
          <input className={inp} placeholder="Primer mensaje público" value={ni.body} onChange={(e) => setNi({ ...ni, body: e.target.value })} />
          <button className="px-3 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50" disabled={!ni.productId || ni.title.length < 3 || ni.body.length < 3}
            onClick={() => run(async () => { await apiRequest("POST", "/api/desk/platform-incidents", { productId: Number(ni.productId), title: ni.title, impact: ni.impact, body: ni.body }); setNi({ productId: "", title: "", impact: "minor", body: "" }); }, "Incidente publicado.")}>Publicar</button>
        </div>
        {incs.slice(0, 10).map((i) => { const u = upd[i.id] ?? { status: "identified", body: "", cause: "", fix: "", prevention: "" };
          return (<div key={i.id} className="border rounded-lg p-3 space-y-1">
            <p className="font-medium">{i.title} <span className="text-xs text-gray-500">· {pn(i.productId)} · {IST[i.status]} · {i.auto ? "detectado automáticamente · " : ""}{i.isPublic ? "público" : "no público"} · {fmt(i.startedAt)}</span></p>
            {i.updates.map((x: any) => <p key={x.id} className="text-xs text-gray-600">{fmt(x.at)} · {IST[x.status]} — {x.body}</p>)}
            {i.status !== "resolved" && <div className="flex flex-wrap gap-2 items-center pt-1">
              <select className={inp} value={u.status} onChange={(e) => setUpd({ ...upd, [i.id]: { ...u, status: e.target.value } })}>{Object.entries(IST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className={`${inp} flex-1 min-w-[200px]`} placeholder="Actualización" value={u.body} onChange={(e) => setUpd({ ...upd, [i.id]: { ...u, body: e.target.value } })} />
              {u.status === "resolved" && (["cause", "fix", "prevention"] as const).map((k) => <input key={k} className={inp} placeholder={{ cause: "Causa raíz", fix: "Corrección", prevention: "Prevención" }[k]} value={u[k]} onChange={(e) => setUpd({ ...upd, [i.id]: { ...u, [k]: e.target.value } })} />)}
              <button className="px-3 py-2 border rounded-lg" onClick={() => run(async () => { await apiRequest("POST", `/api/desk/platform-incidents/${i.id}/updates`, { status: u.status, body: u.body, ...(u.status === "resolved" && u.cause ? { rca: { cause: u.cause, fix: u.fix, prevention: u.prevention } } : {}) }); setUpd({ ...upd, [i.id]: undefined as any }); }, "Actualización publicada.")}>Publicar</button></div>}
          </div>); })}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Mantenimiento programado</h2>
        <div className="grid sm:grid-cols-5 gap-2 items-end">
          <select className={inp} value={nt.productId} onChange={(e) => setNt({ ...nt, productId: e.target.value })}><option value="">Producto…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={inp} placeholder="Título" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} />
          <input className={inp} type="datetime-local" value={nt.startsAt} onChange={(e) => setNt({ ...nt, startsAt: e.target.value })} />
          <input className={inp} type="datetime-local" value={nt.endsAt} onChange={(e) => setNt({ ...nt, endsAt: e.target.value })} />
          <button className="px-3 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50" disabled={!nt.productId || nt.title.length < 3}
            onClick={() => run(async () => (await apiRequest("POST", "/api/desk/maintenance", { productId: Number(nt.productId), title: nt.title, startsAt: new Date(nt.startsAt).toISOString(), endsAt: new Date(nt.endsAt).toISOString() })).json(), "Mantenimiento programado y administradores de cuenta notificados.")}>Programar</button>
        </div>
        <p className="text-xs text-gray-500">Con menos de 48 h de aviso la ventana se publica pero NO se excluye del cálculo de disponibilidad.</p>
        <ul className="text-xs space-y-1">{maint.slice(0, 10).map((m) => <li key={m.id} className="flex justify-between border-t pt-1"><span>{m.title} · {pn(m.productId)} · {fmt(m.startsAt)} → {fmt(m.endsAt)} {m.noticeOk ? <b className="text-green-700">≥48 h (excluye)</b> : <b className="text-amber-700">aviso corto</b>}</span>
          <button className="text-red-600" onClick={() => run(() => apiRequest("DELETE", `/api/desk/maintenance/${m.id}`), "Ventana eliminada.")}>Quitar</button></li>)}</ul>
      </section>
    </div>
  );
}
