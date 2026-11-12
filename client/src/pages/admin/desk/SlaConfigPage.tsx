import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";
import { fmtDur } from "./SlaPanel";
import { SearchSelect } from "@/components/ui/search-select";

const inp = "border rounded-lg px-3 py-2 text-sm";
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };
const SEVS = ["P0", "P1", "P2", "P3"];
const TYPES: Record<string, string> = { incident: "Incidente", service_request: "Solicitud", question: "Consulta" };
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const mins = (v: string) => (v.trim() === "" ? null : Number(v));

type Form = { id?: number; name: string; position: string; types: string[]; severities: string[]; calendarKind: string; firstResponseMin: string; updateMin: string; resolutionMin: string; active: boolean };
const blank: Form = { name: "", position: "100", types: [], severities: [], calendarKind: "business", firstResponseMin: "", updateMin: "", resolutionMin: "", active: true };

export default function SlaConfigPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [cal, setCal] = useState<any>(null);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [noPolicy, setNoPolicy] = useState<any[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [hol, setHol] = useState({ date: "", name: "" });
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setPolicies(await (await apiRequest("GET", "/api/desk/sla/policies")).json());
      const c = await (await apiRequest("GET", "/api/desk/sla/calendar")).json();
      setCal(c.calendar); setHolidays(c.holidays);
      setNoPolicy(await (await apiRequest("GET", "/api/desk/sla/no-policy")).json());
      apiRequest("GET", "/api/desk/sla/changes").then((r) => r.json()).then(setChanges).catch(() => {});
    } catch { setMsg("No se pudo cargar la configuración de SLA."); }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); setMsg("");
    try { const r = await fn(); setMsg(r?.recalc ? `${ok} Recalculados ${r.recalc.tickets} tickets (versión ${r.recalc.version}).` : ok); await load(); }
    catch (e) { setMsg(errMsg(e, "No se pudo completar la operación")); }
    finally { setBusy(false); }
  };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const savePolicy = () => run(async () => {
    const f = form!;
    const body = {
      name: f.name, position: Number(f.position), calendarKind: f.calendarKind, active: f.active,
      filters: { ...(f.types.length ? { types: f.types } : {}), ...(f.severities.length ? { severities: f.severities } : {}) },
      firstResponseMin: mins(f.firstResponseMin), updateMin: mins(f.updateMin), resolutionMin: mins(f.resolutionMin),
    };
    const r = await (await apiRequest(f.id ? "PUT" : "POST", f.id ? `/api/desk/sla/policies/${f.id}` : "/api/desk/sla/policies", body)).json();
    setForm(null); return r;
  }, "Política guardada.");

  const edit = (p: any) => setForm({
    id: p.id, name: p.name, position: String(p.position), types: p.filters?.types ?? [], severities: p.filters?.severities ?? [], calendarKind: p.calendarKind,
    firstResponseMin: p.firstResponseMin ?? "", updateMin: p.updateMin ?? "", resolutionMin: p.resolutionMin ?? "", active: p.active,
  } as Form);
  const summary = (p: any) => [p.filters?.types?.map((t: string) => TYPES[t]).join("/"), p.filters?.severities?.join("/")].filter(Boolean).join(" · ") || "Todos";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Motor de SLA</h1>
        <button disabled={busy} onClick={() => run(() => apiRequest("POST", "/api/desk/sla/recalc", { reason: "Recálculo manual" }).then((r) => r.json()).then((r) => ({ recalc: r })), "Recálculo completo.")}
          className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">Recalcular todos</button>
      </div>
      {msg && <div className="bg-blue-50 border border-blue-200 text-blue-900 text-sm p-3 rounded-lg">{msg}</div>}

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Políticas (se aplica la primera que coincide)</h2>
          <button onClick={() => setForm({ ...blank })} className="px-3 py-1.5 bg-[#00aeef] text-white rounded-lg text-sm">Nueva política</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1">#</th><th>Nombre</th><th>Aplica a</th><th>1ª respuesta</th><th>Actualización</th><th>Resolución</th><th>Calendario</th><th /></tr></thead>
          <tbody>{policies.map((p) => (
            <tr key={p.id} className={`border-t ${p.active ? "" : "opacity-50"}`}>
              <td className="py-1.5">{p.position}</td><td>{p.name} <span className="text-xs text-gray-400">v{p.version}</span></td><td>{summary(p)}</td>
              <td>{p.firstResponseMin ? fmtDur(p.firstResponseMin * 60000) : "—"}</td><td>{p.updateMin ? fmtDur(p.updateMin * 60000) : "—"}</td>
              <td>{p.resolutionMin ? fmtDur(p.resolutionMin * 60000) : "—"}</td><td>{p.calendarKind === "24x7" ? "24x7" : "Laboral"}</td>
              <td className="text-right space-x-2"><button className="text-[#0088c2]" onClick={() => edit(p)}>Editar</button>
                <button className="text-red-600" onClick={() => confirm(`¿Eliminar "${p.name}"?`) && run(() => apiRequest("DELETE", `/api/desk/sla/policies/${p.id}`).then((r) => r.json()), "Política eliminada.")}>Eliminar</button></td>
            </tr>))}</tbody>
        </table>
        <p className="text-xs text-gray-500">Las metas se expresan en minutos del calendario aplicable. Todo cambio recalcula retroactivamente los tickets y queda registrado.</p>
        {form && (
          <div className="border rounded-lg p-3 bg-gray-50 grid sm:grid-cols-2 gap-3 text-sm">
            <label>Nombre<input className={`${inp} w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Orden<input className={`${inp} w-full`} inputMode="numeric" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></label>
            <div>Tipos<div className="flex gap-3 flex-wrap">{Object.entries(TYPES).map(([k, v]) => <label key={k} className="flex gap-1"><input type="checkbox" checked={form.types.includes(k)} onChange={() => setForm({ ...form, types: toggle(form.types, k) })} />{v}</label>)}</div></div>
            <div>Severidades<div className="flex gap-3">{SEVS.map((s) => <label key={s} className="flex gap-1"><input type="checkbox" checked={form.severities.includes(s)} onChange={() => setForm({ ...form, severities: toggle(form.severities, s) })} />{s}</label>)}</div></div>
            <label>1ª respuesta (min)<input className={`${inp} w-full`} inputMode="numeric" value={form.firstResponseMin} onChange={(e) => setForm({ ...form, firstResponseMin: e.target.value })} /></label>
            <label>Actualización cada (min, P0/P1)<input className={`${inp} w-full`} inputMode="numeric" value={form.updateMin} onChange={(e) => setForm({ ...form, updateMin: e.target.value })} /></label>
            <label>Resolución (min)<input className={`${inp} w-full`} inputMode="numeric" value={form.resolutionMin} onChange={(e) => setForm({ ...form, resolutionMin: e.target.value })} /></label>
            <label>Calendario<SearchSelect className={`${inp} w-full`} value={form.calendarKind} onChange={(e) => setForm({ ...form, calendarKind: e.target.value })}><option value="business">Laboral</option><option value="24x7">24x7</option></SearchSelect></label>
            <label className="flex gap-2 items-center"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Activa</label>
            <div className="sm:col-span-2 space-x-2"><button disabled={busy || !form.name} onClick={savePolicy} className="px-4 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50">Guardar y recalcular</button><button onClick={() => setForm(null)} className="px-4 py-2 border rounded-lg">Cancelar</button></div>
          </div>)}
      </section>

      {cal && (
        <section className="bg-white border rounded-xl p-4 space-y-3 text-sm">
          <h2 className="font-semibold">Calendario laboral y feriados</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <label>Zona horaria<input className={inp} value={cal.tz} onChange={(e) => setCal({ ...cal, tz: e.target.value })} /></label>
            <label>Inicio<input className={inp} type="time" value={cal.start} onChange={(e) => setCal({ ...cal, start: e.target.value })} /></label>
            <label>Fin<input className={inp} type="time" value={cal.end} onChange={(e) => setCal({ ...cal, end: e.target.value })} /></label>
            <div className="flex gap-2">{DAYS.map((d, i) => <label key={d} className="flex gap-1"><input type="checkbox" checked={cal.days.includes(i)} onChange={() => setCal({ ...cal, days: cal.days.includes(i) ? cal.days.filter((x: number) => x !== i) : [...cal.days, i].sort() })} />{d}</label>)}</div>
            <button disabled={busy} onClick={() => run(() => apiRequest("PUT", "/api/desk/sla/calendar", cal).then((r) => r.json()), "Calendario guardado.")} className="px-3 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50">Guardar y recalcular</button>
          </div>
          <p className="text-xs text-gray-500">Los feriados oficiales de México (LFT art. 74) se aplican automáticamente. Agrega aquí feriados adicionales de toda la empresa.</p>
          <div className="flex gap-2 items-end">
            <input className={inp} type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
            <input className={inp} placeholder="Nombre" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
            <button disabled={busy || !hol.date} onClick={() => run(() => apiRequest("POST", "/api/desk/sla/holidays", hol).then((r) => r.json()).then((r) => { setHol({ date: "", name: "" }); return r; }), "Feriado agregado.")} className="px-3 py-2 border rounded-lg disabled:opacity-50">Agregar feriado</button>
          </div>
          <ul className="text-xs text-gray-600 space-y-1">{holidays.filter((h) => !h.accountId).map((h) => <li key={h.id}>{h.date} {h.name} <button className="text-red-600 ml-2" onClick={() => run(() => apiRequest("DELETE", `/api/desk/sla/holidays/${h.id}`).then((r) => r.json()), "Feriado eliminado.")}>quitar</button></li>)}</ul>
        </section>)}

      <section className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Control: tickets sin SLA ({noPolicy.length})</h2>
        {noPolicy.length === 0 ? <p className="text-gray-500">Todos los tickets con SLA aplicable tienen una política.</p>
          : <ul className="text-xs">{noPolicy.map((t) => <li key={t.id}><a className="text-[#0088c2]" href={`/admin/soporte/tickets/${t.id}`}>{t.key}</a> · {t.type} {t.severity ?? ""}</li>)}</ul>}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Tarea programada (alertas)</h2>
        <p className="text-gray-600 text-xs">Un cron llama cada pocos minutos a <code>/api/internal/sla/tick</code> con un token secreto para recalcular relojes y enviar alertas al 50/75/90 % y al vencimiento. Generar un token nuevo invalida el anterior.</p>
        <button onClick={() => run(async () => { const r = await (await apiRequest("POST", "/api/desk/sla/tick-token")).json(); setToken(r.token); return r; }, "Token generado (se muestra una sola vez).")} className="px-3 py-2 border rounded-lg">Generar token</button>
        {token && <code className="block bg-gray-100 p-2 rounded break-all">{token}</code>}
      </section>

      {changes.length > 0 && (
        <section className="bg-white border rounded-xl p-4 text-sm">
          <h2 className="font-semibold mb-2">Registro de cambios</h2>
          <ul className="text-xs text-gray-600 space-y-1">{changes.slice(0, 15).map((c) => <li key={c.id}>{fmt(c.at)} · {c.kind}{c.detail?.reason ? ` — ${c.detail.reason}` : ""}{c.detail?.version ? ` (v${c.detail.version}, ${c.detail.tickets} tickets)` : ""}</li>)}</ul>
        </section>)}
    </div>
  );
}
