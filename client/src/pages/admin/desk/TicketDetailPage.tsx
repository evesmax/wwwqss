import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { STATUS_LABEL, TYPE_LABEL, SEV_COLOR, EVENT_TEXT, fmt } from "./ticketUi";
import SlaPanel from "./SlaPanel";
import { ContextPanel, AttachmentsCard, TechContext } from "./TicketContextPanel";
import { SearchSelect } from "@/components/ui/search-select";

const inp = "border rounded-lg px-3 py-2 text-sm";
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

export default function TicketDetailPage({ id }: { id: string; user?: any }) {
  const [d, setD] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"public" | "internal">("public");
  const [tr, setTr] = useState({ to: "", reason: "", cause: "", fix: "", prevention: "", kind: "code" });
  const [time, setTime] = useState({ minutes: "30", billable: true, note: "" });
  const [sev, setSev] = useState({ value: "", inaccessible: false, criticalBlocked: false, hasWorkaround: false, users: 0 });

  const load = () => apiRequest("GET", `/api/desk/tickets/${id}`).then((r) => r.json()).then(setD).catch(() => setMsg("No se pudo cargar el ticket"));
  useEffect(() => { load(); apiRequest("GET", "/api/desk/agents").then((r) => r.json()).then(setAgents).catch(() => {}); apiRequest("GET", "/api/desk/me").then((r) => r.json()).then((m) => setRoles(m.roles)).catch(() => {}); }, [id]);
  if (!d) return <div className="p-6 text-gray-500">{msg || "Cargando…"}</div>;
  const t = d.ticket;
  const isManager = roles.some((r) => ["owner", "support_manager"].includes(r));

  const run = async (fn: () => Promise<unknown>, ok = "") => {
    setMsg("");
    try { await fn(); await load(); if (ok) setMsg(ok); } catch (e) { setMsg(errMsg(e, "No se pudo completar la acción")); }
  };
  const patch = (data: any) => run(() => apiRequest("PATCH", `/api/desk/tickets/${id}`, data));
  const needsRca = t.type === "incident" && ["P0", "P1"].includes(t.severity) && tr.to === "resolved";

  const timeline = [
    ...d.events.filter((e: any) => e.kind !== "comment").map((e: any) => ({ at: e.at, kind: "event", text: (EVENT_TEXT[e.kind] ?? (() => e.kind))(e.detail), actor: e.actorType })),
    ...d.comments.map((c: any) => ({ at: c.createdAt, kind: c.visibility, text: c.body, actor: c.authorType })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const upload = async (file: File, visibility: string) => {
    await fetch(`/api/desk/tickets/${id}/attachments?filename=${encodeURIComponent(file.name)}&visibility=${visibility}`, {
      method: "POST", credentials: "include", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
    }).then(async (r) => { if (!r.ok) throw new Error(await r.text()); });
  };

  return (
    <div className="p-6 grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Link href="/soporte/tickets" className="text-sm text-[#0088c2]">← Tickets</Link>
        <div>
          <p className="font-mono text-sm text-gray-500">{[t.key, d.account?.cliente, TYPE_LABEL[t.type], d.product?.name, d.instance?.name].filter(Boolean).join(" · ")}</p>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="mt-1 text-sm"><b>{STATUS_LABEL[t.status] ?? t.status}</b>
            {t.severity && <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${SEV_COLOR[t.severity]}`}>{t.severity}</span>}
            {!t.severity && t.perceivedSeverity && <span className="ml-2 text-xs text-gray-500">Cliente propone {t.perceivedSeverity}</span>}
            {!t.slaApplicable && <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Sin SLA</span>}</p>
        </div>
        {t.description && <div className="bg-white border rounded-xl p-4 whitespace-pre-wrap text-sm">{t.description}</div>}
        <TechContext ctx={t.context} />
        {msg && <div className="bg-amber-50 text-amber-800 text-sm p-3 rounded-lg border border-amber-200">{msg}</div>}

        <div className="space-y-2">
          {timeline.map((x, i) => x.kind === "event" ? (
            <p key={i} className="text-xs text-gray-500 pl-2 border-l-2 border-gray-200">{fmt(x.at)} · {x.text}</p>
          ) : (
            <div key={i} className={`rounded-xl p-3 text-sm border ${x.kind === "internal" ? "bg-yellow-50 border-yellow-300" : x.actor === "contact" ? "bg-sky-50 border-sky-200" : "bg-white"}`}>
              <p className="text-xs text-gray-500 mb-1">{fmt(x.at)} · {x.kind === "internal" ? "🔒 Nota interna" : x.actor === "contact" ? "Cliente" : "Equipo (público)"}</p>
              <p className="whitespace-pre-wrap">{x.text}</p>
            </div>
          ))}
        </div>

        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await apiRequest("POST", `/api/desk/tickets/${id}/comments`, { body, visibility: vis }); setBody(""); }); }}>
          <textarea className={`${inp} w-full ${vis === "internal" ? "bg-yellow-50" : ""}`} rows={3} required value={body} onChange={(e) => setBody(e.target.value)} placeholder={vis === "internal" ? "Nota interna (el cliente no la ve)" : "Respuesta pública (se envía al cliente por correo)"} />
          <div className="flex gap-3 items-center">
            <SearchSelect className={inp} value={vis} onChange={(e) => setVis(e.target.value as any)}><option value="public">Respuesta pública</option><option value="internal">Nota interna</option></SearchSelect>
            <button className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold">Enviar</button>
            <label className="text-sm text-[#0088c2] cursor-pointer">Adjuntar archivo
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(() => upload(f, vis), "Archivo adjuntado"); e.target.value = ""; }} /></label>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <ContextPanel d={d} />
        <SlaPanel ticketId={Number(id)} isManager={isManager} version={`${d.ticket.updatedAt}-${d.events.length}`} />
        <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Estado</h3>
          <SearchSelect className={`${inp} w-full`} value={tr.to} onChange={(e) => setTr({ ...tr, to: e.target.value })}><option value="">Cambiar a…</option>{d.nextStatuses.map((s: string) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}</SearchSelect>
          {tr.to && <input className={`${inp} w-full`} placeholder="Motivo (requerido en tercero/rechazo/cancelación)" value={tr.reason} onChange={(e) => setTr({ ...tr, reason: e.target.value })} />}
          {needsRca && <div className="space-y-1 border rounded p-2 bg-gray-50"><p className="font-semibold text-xs">Causa raíz (P0/P1)</p>
            {(["cause", "fix", "prevention"] as const).map((k) => <input key={k} className={`${inp} w-full`} placeholder={{ cause: "Causa", fix: "Corrección", prevention: "Prevención" }[k]} value={tr[k]} onChange={(e) => setTr({ ...tr, [k]: e.target.value })} />)}
            <SearchSelect className={`${inp} w-full`} value={tr.kind} onChange={(e) => setTr({ ...tr, kind: e.target.value })}>{["code", "infrastructure", "third_party", "configuration", "usage"].map((k) => <option key={k}>{k}</option>)}</SearchSelect></div>}
          {tr.to && <button className="bg-gray-900 text-white px-3 py-2 rounded-lg w-full" onClick={() => run(async () => {
            await apiRequest("POST", `/api/desk/tickets/${id}/transition`, { to: tr.to, reason: tr.reason || undefined, rca: needsRca ? { cause: tr.cause, fix: tr.fix, prevention: tr.prevention, kind: tr.kind } : undefined });
            setTr({ ...tr, to: "", reason: "" });
          })}>Aplicar</button>}
        </div>

        <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Detalles</h3>
          <p>Solicitante: {d.requester ? (d.requester.name || d.requester.email) : "—"}</p>
          <p>Canal: {t.channel} · {t.environment === "prod" ? "Producción" : "Staging"}</p>
          <p>Recibido: {fmt(t.receivedAt)}</p><p>1ª respuesta: {fmt(t.firstResponseAt)}</p><p>Resuelto: {fmt(t.resolvedAt)}</p>
          <label className="block">Responsable
            <SearchSelect className={`${inp} w-full`} value={t.assigneeUserId ?? ""} onChange={(e) => patch({ assigneeUserId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sin asignar</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}</SearchSelect></label>
          <label className="block">Prioridad interna (1 alta – 5 baja)
            <input type="number" min={1} max={5} className={`${inp} w-full`} defaultValue={t.priorityInternal} onBlur={(e) => Number(e.target.value) !== t.priorityInternal && patch({ priorityInternal: Number(e.target.value) })} /></label>
          <label className="flex gap-2"><input type="checkbox" checked={t.sharedWithAccount} onChange={(e) => patch({ sharedWithAccount: e.target.checked })} />Compartido con la cuenta (portal)</label>
          {isManager && <label className="flex gap-2"><input type="checkbox" checked={t.slaApplicable} onChange={(e) => patch({ slaApplicable: e.target.checked })} />Aplica SLA</label>}
          {t.type === "incident" && <div className="border-t pt-2 space-y-1">
            <p className="font-semibold">Severidad</p>
            <SearchSelect className={`${inp} w-full`} value={sev.value || t.severity || ""} onChange={(e) => setSev({ ...sev, value: e.target.value })}><option value="">Sin definir</option>{["P0", "P1", "P2", "P3"].map((s) => <option key={s}>{s}</option>)}</SearchSelect>
            {sev.value === "P0" && <div className="text-xs space-y-1">
              {([["inaccessible", "Producto inaccesible"], ["criticalBlocked", "Proceso crítico bloqueado"], ["hasWorkaround", "Existe workaround"]] as const).map(([k, l]) => (
                <label key={k} className="flex gap-1"><input type="checkbox" checked={(sev as any)[k]} onChange={(e) => setSev({ ...sev, [k]: e.target.checked })} />{l}</label>))}</div>}
            {sev.value && sev.value !== t.severity && <button className="bg-gray-900 text-white px-3 py-1 rounded text-xs" onClick={() => run(async () => {
              await apiRequest("PATCH", `/api/desk/tickets/${id}`, { severity: sev.value || null, p0: sev.value === "P0" ? { inaccessible: sev.inaccessible, criticalBlocked: sev.criticalBlocked, hasWorkaround: sev.hasWorkaround, users: sev.users } : null });
              setSev({ ...sev, value: "" });
            })}>Guardar severidad</button>}
          </div>}
        </div>

        <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
          <h3 className="font-semibold">Horas · total {(d.totalMinutes / 60).toFixed(2)} h</h3>
          {d.time.map((e: any) => <p key={e.id} className="text-xs text-gray-600">{e.workDate} · {e.minutes} min {e.billable ? "" : "(no facturable)"} {e.note}</p>)}
          <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); run(async () => { await apiRequest("POST", `/api/desk/tickets/${id}/time`, { minutes: Number(time.minutes), billable: time.billable, workDate: new Date().toISOString().slice(0, 10), note: time.note }); setTime({ ...time, note: "" }); }); }}>
            <input type="number" min={1} className={`${inp} w-20`} value={time.minutes} onChange={(e) => setTime({ ...time, minutes: e.target.value })} />
            <input className={`${inp} flex-1`} placeholder="Nota" value={time.note} onChange={(e) => setTime({ ...time, note: e.target.value })} />
            <label className="flex gap-1 items-center text-xs"><input type="checkbox" checked={time.billable} onChange={(e) => setTime({ ...time, billable: e.target.checked })} />Facturable</label>
            <button className="border rounded-lg px-3 py-2">Registrar</button>
          </form>
        </div>

        <AttachmentsCard d={d} />
      </div>
    </div>
  );
}
