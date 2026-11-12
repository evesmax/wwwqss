import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { STATUS_LABEL, fmt } from "./ticketUi";
import { SearchSelect } from "@/components/ui/search-select";

const inp = "border rounded-lg px-3 py-2 text-sm";
const FIELDS: [string, string][] = [
  ["externalRef", "Folio / ID original"], ["title", "Título *"], ["description", "Descripción"], ["type", "Tipo"], ["severity", "Prioridad / severidad"],
  ["status", "Estado"], ["createdAt", "Fecha de reporte"], ["resolvedAt", "Fecha de resolución"], ["hours", "Horas"], ["requester", "Solicitante"],
];
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

export default function ImportPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState("");
  const [defaultType, setDefaultType] = useState("incident");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { apiRequest("GET", "/api/desk/accounts").then((r) => r.json()).then(setAccounts).catch(() => {}); }, []);

  const call = async (kind: "preview" | "commit", map?: Record<string, string>) => {
    const qs = new URLSearchParams({ accountId, defaultType, ...(map ? { mapping: JSON.stringify(map) } : {}) });
    const r = await fetch(`/api/desk/import/${kind}?${qs}`, { method: "POST", credentials: "include", headers: { "Content-Type": "text/csv" }, body: csv });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message ?? "Error");
    return j;
  };
  const preview = async (map?: Record<string, string>) => {
    setBusy(true); setMsg(null);
    try { const j = await call("preview", map); setPv(j); setMapping(j.mapping); }
    catch (e) { setPv(null); setMsg({ ok: false, text: errMsg(e, "No se pudo leer el archivo") }); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await call("commit", mapping);
      setMsg({ ok: true, text: `Importados ${j.imported} tickets (${j.alreadyImported} ya existían, ${j.skipped} omitidos, ${j.flagged} con alertas de calidad). Quedan sin SLA y marcados como históricos.` });
      setPv(null); setCsv(""); setFileName("");
    } catch (e) { setMsg({ ok: false, text: errMsg(e, "No se pudo importar") }); }
    finally { setBusy(false); }
  };
  const onFile = async (f: File) => { setFileName(f.name); setCsv(await f.text()); setPv(null); };

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Importar tickets históricos (CSV)</h1>
      <p className="text-sm text-gray-600">Sube el CSV exportado de tu hoja (en Excel: Guardar como → CSV). Los tickets importados quedan <b>sin SLA</b>, con su fecha original y una marca de calidad de datos. Una prioridad P0 del archivo se guarda solo como "propuesta" porque P0 exige el cuestionario de clasificación.</p>
      {msg && <div className={`text-sm p-3 rounded-lg border ${msg.ok ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-800"}`}>{msg.text}</div>}
      <div className="bg-white border rounded-xl p-4 grid sm:grid-cols-3 gap-3 text-sm items-end">
        <label>Cuenta destino<SearchSelect className={`${inp} w-full`} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPv(null); }}>
          <option value="">Selecciona…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.ticketPrefix})</option>)}</SearchSelect></label>
        <label>Tipo por defecto<SearchSelect className={`${inp} w-full`} value={defaultType} onChange={(e) => { setDefaultType(e.target.value); setPv(null); }}>
          <option value="incident">Incidente</option><option value="service_request">Solicitud</option><option value="question">Consulta</option><option value="feature_request">Nueva función</option></SearchSelect></label>
        <label className="text-[#0088c2] cursor-pointer">{fileName || "Elegir archivo CSV"}<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} /></label>
        <div className="sm:col-span-3"><button disabled={!accountId || !csv || busy} onClick={() => preview()} className="px-4 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50">Revisar archivo</button></div>
      </div>

      {pv && (
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-4 text-sm">
            <h2 className="font-semibold mb-2">Columnas</h2>
            <div className="grid sm:grid-cols-2 gap-2">{FIELDS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><span className="w-44">{label}</span>
                <SearchSelect className={`${inp} flex-1`} value={mapping[k] ?? ""} onChange={(e) => { const m = { ...mapping }; if (e.target.value) m[k] = e.target.value; else delete m[k]; setMapping(m); }}>
                  <option value="">(no usar)</option>{pv.headers.map((h: string) => <option key={h}>{h}</option>)}</SearchSelect></label>))}</div>
            <button disabled={busy} onClick={() => preview(mapping)} className="mt-3 px-3 py-1.5 border rounded-lg">Actualizar vista previa</button>
          </div>
          <div className="bg-white border rounded-xl p-4 text-sm space-y-2">
            <p><b>{pv.summary.importable}</b> de {pv.summary.total} filas se importarán · {pv.summary.skipped} omitidas · {pv.summary.flagged} con alertas · {pv.summary.alreadyImported} ya importadas antes</p>
            {pv.flags.length > 0 && <ul className="text-xs text-amber-800 list-disc pl-5">{pv.flags.map((f: any) => <li key={f.flag}>{f.label}: {f.count}</li>)}</ul>}
            <table className="w-full text-xs"><thead><tr className="text-left text-gray-500"><th>Fila</th><th>Folio</th><th>Título</th><th>Estado</th><th>Prio.</th><th>Reporte</th><th /></tr></thead>
              <tbody>{pv.sample.map((r: any) => <tr key={r.line} className={`border-t ${r.skip ? "bg-red-50" : ""}`}><td>{r.line}</td><td>{r.ref ?? "—"}</td><td>{r.title || "—"}</td><td>{STATUS_LABEL[r.status] ?? r.status}</td><td>{r.severity ?? "—"}</td><td>{r.createdAt ? fmt(r.createdAt) : "—"}</td><td className="text-red-700">{r.skip ?? ""}</td></tr>)}</tbody></table>
            <p className="text-xs text-gray-500">Se muestran las primeras 15 filas.</p>
            <button disabled={busy || !mapping.title || pv.summary.importable === 0} onClick={commit} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">Importar {pv.summary.importable} tickets</button>
          </div>
        </div>)}
    </div>
  );
}
