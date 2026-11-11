import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

const inp = "border rounded-lg px-2 py-1 text-xs";
const btn = "px-2 py-1 rounded-lg text-xs";
const DOC_ST = ["pendiente", "parcial", "recibido", "validado", "rechazado"];
const MOD_ST: Record<string, string> = { planned: "Planeado", in_dev: "En desarrollo", uat: "En UAT", released: "Liberado" };
const LVL: Record<string, string> = { low: "bg-green-100 text-green-800", medium: "bg-amber-100 text-amber-800", high: "bg-red-100 text-red-800" };
const PAY_ST: Record<string, string> = { pending: "Pendiente", invoiced: "Facturado", paid: "Pagado" };
const TABS = ["Documentos", "Decisiones", "Riesgos", "Módulos", "Cambios", "Cortes", "Pagos", "Carga"] as const;
const CH_ST: Record<string, string> = { draft: "Borrador", proposed: "Propuesto al cliente", approved: "Aprobado", rejected: "Rechazado", applied: "Aplicado al plan" };
const CUT_ST: Record<string, string> = { draft: "Borrador", approved: "Aprobado", sent: "Enviado" };

// Internal view of the project objects (DOC-xx, P-xx, R-xx, MOD-xx, payments, resource load). `run` shows messages and reloads the project.
export default function ProjectItems({ d, run }: { d: any; run: (fn: () => Promise<any>, ok: string) => Promise<void> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Documentos");
  const pid = d.project.id;
  const post = (path: string, body: any, ok: string) => run(() => apiRequest("POST", `/api/desk/projects/${pid}/${path}`, body), ok);
  const patch = (path: string, body: any, ok = "Actualizado.") => run(() => apiRequest("PATCH", `/api/desk/projects/${pid}/${path}`, body), ok);
  const [f, setF] = useState<any>({});
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const [load, setLoad] = useState<any>(null);
  const [cuts, setCuts] = useState<any[]>([]);
  const [preview, setPreview] = useState<string>("");
  const loadCuts = () => apiRequest("GET", `/api/desk/projects/${pid}/cuts`).then((r) => r.json()).then(setCuts).catch(() => setCuts([]));
  useEffect(() => { if (tab === "Cortes") void loadCuts(); }, [tab, pid, d]);
  useEffect(() => { if (tab === "Carga") apiRequest("GET", `/api/desk/projects/${pid}/load`).then((r) => r.json()).then(setLoad).catch(() => setLoad(null)); }, [tab, pid, d]);
  const clear = () => setF({});
  return (
    <div className="bg-white border rounded-xl p-4 text-sm space-y-3">
      <div className="flex flex-wrap gap-1">{TABS.map((t) => <button key={t} onClick={() => { setTab(t); clear(); }} className={`${btn} ${tab === t ? "bg-[#00aeef] text-white" : "border"}`}>{t}</button>)}</div>

      {tab === "Documentos" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Solicitudes al cliente. Un documento vencido marca como «bloqueadas por el cliente» las tareas que lo necesitan.</p>
        <div className="flex flex-wrap gap-2 items-end"><input className={`${inp} w-56`} placeholder="Nombre del documento" value={f.name ?? ""} onChange={set("name")} />
          <select className={inp} value={f.priority ?? "A"} onChange={set("priority")}><option>A</option><option>B</option></select>
          <input className={inp} type="date" value={f.dueDate ?? ""} onChange={set("dueDate")} />
          <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => post("docs", { name: f.name, priority: f.priority ?? "A", dueDate: f.dueDate }, "Documento solicitado.").then(clear)}>Solicitar</button></div>
        <table className="w-full text-xs"><thead className="text-left bg-gray-50"><tr><th className="p-1">Código</th><th>Documento</th><th>Prior.</th><th>Fecha compromiso</th><th>Estado</th><th>Visible</th></tr></thead><tbody>
          {d.docs.map((x: any) => <tr key={x.id} className="border-t"><td className="p-1">{x.code}</td><td>{x.name}{x.files.length > 0 && <span className="text-gray-500"> · {x.files.length} archivo(s)</span>}</td><td>{x.priority}</td>
            <td className={x.overdue ? "text-red-700 font-semibold" : ""}>{x.dueDate}{x.overdue && " (vencido)"}</td>
            <td><select className={inp} value={x.status} onChange={(e) => patch(`docs/${x.id}`, { status: e.target.value, ...(e.target.value === "rechazado" ? { comment: prompt("Motivo del rechazo") || "" } : {}) })}>{DOC_ST.map((s) => <option key={s}>{s}</option>)}</select></td>
            <td><input type="checkbox" checked={x.clientVisible} onChange={(e) => patch(`docs/${x.id}`, { clientVisible: e.target.checked })} /></td></tr>)}</tbody></table>
        {d.docs.length === 0 && <p className="text-xs text-gray-500">Sin solicitudes.</p>}</div>}

      {tab === "Decisiones" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Bitácora de decisiones con valor por defecto y fecha límite. Al vencer se notifica; aceptar el valor por defecto queda registrado.</p>
        <div className="flex flex-wrap gap-2 items-end"><input className={`${inp} w-64`} placeholder="Pregunta a decidir" value={f.question ?? ""} onChange={set("question")} />
          <input className={`${inp} w-40`} placeholder="Decisión por defecto" value={f.def ?? ""} onChange={set("def")} /><input className={inp} type="date" value={f.deadline ?? ""} onChange={set("deadline")} />
          <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => post("decisions", { question: f.question, defaultDecision: f.def, deadline: f.deadline }, "Decisión registrada.").then(clear)}>Agregar</button></div>
        {d.decisions.map((x: any) => <div key={x.id} className="border rounded-lg p-2 text-xs"><b>{x.code}</b> {x.question} · límite {x.deadline} ·{" "}
          {x.state === "decided" ? <span className="text-green-700">{x.status === "defaulted" ? "Aceptado por defecto" : "Decidido"}: {x.decision}</span> : x.state === "expired" ? <span className="text-red-700">Vencida (por defecto: {x.defaultDecision})</span> : <span>Abierta (por defecto: {x.defaultDecision})</span>}
          {x.state !== "decided" && <span className="ml-2 space-x-1"><button className={`${btn} border`} onClick={() => { const v = prompt("Decisión del cliente"); const ev = v ? prompt("Evidencia: ¿quién la comunicó y por qué medio? (queda auditado como decisión en nombre del cliente)") : null; if (v && ev) run(() => apiRequest("POST", `/api/desk/projects/${pid}/decisions/${x.id}/decide`, { decision: v, evidence: ev }), "Decisión registrada en nombre del cliente."); }}>Registrar decisión del cliente</button>
            {x.state === "expired" && <button className={`${btn} border`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${pid}/decisions/${x.id}/accept-default`), "Valor por defecto aceptado y registrado.")}>Aceptar por defecto</button>}</span>}</div>)}
        {d.decisions.length === 0 && <p className="text-xs text-gray-500">Sin decisiones.</p>}</div>}

      {tab === "Riesgos" && <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-end"><input className={`${inp} w-56`} placeholder="Riesgo" value={f.title ?? ""} onChange={set("title")} />
          <label className="text-xs">Prob. <select className={inp} value={f.p ?? "2"} onChange={set("p")}><option>1</option><option>2</option><option>3</option></select></label>
          <label className="text-xs">Impacto <select className={inp} value={f.i ?? "2"} onChange={set("i")}><option>1</option><option>2</option><option>3</option></select></label>
          <input className={`${inp} w-56`} placeholder="Mitigación" value={f.mit ?? ""} onChange={set("mit")} />
          <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => post("risks", { title: f.title, probability: Number(f.p ?? 2), impact: Number(f.i ?? 2), mitigation: f.mit ?? "" }, "Riesgo registrado.").then(clear)}>Agregar</button></div>
        {d.risks.map((x: any) => <div key={x.id} className="border rounded-lg p-2 text-xs flex flex-wrap gap-2 items-center"><b>{x.code}</b><span className={`px-1.5 py-0.5 rounded ${LVL[x.level]}`}>{x.level === "high" ? "Alto" : x.level === "medium" ? "Medio" : "Bajo"}</span>{x.title}
          <select className={inp} value={x.status} onChange={(e) => patch(`risks/${x.id}`, { status: e.target.value })}><option value="open">Abierto</option><option value="mitigated">Mitigado</option><option value="occurred">Ocurrió</option><option value="closed">Cerrado</option></select>
          <label><input type="checkbox" checked={x.shared} onChange={(e) => patch(`risks/${x.id}`, { shared: e.target.checked })} /> compartido con el cliente</label></div>)}
        {d.risks.length === 0 && <p className="text-xs text-gray-500">Sin riesgos.</p>}</div>}

      {tab === "Módulos" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Catálogo de módulos del contrato: alimenta el campo «módulo» de los tickets y «Módulos entregados» del informe mensual.</p>
        <div className="flex gap-2"><input className={`${inp} w-56`} placeholder="Nombre del módulo" value={f.name ?? ""} onChange={set("name")} /><button className={`${btn} bg-[#00aeef] text-white`} onClick={() => post("modules", { name: f.name }, "Módulo agregado.").then(clear)}>Agregar</button></div>
        {d.modules.map((x: any) => <div key={x.id} className="border rounded-lg p-2 text-xs flex gap-2 items-center"><b>{x.code}</b>{x.name}
          <select className={inp} value={x.status} onChange={(e) => patch(`modules/${x.id}`, { status: e.target.value })}>{Object.entries(MOD_ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>)}
        {d.modules.length === 0 && <p className="text-xs text-gray-500">Sin módulos.</p>}</div>}

      {tab === "Cambios" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Control de cambios: una nueva función en un proyecto con plan aprobado se vuelve una solicitud de cambio. Solo lo que el cliente aprueba mueve el plan (como revisión de la línea base).</p>
        <div className="flex flex-wrap gap-2 items-end"><input className={`${inp} w-56`} placeholder="Título del cambio" value={f.title ?? ""} onChange={set("title")} />
          <input className={`${inp} w-20`} type="number" placeholder="Horas" value={f.hours ?? ""} onChange={set("hours")} /><input className={`${inp} w-24`} type="number" placeholder="Costo" value={f.cost ?? ""} onChange={set("cost")} /><input className={`${inp} w-20`} type="number" placeholder="Días háb." value={f.days ?? ""} onChange={set("days")} />
          <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => post("changes", { title: f.title, hoursImpact: Number(f.hours || 0), costImpact: Number(f.cost || 0), daysImpact: Number(f.days || 0), taskSpec: { name: f.title } }, "Solicitud de cambio creada.").then(clear)}>Agregar</button></div>
        {(d.changes ?? []).map((x: any) => <div key={x.id} className="border rounded-lg p-2 text-xs flex flex-wrap gap-2 items-center"><b>{x.code}</b>{x.title} · {x.hoursImpact} h · {Number(x.costImpact).toLocaleString("es-MX")} {x.currency} · {x.daysImpact} día(s) · <i>{CH_ST[x.status]}</i>{x.decisionNote && <span className="text-gray-500">«{x.decisionNote}»</span>}
          {x.status === "draft" && <button className={`${btn} border`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${pid}/changes/${x.id}/propose`), "Propuesta enviada al cliente.")}>Proponer al cliente</button>}
          {x.status === "approved" && <button className={`${btn} border`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${pid}/changes/${x.id}/apply`), "Cambio aplicado como revisión de la línea base.")}>Aplicar al plan</button>}</div>)}
        {(d.changes ?? []).length === 0 && <p className="text-xs text-gray-500">Sin solicitudes de cambio.</p>}</div>}

      {tab === "Cortes" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Cortes de estatus: instantánea inmutable (borrador → aprobado → enviado). Lo que ve el cliente excluye horas, notas y riesgos internos. Se genera un borrador semanal automático.</p>
        <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${pid}/cuts`), "Borrador de corte generado.").then(loadCuts)}>Generar corte de hoy</button>
        {cuts.map((c) => <div key={c.id} className="border rounded-lg p-2 text-xs flex flex-wrap gap-2 items-center"><b>{c.cutDate}</b> · {CUT_ST[c.status]} · real {c.progress?.actual}% / plan {c.progress?.planned}%
          <button className={`${btn} border`} onClick={async () => setPreview((await (await apiRequest("GET", `/api/desk/projects/${pid}/cuts/${c.id}`)).json()).html)}>Ver</button>
          {c.status === "draft" && <button className={`${btn} border`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${pid}/cuts/${c.id}/approve`), "Corte aprobado (ya no se modifica).").then(loadCuts)}>Aprobar</button>}
          {c.status !== "draft" && <button className={`${btn} border`} onClick={() => run(() => apiRequest("POST", `/api/desk/projects/${pid}/cuts/${c.id}/send`), "Corte enviado a los administradores de la cuenta.").then(loadCuts)}>{c.status === "sent" ? "Reenviar" : "Enviar por correo"}</button>}</div>)}
        {cuts.length === 0 && <p className="text-xs text-gray-500">Sin cortes.</p>}
        {preview && <div className="border rounded-lg"><div className="flex justify-between p-1 bg-gray-50 text-xs"><span>Vista previa</span><button onClick={() => setPreview("")}>Cerrar</button></div><iframe title="Corte" sandbox="" srcDoc={preview} className="w-full h-96" /></div>}</div>}

      {tab === "Pagos" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Solo lectura de referencia: la facturación y la cobranza viven en QFactura Hub. Por defecto el cliente no ve esta sección ni la comparación pago/gate.</p>
        <div className="flex flex-wrap gap-2 items-end"><input className={`${inp} w-40`} placeholder="Concepto" value={f.name ?? ""} onChange={set("name")} /><input className={`${inp} w-24`} type="number" placeholder="Monto" value={f.amount ?? ""} onChange={set("amount")} />
          <input className={inp} type="date" value={f.dueDate ?? ""} onChange={set("dueDate")} />
          <select className={inp} value={f.gateId ?? ""} onChange={set("gateId")}><option value="">Sin gate</option>{d.gates.map((g: any) => <option key={g.id} value={g.id}>{g.code}</option>)}</select>
          <button className={`${btn} bg-[#00aeef] text-white`} onClick={() => post("payments", { name: f.name, amount: Number(f.amount), dueDate: f.dueDate, gateId: f.gateId ? Number(f.gateId) : null }, "Pago agregado.").then(clear)}>Agregar</button></div>
        {d.payments.map((x: any) => <div key={x.id} className="border rounded-lg p-2 text-xs flex flex-wrap gap-2 items-center">{x.name} · {Number(x.amount).toLocaleString("es-MX")} {x.currency} · {x.dueDate}
          <select className={inp} value={x.status} onChange={(e) => patch(`payments/${x.id}`, { status: e.target.value })}>{Object.entries(PAY_ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label><input type="checkbox" checked={x.clientVisible} onChange={(e) => patch(`payments/${x.id}`, { clientVisible: e.target.checked })} /> visible al cliente</label></div>)}
        {d.payments.length === 0 && <p className="text-xs text-gray-500">Sin plan de pagos.</p>}</div>}

      {tab === "Carga" && <div className="space-y-2">
        <p className="text-xs text-gray-500">Horas planeadas por persona y semana frente a la capacidad semanal{load ? ` (${load.capacity} h)` : ""}. Solo uso interno.</p>
        {!load ? <p className="text-xs text-gray-500">Cargando…</p> : load.rows.length === 0 ? <p className="text-xs text-gray-500">Sin horas asignadas: captura responsable y esfuerzo en las tareas.</p> :
          <table className="w-full text-xs"><thead className="text-left bg-gray-50"><tr><th className="p-1">Persona</th><th>Semana (lunes)</th><th>Horas</th><th>Capacidad</th></tr></thead><tbody>
            {load.rows.map((r: any, i: number) => <tr key={i} className={`border-t ${r.over ? "bg-red-50" : ""}`}><td className="p-1">{r.name}</td><td>{r.week}</td><td className={r.over ? "text-red-700 font-semibold" : ""}>{r.hours}{r.over && " ⚠ sobreasignado"}</td><td>{r.capacity}</td></tr>)}</tbody></table>}</div>}
    </div>
  );
}
