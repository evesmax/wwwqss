import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";
import { copyText } from "./clipboard";

const inp = "border rounded-lg px-3 py-2 text-sm";
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

// Mirrors server/serviceDesk/agentPermissions.ts (the server is the one that enforces them).
export const PERMISSIONS: { id: string; label: string; help: string; sensitive: boolean }[] = [
  { id: "release", label: "release", sensitive: true, help: "Puede marcar un ticket como resuelto y enviar al cliente los pasos de prueba." },
  { id: "transition_terminal", label: "transition_terminal", sensitive: true, help: "Puede cerrar, rechazar o cancelar tickets (y marcarlos como duplicados)." },
  { id: "create_ticket", label: "create_ticket", sensitive: false, help: "Puede crear tickets (solo en PLATAFORMAQSS, origen transversal o negocio, con tope por hora)." },
];
const SENSITIVE = PERMISSIONS.filter((p) => p.sensitive).map((p) => p.id);

type AgentKey = { id: number; keyId: string; name: string; productIds: number[]; allProducts: boolean; permissions: string[]; active: boolean; lastUsedAt: string | null };
type Draft = { name: string; allProducts: boolean; productIds: number[]; permissions: string[]; active: boolean };
type Shown = { name: string; token: string };

const toDraft = (k?: AgentKey): Draft => k
  ? { name: k.name, allProducts: k.allProducts, productIds: [...(k.productIds ?? [])], permissions: [...(k.permissions ?? [])], active: k.active }
  : { name: "", allProducts: false, productIds: [], permissions: [], active: true };

/** Sensitive permissions this save would grant (new key: all selected ones; existing key: only the newly added). */
export const addedSensitive = (before: string[], after: string[]) => SENSITIVE.filter((p) => after.includes(p) && !before.includes(p));

export default function AgentKeysPage() {
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    apiRequest("GET", "/api/desk/me").then((r) => r.json()).then((m) => live && setOwner(Array.isArray(m.roles) && m.roles.includes("owner"))).catch(() => live && setOwner(false));
    return () => { live = false; };
  }, []);
  if (owner === null) return <div className="p-6 text-sm text-gray-500">Cargando…</div>;
  if (!owner) return <div className="p-6 text-sm text-gray-600" role="alert">Solo el Owner puede administrar las llaves de agente.</div>;
  return <Keys />;
}

function Keys() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [editing, setEditing] = useState<{ key: AgentKey | null } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [rotating, setRotating] = useState<AgentKey | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => apiRequest("GET", "/api/desk/agent-keys").then((r) => r.json()).then(setKeys).catch(() => setMsg("No se pudieron cargar las llaves (requiere rol Owner y MFA).")), []);
  useEffect(() => { load(); apiRequest("GET", "/api/desk/products").then((r) => r.json()).then(setProducts).catch(() => {}); }, [load]);
  const pname = (id: number) => products.find((p) => p.id === id)?.code ?? products.find((p) => p.id === id)?.name ?? `#${id}`;

  const body = (d: Draft) => ({ name: d.name.trim(), productIds: d.productIds, allProducts: d.allProducts, permissions: d.permissions });
  const save = async (k: AgentKey | null, d: Draft) => {
    if (k) await apiRequest("PUT", `/api/desk/agent-keys/${k.id}`, { ...body(d), active: d.active });
    else { const r = await (await apiRequest("POST", "/api/desk/agent-keys", body(d))).json(); setShown({ name: r.name, token: r.token }); }
    setEditing(null); setMsg(""); load();
  };
  const toggle = async (k: AgentKey) => {
    try { await apiRequest("PUT", `/api/desk/agent-keys/${k.id}`, { ...body(toDraft(k)), active: !k.active }); load(); }
    catch (e) { setMsg(errMsg(e, "No se pudo cambiar el estado de la llave.")); }
  };
  const rotate = async (k: AgentKey) => {
    try { const r = await (await apiRequest("POST", `/api/desk/agent-keys/${k.id}/rotate`)).json(); setShown({ name: r.name, token: r.token }); setRotating(null); load(); }
    catch (e) { setRotating(null); setMsg(errMsg(e, "No se pudo rotar la llave.")); }
  };

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Llaves de agente</h1>
        <button onClick={() => setEditing({ key: null })} className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold">Nueva llave</button>
      </div>
      <p className="text-sm text-gray-600">Cada llave le da a un agente (Claude Code, Jarvis…) acceso a los tickets de sus productos por MCP. Los permisos los impone el servidor: una llave sin <b>release</b> no puede liberar tickets y sin <b>transition_terminal</b> no puede cerrarlos.</p>
      {msg && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded-lg">{msg}</div>}
      {shown && <SecretBox shown={shown} onDone={() => setShown(null)} />}

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="px-3 py-2 font-medium">Nombre</th><th className="px-3 py-2 font-medium">ID</th><th className="px-3 py-2 font-medium">Productos</th>
            <th className="px-3 py-2 font-medium">Permisos</th><th className="px-3 py-2 font-medium">Activa</th><th className="px-3 py-2 font-medium">Último uso</th><th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className={`border-t ${k.active ? "" : "opacity-60"}`}>
                <td className="px-3 py-2 font-medium text-gray-900">{k.name}</td>
                <td className="px-3 font-mono text-xs">{k.keyId}</td>
                <td className="px-3 text-xs">{k.allProducts ? <b>Todos</b> : k.productIds?.length ? k.productIds.map(pname).join(", ") : <span className="text-gray-400">Ninguno</span>}</td>
                <td className="px-3 text-xs">{k.permissions?.length ? k.permissions.map((p) => <span key={p} className={`inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded ${SENSITIVE.includes(p) ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{p}</span>) : <span className="text-gray-400">Solo lectura</span>}</td>
                <td className="px-3">{k.active ? <span className="text-green-700">Sí</span> : <span className="text-gray-500">No</span>}</td>
                <td className="px-3 text-gray-600 whitespace-nowrap">{k.lastUsedAt ? fmt(k.lastUsedAt) : "nunca"}</td>
                <td className="px-3 text-right whitespace-nowrap space-x-3">
                  <button className="text-[#0088c2]" onClick={() => setEditing({ key: k })} aria-label={`Editar ${k.name}`}>Editar</button>
                  <button className="text-[#0088c2]" onClick={() => setRotating(k)} aria-label={`Rotar ${k.name}`}>Rotar</button>
                  <button className="text-gray-600" onClick={() => toggle(k)} aria-label={`${k.active ? "Desactivar" : "Activar"} ${k.name}`}>{k.active ? "Desactivar" : "Activar"}</button>
                </td>
              </tr>
            ))}
            {!keys.length && <tr><td colSpan={7} className="p-6 text-center text-gray-400">Aún no hay llaves.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <KeyDialog k={editing.key} products={products} onClose={() => setEditing(null)} onSave={save} />}
      {rotating && (
        <Modal title={`Rotar la llave de "${rotating.name}"`} onClose={() => setRotating(null)}>
          <p className="text-sm text-gray-700">La llave actual dejará de funcionar de inmediato y se generará una nueva. Tendrás que actualizarla en el agente.</p>
          <div className="flex justify-end gap-2 pt-2"><button className="px-3 py-2 text-sm" onClick={() => setRotating(null)}>Cancelar</button>
            <button className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold" onClick={() => rotate(rotating)}>Rotar llave</button></div>
        </Modal>
      )}
    </div>
  );
}

function SecretBox({ shown, onDone }: { shown: Shown; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg text-sm space-y-2" role="status">
      <p className="font-semibold">Llave de «{shown.name}»: guárdala ahora, no se volverá a mostrar.</p>
      <code className="block break-all bg-white border rounded p-2 text-xs" data-testid="agent-token">{shown.token}</code>
      <div className="flex gap-3">
        <button className="border rounded px-3 py-1" onClick={async () => { if (await copyText(shown.token)) setCopied(true); }}>{copied ? "✓ Copiada" : "Copiar"}</button>
        <button className="text-[#0088c2]" onClick={onDone}>Ya la guardé</button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div role="dialog" aria-label={title} className="bg-white rounded-xl p-5 w-full max-w-xl space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{title}</h2>{children}
      </div>
    </div>
  );
}

function KeyDialog({ k, products, onClose, onSave }: { k: AgentKey | null; products: any[]; onClose: () => void; onSave: (k: AgentKey | null, d: Draft) => Promise<void> }) {
  const [d, setD] = useState<Draft>(() => toDraft(k ?? undefined));
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const valid = d.name.trim().length >= 2;

  const commit = async () => {
    setBusy(true); setErr("");
    try { await onSave(k, d); } catch (e) { setConfirming(null); setErr(errMsg(e, "No se pudo guardar la llave.")); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const added = addedSensitive(k?.permissions ?? [], d.permissions);
    if (added.length) setConfirming(added); else commit();
  };

  if (confirming) return (
    <Modal title="Confirmar permisos sensibles" onClose={() => setConfirming(null)}>
      <p className="text-sm text-gray-700">Vas a darle a «{d.name.trim()}» {confirming.length > 1 ? "estos permisos" : "este permiso"}:</p>
      <ul className="text-sm list-disc pl-5 space-y-1">{confirming.map((id) => <li key={id}><b>{id}</b>: {PERMISSIONS.find((p) => p.id === id)?.help}</li>)}</ul>
      {err && <div role="alert" className="bg-red-50 text-red-600 text-sm p-2 rounded border border-red-200">{err}</div>}
      <div className="flex justify-end gap-2 pt-2"><button className="px-3 py-2 text-sm" onClick={() => setConfirming(null)}>Volver</button>
        <button disabled={busy} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" onClick={commit}>Sí, guardar</button></div>
    </Modal>
  );

  return (
    <Modal title={k ? `Editar «${k.name}»` : "Nueva llave de agente"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">Nombre
          <input className={`${inp} w-full mt-1`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Claude Code (Everardo)" maxLength={100} /></label>

        <fieldset className="text-sm space-y-1"><legend className="font-medium mb-1">Productos</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.allProducts} onChange={(e) => setD({ ...d, allProducts: e.target.checked })} />Todos los productos (incluye los que se creen después)</label>
          {!d.allProducts && <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
            {products.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={d.productIds.includes(p.id)} onChange={() => setD({ ...d, productIds: flip(d.productIds, p.id) })} />{p.code ?? p.name}</label>)}
            {!products.length && <span className="text-gray-400 col-span-2">Sin productos</span>}
          </div>}
        </fieldset>

        <fieldset className="text-sm space-y-2"><legend className="font-medium mb-1">Permisos <span className="font-normal text-gray-500">(sin ninguno la llave solo lee y comenta)</span></legend>
          {PERMISSIONS.map((p) => (
            <label key={p.id} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={d.permissions.includes(p.id)} onChange={() => setD({ ...d, permissions: flip(d.permissions, p.id) })} />
              <span><b className="font-mono">{p.label}</b>{p.sensitive && <span className="ml-1 text-[11px] text-amber-700">requiere confirmación</span>}<span className="block text-gray-600">{p.help}</span></span></label>
          ))}
        </fieldset>

        {k && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />Llave activa</label>}
        {err && <div role="alert" className="bg-red-50 text-red-600 text-sm p-2 rounded border border-red-200">{err}</div>}
        <div className="flex justify-end gap-2"><button type="button" className="px-3 py-2 text-sm" onClick={onClose}>Cancelar</button>
          <button disabled={!valid || busy} className="bg-[#00aeef] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{k ? "Guardar" : "Crear llave"}</button></div>
      </form>
    </Modal>
  );
}
