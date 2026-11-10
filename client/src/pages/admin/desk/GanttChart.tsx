// Weekly Gantt (RF-PRJ-12): baseline vs current, today line, gates as milestones, client tasks highlighted, holidays shaded.
const DAY = 86400000;
const ms = (d: string) => Date.parse(d + "T00:00:00Z");
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);

export type GTask = { id: number; code: string; name: string; start: string; end: string; pct: number; clientSide?: boolean; owner?: string; blockedByClient: boolean; baseline: { start: string; end: string } | null; phaseId: number | null };
export type GGate = { id: number; code: string; name: string; date: string; status: string };

export default function GanttChart({ tasks, gates, holidays, today }: { tasks: GTask[]; gates: GGate[]; holidays: string[]; today: string }) {
  if (!tasks.length) return <p className="text-sm text-gray-500">Sin tareas.</p>;
  const all = [...tasks.flatMap((t) => [t.start, t.end, t.baseline?.start, t.baseline?.end]), ...gates.map((g) => g.date), today].filter(Boolean) as string[];
  const min = ms(all.reduce((a, b) => (a < b ? a : b))) - 3 * DAY, max = ms(all.reduce((a, b) => (a > b ? a : b))) + 3 * DAY;
  const total = Math.max(DAY, max - min), pctX = (d: string) => ((ms(d) - min) / total) * 100;
  const weeks: number[] = []; for (let t = min; t <= max; t += 7 * DAY) weeks.push(t);
  const width = Math.max(900, Math.round(total / DAY) * 14);
  return (
    <div className="overflow-x-auto border rounded-xl bg-white">
      <div style={{ minWidth: width + 260 }} className="text-xs">
        <div className="flex border-b bg-gray-50 sticky top-0"><div className="w-[260px] shrink-0 p-2 font-semibold">Actividad</div>
          <div className="relative flex-1 h-8">{weeks.map((w) => <span key={w} className="absolute top-2 text-[10px] text-gray-500" style={{ left: `${((w - min) / total) * 100}%` }}>{iso(w).slice(5)}</span>)}</div></div>
        {tasks.map((t) => (
          <div key={t.id} className="flex border-b last:border-0 items-center hover:bg-gray-50">
            <div className="w-[260px] shrink-0 p-2 truncate" title={t.name}><span className="text-gray-400">{t.code}</span> {t.name} {t.blockedByClient && <span className="text-red-600" title="Bloqueada por el cliente">⛔</span>}</div>
            <div className="relative flex-1 h-8">
              {holidays.map((h) => <div key={h} className="absolute top-0 bottom-0 bg-gray-100" style={{ left: `${pctX(h)}%`, width: `${(DAY / total) * 100}%` }} />)}
              {t.baseline && <div className="absolute top-1 h-1.5 bg-gray-300 rounded" title={`Línea base ${t.baseline.start} → ${t.baseline.end}`} style={{ left: `${pctX(t.baseline.start)}%`, width: `${Math.max(0.4, pctX(t.baseline.end) - pctX(t.baseline.start) + (DAY / total) * 100)}%` }} />}
              <div className={`absolute top-3 h-4 rounded ${t.clientSide || t.owner === "cliente" ? "bg-amber-300" : "bg-[#00aeef]/40"}`} title={`${t.start} → ${t.end} · ${t.pct}%`}
                style={{ left: `${pctX(t.start)}%`, width: `${Math.max(0.6, pctX(t.end) - pctX(t.start) + (DAY / total) * 100)}%` }}>
                <div className={`h-full rounded ${t.clientSide || t.owner === "cliente" ? "bg-amber-600" : "bg-[#0088c2]"}`} style={{ width: `${t.pct}%` }} /></div>
            </div>
          </div>))}
        {gates.map((g) => (
          <div key={g.id} className="flex border-b last:border-0 items-center bg-purple-50/40">
            <div className="w-[260px] shrink-0 p-2 truncate"><b>◆ {g.code}</b> {g.name}</div>
            <div className="relative flex-1 h-8"><span className={`absolute top-1.5 text-base ${g.status === "signed" ? "text-green-600" : ms(g.date) < ms(today) ? "text-red-600" : "text-purple-700"}`} title={`${g.date} · ${g.status === "signed" ? "firmado" : "abierto"}`} style={{ left: `calc(${pctX(g.date)}% - 6px)` }}>◆</span></div>
          </div>))}
        <div className="flex"><div className="w-[260px] shrink-0" /><div className="relative flex-1 h-0"><div className="absolute -top-[100%]" /></div></div>
      </div>
      <div className="px-3 py-2 text-[11px] text-gray-500 flex gap-4 flex-wrap border-t"><span>▬ Plan vigente</span><span className="text-gray-400">▬ Línea base</span><span className="text-amber-700">▬ Tarea del cliente</span><span>◆ Gate (verde firmado, rojo vencido)</span><span>▒ Feriado</span><span>Hoy: {today}</span></div>
    </div>
  );
}
