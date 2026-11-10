import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";

const inp = "border rounded-lg px-3 py-2 text-sm";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const STATUS: Record<string, string> = { draft: "Borrador", approved: "Aprobado", sent: "Enviado" };
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

export default function ReportsPage() {
  const prev = new Date(); prev.setMonth(prev.getMonth() - 1);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ accountId: "", year: prev.getFullYear(), month: prev.getMonth() + 1, note: "" });
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => apiRequest("GET", "/api/desk/reports").then((r) => r.json()).then(setRows).catch(() => setMsg({ ok: false, text: "No se pudieron cargar los informes (requiere rol de soporte y MFA)." }));
  useEffect(() => { load(); apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts).catch(() => {}); }, []);
  const run = async (fn: () => Promise<any>, ok: string) => { setMsg(null); try { const r = await fn(); setMsg({ ok: true, text: typeof r === "string" ? r : ok }); await load(); } catch (e) { setMsg({ ok: false, text: errMsg(e, "No se pudo completar") }); } };
  const open = async (id: number) => setSel(await (await apiRequest("GET", `/api/desk/reports/${id}`)).json());

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900">Informes mensuales</h1>
      <p className="text-sm text-gray-600">Flujo: borrador → revisión (vista previa idéntica al correo) → aprobación → envío. Cada informe es una instantánea inmutable; si hay que corregir, se emite una nueva versión con nota. Los datos faltantes se muestran como N/D.</p>
      {msg && <div className={`text-sm p-3 rounded-lg border ${msg.ok ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-800"}`}>{msg.text}</div>}
      <div className="bg-white border rounded-xl p-4 grid sm:grid-cols-5 gap-2 items-end text-sm">
        <select className={inp} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}><option value="">Cuenta…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
        <select className={inp} value={f.month} onChange={(e) => setF({ ...f, month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <input className={inp} type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} />
        <input className={inp} placeholder="Nota (solo para nueva versión)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button disabled={!f.accountId} className="px-3 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50"
          onClick={() => run(() => apiRequest("POST", "/api/desk/reports", { accountId: Number(f.accountId), year: f.year, month: f.month, note: f.note }), "Borrador generado.")}>Generar borrador</button>
      </div>
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {rows.length === 0 && <p className="text-sm text-gray-500">Aún no hay informes.</p>}
          {rows.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} className={`block w-full text-left bg-white border rounded-xl p-3 text-sm hover:bg-gray-50 ${sel?.id === r.id ? "ring-2 ring-[#00aeef]" : ""}`}>
              <b>{r.account}</b> · {MONTHS[r.month - 1]} {r.year} {r.version > 1 && <span className="text-xs text-amber-700">v{r.version}</span>}
              <span className="float-right text-xs px-2 py-0.5 rounded bg-gray-100">{STATUS[r.status]}</span>
              <div className="text-xs text-gray-500 mt-1">SLA {r.summary?.slaPct != null ? `${r.summary.slaPct}%` : "N/D"} · Disp. {r.summary?.availabilityPct != null ? `${r.summary.availabilityPct}%` : "N/D"}{r.sentAt ? ` · enviado ${fmt(r.sentAt)}` : ""}</div>
            </button>))}
        </div>
        <div className="lg:col-span-3 space-y-3">
          {sel ? (<>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span className="px-2 py-1 bg-gray-100 rounded">{STATUS[sel.status]}</span>
              <span className="text-xs text-gray-500">Destinatarios: {sel.recipients.length ? sel.recipients.join(", ") : "ninguno (agrega un administrador de cuenta o lista en el contrato)"}</span>
              {sel.status === "draft" && <><button className="px-3 py-1.5 bg-green-600 text-white rounded-lg" onClick={() => run(async () => { await apiRequest("POST", `/api/desk/reports/${sel.id}/approve`); await open(sel.id); }, "Informe aprobado.")}>Aprobar</button>
                <button className="px-3 py-1.5 border rounded-lg text-red-600" onClick={() => confirm("¿Eliminar este borrador?") && run(async () => { await apiRequest("DELETE", `/api/desk/reports/${sel.id}`); setSel(null); }, "Borrador eliminado.")}>Eliminar</button></>}
              {sel.status !== "draft" && <button className="px-3 py-1.5 bg-[#00aeef] text-white rounded-lg" onClick={() => confirm(`¿${sel.status === "sent" ? "Reenviar" : "Enviar"} a ${sel.recipients.length} destinatario(s)?`) && run(async () => { const r = await (await apiRequest("POST", `/api/desk/reports/${sel.id}/send`)).json(); await open(sel.id); await load(); return `Enviado a ${r.sent} de ${r.recipients} destinatarios${r.sent < r.recipients ? " (revisa la configuración SMTP)" : ""}.`; }, "")}>{sel.status === "sent" ? "Reenviar" : "Enviar"}</button>}
            </div>
            <iframe title="Vista previa" sandbox="" srcDoc={sel.html} className="w-full bg-white border rounded-xl" style={{ height: "75vh" }} />
          </>) : <p className="text-sm text-gray-500">Selecciona un informe para ver la vista previa.</p>}
        </div>
      </div>
    </div>
  );
}
