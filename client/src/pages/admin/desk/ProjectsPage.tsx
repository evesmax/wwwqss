import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import GanttChart from "./GanttChart";
import ProjectItems from "./ProjectItems";
import { SearchSelect } from "@/components/ui/search-select";

const inp = "border rounded-lg px-3 py-2 text-sm";
const btn = "px-3 py-1.5 rounded-lg text-sm";
const ST: Record<string, { t: string; c: string }> = { on_track: { t: "En tiempo", c: "bg-green-100 text-green-800" }, at_risk: { t: "En riesgo", c: "bg-amber-100 text-amber-800" }, late: { t: "Atrasado", c: "bg-red-100 text-red-800" } };
const ORIG: Record<string, string> = { qss: "QSS", customer: "Cliente", third_party: "Tercero", force_majeure: "Fuerza mayor" };
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

export default function ProjectsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nf, setNf] = useState({ accountId: "", name: "", solutionType: "", startDate: "", template: "generic" });
  const [rev, setRev] = useState({ reason: "", origin: "qss" });
  const [imp, setImp] = useState<{ csv: string; name: string; preview?: any }>({ csv: "", name: "" });
  const load = () => apiRequest("GET", "/api/desk/projects").then((r) => r.json()).then(setRows).catch(() => setMsg({ ok: false, text: "No se pudieron cargar los proyectos." }));
  const open = async (id: number) => setSel(await (await apiRequest("GET", `/api/desk/projects/${id}`)).json());
  useEffect(() => { load(); apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts).catch(() => {}); }, []);
  const run = async (fn: () => Promise<any>, ok: string) => { setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); await load(); if (sel) await open(sel.project.id); } catch (e) { setMsg({ ok: false, text: errMsg(e, "No se pudo completar") }); } };
  const p = sel?.project, pr = sel?.progress;
  const needRev = p?.baselineVersion >= 1;
  const patchTask = (t: any, body: any, schedule = false) => run(() => apiRequest("PATCH", `/api/desk/projects/${p.id}/tasks/${t.id}`, schedule && needRev ? { ...body, ...rev } : body), "Tarea actualizada.");

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900">Proyectos de implementación</h1>
      <p className="text-sm text-gray-600">Cronograma en días hábiles con dependencias, línea base versionada, avance calculado (ponderado por horas) y gates con firma del cliente. Tras aprobar el plan, todo cambio de fechas genera una revisión con motivo y origen.</p>
      {msg && <div className={`text-sm p-3 rounded-lg border ${msg.ok ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-800"}`}>{msg.text}</div>}
      <div className="bg-white border rounded-xl p-4 grid sm:grid-cols-5 gap-2 items-end text-sm">
        <SearchSelect className={inp} value={nf.accountId} onChange={(e) => setNf({ ...nf, accountId: e.target.value })}><option value="">Cuenta…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</SearchSelect>
        <input className={inp} placeholder="Nombre del proyecto" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
        <input className={inp} placeholder="Solución (TMS, MES…)" value={nf.solutionType} onChange={(e) => setNf({ ...nf, solutionType: e.target.value })} />
        <input className={inp} type="date" value={nf.startDate} onChange={(e) => setNf({ ...nf, startDate: e.target.value })} />
        <button disabled={!nf.accountId || nf.name.trim().length < 3 || !nf.startDate} className={`${btn} bg-[#00aeef] text-white disabled:opacity-50`}
          onClick={() => run(async () => { await apiRequest("POST", "/api/desk/projects", { ...nf, accountId: Number(nf.accountId) }); setNf({ ...nf, name: "" }); }, "Proyecto creado desde la plantilla estándar (F0–F7).")}>Crear con plantilla</button>
      </div>
      <details className="bg-white border rounded-xl p-4 text-sm"><summary className="cursor-pointer font-semibold">Importar cronograma existente (CSV)</summary>
        <div className="mt-2 space-y-2 text-xs"><p className="text-gray-600">Columnas: tipo (FASE, TAREA, GATE, PAGO, FERIADO), codigo, nombre, fase, responsable, inicio, fin, avance, notas, monto, fecha. Se carga como <b>borrador</b>: las referencias P-/R-/DOC-/MOD- en las notas crean objetos pendientes de completar y la línea base se aprueba después de revisar. Si trabajas en Excel, guarda la hoja como CSV.</p>
          <div className="flex flex-wrap gap-2 items-center"><input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImp({ ...imp, csv: await f.text(), preview: undefined }); }} />
            <input className={inp} placeholder="Nombre del proyecto" value={imp.name} onChange={(e) => setImp({ ...imp, name: e.target.value })} />
            <button disabled={!imp.csv || !nf.accountId} className={`${btn} border disabled:opacity-50`} onClick={() => run(async () => { const r = await (await apiRequest("POST", "/api/desk/project-import/preview", { accountId: Number(nf.accountId), csv: imp.csv })).json(); setImp({ ...imp, preview: r }); }, "Vista previa lista.")}>Vista previa (usa la cuenta de arriba)</button>
            <button disabled={!imp.preview || imp.preview.errors.length > 0 || imp.name.trim().length < 3} className={`${btn} bg-[#00aeef] text-white disabled:opacity-50`} onClick={() => run(async () => { await apiRequest("POST", "/api/desk/project-import", { accountId: Number(nf.accountId), name: imp.name, solutionType: nf.solutionType, csv: imp.csv }); setImp({ csv: "", name: "" }); }, "Cronograma cargado como borrador: revisa y aprueba la línea base.")}>Cargar como borrador</button></div>
          {imp.preview && <div className="border rounded-lg p-2">{imp.preview.phases} fases · {imp.preview.tasks} tareas · {imp.preview.gates} gates · {imp.preview.payments} pagos · {imp.preview.holidays} feriados
            {imp.preview.errors.length > 0 && <ul className="text-red-700 list-disc ml-5 mt-1">{imp.preview.errors.slice(0, 12).map((e: any, i: number) => <li key={i}>Línea {e.line}: {e.message}</li>)}</ul>}</div>}</div></details>
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-gray-500">Aún no hay proyectos.</p>}
          {rows.map((r) => <button key={r.id} onClick={() => open(r.id)} className={`block w-full text-left bg-white border rounded-xl p-3 text-sm hover:bg-gray-50 ${p?.id === r.id ? "ring-2 ring-[#00aeef]" : ""}`}>
            <b>{r.name}</b><div className="text-xs text-gray-500">{r.account} · {r.baselineVersion ? `línea base v${r.baselineVersion}` : "plan en borrador"}</div>
            <div className="text-xs mt-1">Avance {r.progress.actual}% / plan {r.progress.planned}% <span className={`ml-1 px-1.5 py-0.5 rounded ${ST[r.progress.status].c}`}>{ST[r.progress.status].t}</span>{r.warnings > 0 && <span className="ml-1 text-amber-700">⚠ {r.warnings}</span>}</div></button>)}
        </div>
        <div className="lg:col-span-3 space-y-4">
          {!sel ? <p className="text-sm text-gray-500">Selecciona un proyecto.</p> : (<>
            <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
              <div className="flex flex-wrap gap-3 items-center"><b className="text-base">{p.name}</b>
                <span className={`px-2 py-0.5 rounded text-xs ${ST[pr.status].c}`}>{ST[pr.status].t}</span>
                <span>Real {pr.actual}% · Plan {pr.planned}% <span className="text-xs text-gray-500">(base: {pr.weightBasis === "hours" ? "horas" : "días hábiles"})</span></span>
                {pr.blockedByClient > 0 && <span className="text-xs text-red-700">⛔ {pr.blockedByClient} bloqueada(s) por el cliente (no se atribuyen a QSS)</span>}
                {pr.overdueGate && <span className="text-xs text-red-700">Gate vencido sin firma</span>}
                {!needRev && <button className={`${btn} bg-green-600 text-white`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${p.id}/approve-plan`), "Plan aprobado: línea base v1 congelada.")}>Aprobar plan (línea base)</button>}</div>
              {needRev && <div className="flex flex-wrap gap-2 items-center bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs">Cambios de fechas →
                <input className={`${inp} flex-1`} placeholder="Motivo del cambio (obligatorio)" value={rev.reason} onChange={(e) => setRev({ ...rev, reason: e.target.value })} />
                <SearchSelect className={inp} value={rev.origin} onChange={(e) => setRev({ ...rev, origin: e.target.value })}>{Object.entries(ORIG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SearchSelect></div>}
            </div>
            {sel.warnings.length > 0 && <details className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs" open><summary className="font-semibold text-amber-900">Validaciones de consistencia ({sel.warnings.length})</summary>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">{sel.warnings.map((w: any, i: number) => <li key={i}>{w.message}</li>)}</ul></details>}
            <a className="text-xs text-[#0088c2] underline" href={`/api/desk/projects/${p.id}/export.csv`}>Exportar cronograma (CSV)</a>
            <GanttChart tasks={sel.tasks.map((t: any) => ({ ...t, start: t.startDate, end: t.endDate }))} gates={sel.gates} holidays={sel.holidays} today={pr.asOf} />
            <div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-xs"><thead className="bg-gray-50 text-left"><tr><th className="p-2">EAP</th><th>Tarea</th><th>Días</th><th>Horas</th><th>Inicio → Fin</th><th>%</th><th>Cliente</th><th>Visible</th><th>Bloq.</th></tr></thead><tbody>
              {sel.tasks.map((t: any) => <tr key={t.id} className="border-t">
                <td className="p-2 text-gray-500">{t.code}</td><td>{t.name}</td>
                <td><input className="w-12 border rounded px-1" type="number" defaultValue={t.days} onBlur={(e) => Number(e.target.value) !== t.days && patchTask(t, { days: Number(e.target.value) }, true)} /></td>
                <td><input className="w-14 border rounded px-1" type="number" defaultValue={t.hours ?? ""} onBlur={(e) => patchTask(t, { hours: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="whitespace-nowrap">{t.startDate} → {t.endDate}{t.baseline && (t.baseline.end !== t.endDate) && <span className="text-red-600"> (base {t.baseline.end})</span>}</td>
                <td><input className="w-12 border rounded px-1" type="number" min={0} max={100} defaultValue={t.pct} onBlur={(e) => { const v = Number(e.target.value); if (v !== t.pct) patchTask(t, v > 0 && v < 100 ? { pct: v, progressNote: prompt("Nota del avance parcial") || "" } : { pct: v }); }} /></td>
                <td><input type="checkbox" checked={t.clientSide} onChange={(e) => patchTask(t, { clientSide: e.target.checked })} /></td>
                <td><input type="checkbox" checked={t.clientVisible} onChange={(e) => patchTask(t, { clientVisible: e.target.checked })} /></td>
                <td><input type="checkbox" checked={t.blockedByClient} onChange={(e) => patchTask(t, { blockedByClient: e.target.checked })} /></td></tr>)}
            </tbody></table></div>
            <div className="bg-white border rounded-xl p-4 text-sm space-y-2"><b>Gates</b>
              {sel.gates.map((g: any) => <div key={g.id} className="border rounded-lg p-2 text-xs"><b>{g.code}</b> {g.name} · {g.date} · {g.status === "signed" ? <span className="text-green-700">firmado ({g.result})</span> : g.result === "no_go" ? <span className="text-red-700">No Go del cliente</span> : "abierto"}
                <div className="text-gray-500">Criterios: {(g.criteria as string[]).join("; ") || "—"}</div></div>)}</div>
            <ProjectItems d={sel} run={run} />
            {sel.revisions.length > 0 && <div className="bg-white border rounded-xl p-4 text-xs space-y-1"><b className="text-sm">Revisiones de la línea base</b>
              {sel.revisions.map((r: any) => <p key={r.version}>v{r.version} · {ORIG[r.origin]} · {r.reason}</p>)}</div>}
          </>)}
        </div>
      </div>
    </div>
  );
}
