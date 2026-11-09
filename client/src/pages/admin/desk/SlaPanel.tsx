import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";

export const fmtDur = (ms: number) => {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
};
export const METRIC_LABEL: Record<string, string> = { first_response: "Primera respuesta", update: "Actualización periódica", resolution: "Resolución" };
export const STATE_LABEL: Record<string, string> = { running: "En curso", at_risk: "En riesgo", met: "Cumplido", breached: "Incumplido", excluded: "Excluido", cancelled: "Cancelado" };
const STATE_COLOR: Record<string, string> = { running: "bg-blue-100 text-blue-800", at_risk: "bg-yellow-100 text-yellow-800", met: "bg-green-100 text-green-800", breached: "bg-red-100 text-red-800", excluded: "bg-gray-200 text-gray-700", cancelled: "bg-gray-200 text-gray-700" };
const BAR: Record<string, string> = { running: "bg-blue-500", at_risk: "bg-yellow-500", met: "bg-green-500", breached: "bg-red-500", excluded: "bg-gray-400", cancelled: "bg-gray-400" };
export const EXCLUSION_LABEL: Record<string, string> = {
  third_party_declared: "Tercero declarado", customer_no_info: "Cliente no entregó información", mistyped: "Ticket mal tipificado", force_majeure: "Fuerza mayor", imported: "Ticket importado (histórico)",
};

export default function SlaPanel({ ticketId, isManager, version }: { ticketId: number; isManager: boolean; version?: unknown }) {
  const [sla, setSla] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const load = () => apiRequest("GET", `/api/desk/tickets/${ticketId}/sla`).then((r) => r.json()).then(setSla).catch(() => setSla(null));
  useEffect(() => { load(); }, [ticketId, version]);
  if (!sla) return null;
  const excluded = sla.metrics?.[0]?.state === "excluded";
  const act = async (method: string, body?: unknown) => {
    setErr("");
    try { await apiRequest(method, `/api/desk/tickets/${ticketId}/sla-exclusion`, body); setReason(""); setNote(""); load(); }
    catch { setErr("No se pudo guardar la exclusión"); }
  };
  return (
    <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
      <h3 className="font-semibold">SLA {sla.policy && <span className="font-normal text-gray-500">· {sla.policy.name}</span>}</h3>
      {!sla.policy && <p className="text-gray-500">Sin política de SLA aplicable.</p>}
      {sla.policy && !sla.applicable && <p className="text-gray-500">Este tipo de ticket no tiene SLA.</p>}
      {sla.metrics.map((m: any) => {
        const pct = Math.min(100, Math.round(m.pctUsed * 100));
        return (
          <div key={m.key} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-medium">{METRIC_LABEL[m.key]}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATE_COLOR[m.state]}`}>{STATE_LABEL[m.state]}{m.paused ? " · en pausa" : ""}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded"><div className={`h-2 rounded ${BAR[m.state]}`} style={{ width: `${pct}%` }} /></div>
            <p className="text-xs text-gray-500">
              {fmtDur(m.elapsedMs)} de {fmtDur(m.targetMs)}
              {!m.stoppedAt && m.state !== "excluded" && m.state !== "cancelled" && <> · vence {fmt(m.dueAt)}</>}
              {m.breaches > 0 && m.key === "update" && <> · {m.breaches} incumplimiento(s)</>}
            </p>
            {m.pauses.filter((p: any) => p.reason !== "resolved").map((p: any, i: number) => (
              <p key={i} className="text-xs text-gray-500">Pausa: {p.reason === "waiting_customer" ? "esperando cliente" : `esperando tercero (${p.note})`} · {fmt(p.from)} → {p.to ? fmt(p.to) : "ahora"}</p>
            ))}
          </div>
        );
      })}
      {sla.excludedReason && <p className="text-xs bg-gray-50 border rounded p-2">Excluido del SLA: <b>{EXCLUSION_LABEL[sla.excludedReason] ?? sla.excludedReason}</b></p>}
      {isManager && sla.applicable && (excluded
        ? <button onClick={() => act("DELETE")} className="text-xs text-[#0088c2]">Quitar exclusión</button>
        : <details><summary className="text-xs text-[#0088c2] cursor-pointer">Excluir del SLA</summary>
            <div className="space-y-1 mt-2">
              <select className="border rounded px-2 py-1 text-sm w-full" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Motivo…</option>{Object.entries(EXCLUSION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className="border rounded px-2 py-1 text-sm w-full" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button disabled={!reason} onClick={() => act("POST", { reason, note })} className="px-3 py-1 bg-gray-800 text-white rounded text-xs disabled:opacity-40">Excluir</button>
            </div></details>)}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
