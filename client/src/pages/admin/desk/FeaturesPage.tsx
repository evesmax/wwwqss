import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";

const inp = "border rounded-lg px-3 py-2 text-sm";
const btn = "px-3 py-1.5 rounded-lg text-sm";
const ST: Record<string, string> = { evaluating: "En evaluación", quoted: "Cotizada", approved: "Aprobada", in_development: "En desarrollo", uat: "En UAT", released: "Liberada", rejected: "Rechazada", deferred: "Diferida" };
const QST: Record<string, string> = { draft: "Borrador", sent: "Enviada", approved: "Aprobada", rejected: "Rechazada", expired: "Vencida", superseded: "Reemplazada" };
const UST: Record<string, string> = { pending: "Pendiente", go: "Go", no_go: "No Go" };
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

export default function FeaturesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nf, setNf] = useState({ title: "", ticketIds: [] as number[] });
  const [qf, setQf] = useState({ accountId: "", scope: "", hours: "", cost: "", currency: "MXN", assumptions: "", validUntil: "", outOfContract: true });
  const [uf, setUf] = useState({ accountId: "", what: "", how: "" });
  const [df, setDf] = useState({ targetDate: "", reason: "" });
  const load = () => apiRequest("GET", "/api/desk/features").then((r) => r.json()).then(setRows).catch(() => setMsg({ ok: false, text: "No se pudieron cargar las funcionalidades." }));
  const open = async (id: number) => setSel(await (await apiRequest("GET", `/api/desk/features/${id}`)).json());
  useEffect(() => { load(); apiRequest("GET", "/api/desk/tickets?type=feature_request&limit=200").then((r) => r.json()).then((d) => setTickets(d.rows ?? [])).catch(() => {}); }, []);
  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); if (sel) await open(sel.feature.id); } catch (e) { setMsg({ ok: false, text: errMsg(e, "No se pudo completar") }); }
  };
  const post = (path: string, body?: unknown) => apiRequest("POST", path, body);
  const accIds: number[] = sel ? Array.from(new Set(sel.requests.map((r: any) => r.accountId))) : [];
  const accName = (id: number) => sel?.requests.find((r: any) => r.accountId === id)?.account ?? `#${id}`;
  const f = sel?.feature;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900">Funcionalidades</h1>
      <p className="text-sm text-gray-600">Consolida solicitudes de varios clientes en una funcionalidad, cotiza (aprobación del cliente en el portal), compromete fecha y libera con UAT Go / No Go. Sin respuesta tras el plazo, rige la aceptación tácita.</p>
      {msg && <div className={`text-sm p-3 rounded-lg border ${msg.ok ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-800"}`}>{msg.text}</div>}
      <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <b>Nueva funcionalidad</b>
        <input className={`${inp} w-full`} placeholder="Título" value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} />
        <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
          {tickets.length === 0 && <p className="text-xs text-gray-500">No hay solicitudes de funcionalidad.</p>}
          {tickets.map((t) => <label key={t.id} className="flex gap-2 text-xs"><input type="checkbox" checked={nf.ticketIds.includes(t.id)} onChange={(e) => setNf({ ...nf, ticketIds: e.target.checked ? [...nf.ticketIds, t.id] : nf.ticketIds.filter((x) => x !== t.id) })} />{t.key} · {t.title}</label>)}
        </div>
        <button disabled={nf.title.trim().length < 3} className={`${btn} bg-[#00aeef] text-white disabled:opacity-50`} onClick={() => run(async () => { await post("/api/desk/features", nf); setNf({ title: "", ticketIds: [] }); }, "Funcionalidad creada.")}>Crear y consolidar</button>
      </div>
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {rows.length === 0 && <p className="text-sm text-gray-500">Aún no hay funcionalidades.</p>}
          {rows.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} className={`block w-full text-left bg-white border rounded-xl p-3 text-sm hover:bg-gray-50 ${f?.id === r.id ? "ring-2 ring-[#00aeef]" : ""}`}>
              <b>{r.title}</b><span className="float-right text-xs px-2 py-0.5 rounded bg-gray-100">{ST[r.status]}</span>
              <div className="text-xs text-gray-500 mt-1">Peso {r.weight} · {r.accounts} cuenta(s) · {r.requests} solicitud(es){r.targetDate ? ` · compromiso ${r.targetDate}` : ""}{r.outOfContract ? " · costo adicional" : ""}</div>
              {r.quoteOverdue && <div className="text-xs text-red-600 mt-1">Cotización vencida (SLA de respuesta {fmt(r.quoteDue)})</div>}
            </button>))}
        </div>
        <div className="lg:col-span-3 space-y-4">
          {!sel ? <p className="text-sm text-gray-500">Selecciona una funcionalidad.</p> : (<>
            <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><b className="text-base">{f.title}</b><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{ST[f.status]}</span>
                <label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={f.outOfContract} onChange={(e) => run(() => apiRequest("PATCH", `/api/desk/features/${f.id}`, { outOfContract: e.target.checked }), "Actualizado.")} />Con costo adicional</label></div>
              {f.status !== "uat" && f.status !== "released" && <div className="flex flex-wrap gap-1">{["evaluating", "approved", "in_development", "deferred", "rejected"].filter((s) => s !== f.status).map((s) =>
                <button key={s} className={`${btn} border`} onClick={() => run(() => apiRequest("PATCH", `/api/desk/features/${f.id}`, { status: s }), `Estado: ${ST[s]}`)}>→ {ST[s]}</button>)}</div>}
              <p className="text-xs text-gray-600">Solicitudes: {sel.requests.map((r: any) => `${r.ticket?.key ?? r.ticketId} (${r.account}, peso ${r.weight})`).join(" · ")}</p>
            </div>
            <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
              <b>Compromiso de fecha</b> <span className="text-gray-600">{f.targetDate ?? "sin fecha"}</span>
              <div className="flex flex-wrap gap-2"><input type="date" className={inp} value={df.targetDate} onChange={(e) => setDf({ ...df, targetDate: e.target.value })} /><input className={`${inp} flex-1`} placeholder="Motivo (obligatorio al cambiar)" value={df.reason} onChange={(e) => setDf({ ...df, reason: e.target.value })} />
                <button disabled={!df.targetDate} className={`${btn} bg-[#00aeef] text-white disabled:opacity-50`} onClick={() => run(() => post(`/api/desk/features/${f.id}/date`, df), "Fecha registrada.")}>Guardar</button></div>
              {sel.dates.length > 0 && <details className="text-xs text-gray-500"><summary>Historial</summary>{sel.dates.map((d: any) => <p key={d.id}>{fmt(d.at)} · {d.targetDate ?? "—"} {d.reason && `· ${d.reason}`}</p>)}</details>}
            </div>
            <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
              <b>Cotizaciones</b>
              {sel.quotes.map((q: any) => <div key={q.id} className="border rounded-lg p-2 text-xs flex flex-wrap gap-2 items-center">
                <span><b>{q.account}</b> v{q.version} · {q.hours} h · {Number(q.cost).toLocaleString()} {q.currency} · vigencia {q.validUntil}</span><span className="px-2 py-0.5 bg-gray-100 rounded">{QST[q.state]}</span>
                {q.decisionNote && <i>“{q.decisionNote}”</i>}
                {q.status === "draft" && <button className={`${btn} bg-green-600 text-white`} onClick={() => run(() => post(`/api/desk/quotes/${q.id}/send`), "Cotización enviada al cliente.")}>Enviar</button>}</div>)}
              <div className="grid sm:grid-cols-3 gap-2">
                <select className={inp} value={qf.accountId} onChange={(e) => setQf({ ...qf, accountId: e.target.value })}><option value="">Cuenta…</option>{accIds.map((a) => <option key={a} value={a}>{accName(a)}</option>)}</select>
                <input className={inp} type="number" placeholder="Horas" value={qf.hours} onChange={(e) => setQf({ ...qf, hours: e.target.value })} />
                <input className={inp} type="number" placeholder="Costo" value={qf.cost} onChange={(e) => setQf({ ...qf, cost: e.target.value })} />
                <select className={inp} value={qf.currency} onChange={(e) => setQf({ ...qf, currency: e.target.value })}><option>MXN</option><option>USD</option></select>
                <input className={inp} type="date" value={qf.validUntil} onChange={(e) => setQf({ ...qf, validUntil: e.target.value })} />
                <label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={qf.outOfContract} onChange={(e) => setQf({ ...qf, outOfContract: e.target.checked })} />Fuera de contrato</label>
              </div>
              <textarea className={`${inp} w-full`} rows={2} placeholder="Alcance" value={qf.scope} onChange={(e) => setQf({ ...qf, scope: e.target.value })} />
              <textarea className={`${inp} w-full`} rows={2} placeholder="Supuestos" value={qf.assumptions} onChange={(e) => setQf({ ...qf, assumptions: e.target.value })} />
              <button disabled={!qf.accountId} className={`${btn} bg-[#00aeef] text-white disabled:opacity-50`} onClick={() => run(() => post(`/api/desk/features/${f.id}/quotes`, { ...qf, accountId: Number(qf.accountId), hours: Number(qf.hours), cost: Number(qf.cost) }), "Borrador de cotización creado.")}>Crear cotización</button>
            </div>
            <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
              <b>UAT (qué hace / cómo probarlo)</b>
              {sel.uat.map((u: any) => <div key={u.id} className="border rounded-lg p-2 text-xs"><b>{u.account}</b> · {u.what} <span className="text-gray-500">— {u.how}</span> <span className="px-2 py-0.5 bg-gray-100 rounded">{UST[u.status]}{u.tacit ? " (tácita)" : ""}</span>
                {u.comment && <i> “{u.comment}”</i>}{u.childTicketId && <span> · ticket hijo #{u.childTicketId}</span>}
                {u.status === "pending" && <button className="ml-2 text-red-600" onClick={() => run(() => apiRequest("DELETE", `/api/desk/uat/${u.id}`), "Ítem eliminado.")}>quitar</button>}</div>)}
              <div className="grid sm:grid-cols-3 gap-2">
                <select className={inp} value={uf.accountId} onChange={(e) => setUf({ ...uf, accountId: e.target.value })}><option value="">Cuenta…</option>{accIds.map((a) => <option key={a} value={a}>{accName(a)}</option>)}</select>
                <input className={inp} placeholder="Qué hace" value={uf.what} onChange={(e) => setUf({ ...uf, what: e.target.value })} />
                <input className={inp} placeholder="Cómo probarlo" value={uf.how} onChange={(e) => setUf({ ...uf, how: e.target.value })} />
              </div>
              <div className="flex gap-2"><button disabled={!uf.accountId} className={`${btn} border`} onClick={() => run(async () => { await post(`/api/desk/features/${f.id}/uat`, { ...uf, accountId: Number(uf.accountId) }); setUf({ ...uf, what: "", how: "" }); }, "Ítem agregado.")}>Agregar ítem</button>
                {f.status !== "released" && <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => run(() => post(`/api/desk/features/${f.id}/uat/start`), "Enviado a UAT; se notificó al cliente.")}>Enviar a UAT</button>}
                {f.status === "uat" && <button className={`${btn} bg-green-600 text-white`} onClick={() => run(() => post(`/api/desk/features/${f.id}/release`), "Liberada.")}>Liberar (todos Go)</button>}</div>
              {f.releasedAt && <p className="text-xs text-green-700">Liberada {fmt(f.releasedAt)} por {f.releaseKind === "tacit" ? "aceptación tácita" : "Go del cliente"}.</p>}
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
