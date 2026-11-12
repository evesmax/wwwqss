import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { errMessage } from "./ticketUi";
import { SearchSelect } from "@/components/ui/search-select";

type Row = Record<string, any>;
const TABS = ["Cuentas", "Productos", "Instancias", "Contratos", "Contactos", "Asignaciones"] as const;
const ACCOUNT_TYPES = [["suscripcion", "Suscripción"], ["proyecto", "Proyecto"], ["bolsa_horas", "Bolsa de horas"], ["demo", "Demo"], ["interno", "Interno"]];
const ROLES = [["owner", "Owner"], ["support_manager", "Gerente de soporte"], ["agent_l2", "Agente L2"], ["agent_l1", "Agente L1"], ["finance", "Finanzas"], ["readonly", "Solo lectura"]];
const CONTACT_ROLES = [["account_admin", "Admin de cuenta"], ["contact", "Contacto"], ["reporter", "Reportante"]];

const inp = "border rounded-lg px-3 py-2 text-sm";
const btn = "px-3 py-2 bg-[#00aeef] text-white rounded-lg text-sm font-semibold disabled:opacity-50";
const ghost = "px-3 py-2 border rounded-lg text-sm";

async function get(url: string): Promise<Row[]> { return (await apiRequest("GET", url)).json(); }
const yesNo = (v: any) => (v === false ? "No" : "Sí");
const label = (list: string[][], v: any) => list.find((x) => x[0] === v)?.[1] ?? String(v ?? "");

type Col = [key: string, header: string, render?: (r: Row) => React.ReactNode];
function Table({ cols, rows, onEdit, onDelete, editingId }: { cols: Col[]; rows: Row[]; onEdit: (r: Row) => void; onDelete: (r: Row) => Promise<void>; editingId?: number | null }) {
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<number | null>(null);
  const shown = q.trim() ? rows.filter((r) => JSON.stringify(Object.values(r)).toLowerCase().includes(q.trim().toLowerCase())) : rows;
  return (
    <div className="space-y-2">
      {rows.length > 5 && <input className={`${inp} w-full max-w-xs`} placeholder="Buscar en la tabla…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="overflow-x-auto bg-white rounded-xl border">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">{cols.map(([, h]) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}<th className="px-3 py-2" /></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id ?? i} className={`border-b last:border-0 ${editingId === r.id ? "bg-sky-50" : ""}`}>
                {cols.map(([k, , render]) => <td key={k} className="px-3 py-2">{render ? render(r) : String(r[k] ?? "")}</td>)}
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {confirm === r.id ? (
                    <span className="text-xs">¿Eliminar? <button className="text-red-600 font-semibold mx-1" onClick={async () => { await onDelete(r); setConfirm(null); }}>Sí, eliminar</button><button className="text-gray-600" onClick={() => setConfirm(null)}>No</button></span>
                  ) : (
                    <><button className="text-[#0088c2] mr-3" onClick={() => onEdit(r)}>Editar</button><button className="text-red-600" onClick={() => setConfirm(r.id)}>Eliminar</button></>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td className="px-3 py-4 text-gray-400" colSpan={cols.length + 1}>{rows.length ? "Sin coincidencias" : "Sin registros"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SupportCatalogPage({ user }: { user: any }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Cuentas");
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [clientes, setClientes] = useState<Row[]>([]);
  const [accountId, setAccountId] = useState<number | "">("");
  const [items, setItems] = useState<Row[]>([]);
  const [form, setForm] = useState<Row>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const loadBase = useCallback(async () => {
    try {
      const [a, p, c] = await Promise.all([get("/api/desk/accounts"), get("/api/desk/products"), get("/api/catalog/clientes")]);
      setAccounts(a); setProducts(p); setClientes(c);
      if (a.length && accountId === "") setAccountId(a[0].id);
    } catch (e: any) {
      setErr(e.message?.includes("mfa_required") ? "Activa la verificación en dos pasos (menú Seguridad) para usar Soporte." : "No se pudo cargar el catálogo de soporte.");
    }
  }, [accountId]);
  useEffect(() => { loadBase(); }, [loadBase]);

  const childPath = { Instancias: "instances", Contratos: "contracts", Contactos: "contacts" } as Record<string, string>;
  const loadItems = useCallback(async () => {
    if (!childPath[tab] || accountId === "") return setItems([]);
    setItems(await get(`/api/desk/${childPath[tab]}?accountId=${accountId}`).catch(() => []));
  }, [tab, accountId]);
  useEffect(() => { loadItems(); setForm({}); setEditing(null); setErr(""); setOk(""); }, [loadItems]);

  const productName = (id: any) => products.find((p) => p.id === id)?.name ?? String(id ?? "");
  const cancel = () => { setForm({}); setEditing(null); };

  // Create (POST) or, while editing a row, update it (PUT) in the same form.
  const save = async (collection: string, body: Row, reload: () => void) => {
    setErr(""); setOk("");
    try {
      if (editing) await apiRequest("PUT", `/api/desk/${collection}/${editing.id}`, body); else await apiRequest("POST", `/api/desk/${collection}`, body);
      setOk(editing ? "Cambios guardados." : "Agregado."); cancel(); reload();
    } catch (e: any) { setErr(errMessage(e, "Datos inválidos o duplicados.")); }
  };
  const remove = (collection: string, reload: () => void) => async (r: Row) => {
    setErr(""); setOk("");
    try { await apiRequest("DELETE", `/api/desk/${collection}/${r.id}`); if (editing?.id === r.id) cancel(); setOk("Eliminado."); reload(); }
    catch (e: any) { setErr(errMessage(e, "No se pudo eliminar.")); }
  };
  const f = (k: string) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.value });
  const check = (k: string, dflt = true) => (form[k] ?? dflt) as boolean;
  const activeBox = (k = "active") => <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={check(k)} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />Activo</label>;
  const actions = (what: string, disabled = false) => <>
    <button className={btn} disabled={disabled}>{editing ? "Guardar cambios" : `Agregar ${what}`}</button>
    {editing && <button type="button" className={ghost} onClick={cancel}>Cancelar</button>}
  </>;
  const prodSelect = <SearchSelect className={inp} value={form.productId ?? ""} onChange={f("productId")} required><option value="">Producto…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SearchSelect>;
  const editHint = editing && <p className="text-sm text-sky-700">Editando el registro seleccionado. Cambia lo necesario y guarda.</p>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Catálogo de soporte</h1>
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? "bg-[#00aeef] text-white" : "bg-white border text-gray-600"}`}>{t}</button>)}
      </div>
      {err && <div className="text-sm p-3 rounded-lg border bg-red-50 border-red-200 text-red-600">{err}</div>}
      {ok && <div className="text-sm p-3 rounded-lg border bg-green-50 border-green-200 text-green-700">{ok}</div>}

      {tab === "Cuentas" && <>
        {editHint}
        <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); save("accounts", { clienteId: Number(editing ? editing.clienteId : form.clienteId), accountType: form.accountType ?? "suscripcion", ticketPrefix: form.ticketPrefix, active: check("active") }, loadBase); }}>
          <SearchSelect className={inp} value={form.clienteId ?? ""} onChange={f("clienteId")} required disabled={!!editing}><option value="">Cliente del CRM…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombreNegocio}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={form.accountType ?? "suscripcion"} onChange={f("accountType")}>{ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SearchSelect>
          <input className={inp} placeholder="Prefijo (ej. ROT)" maxLength={6} value={form.ticketPrefix ?? ""} onChange={f("ticketPrefix")} required />
          {editing && activeBox()}
          {actions("cuenta")}
        </form>
        <Table editingId={editing?.id} rows={accounts} cols={[["codigo", "Código cliente"], ["nombre", "Cliente"], ["accountType", "Tipo", (r) => label(ACCOUNT_TYPES, r.accountType)], ["ticketPrefix", "Prefijo"], ["active", "Activa", (r) => yesNo(r.active)]]}
          onEdit={(r) => { setEditing(r); setForm({ clienteId: r.clienteId, accountType: r.accountType, ticketPrefix: r.ticketPrefix, active: r.active }); }} onDelete={remove("accounts", loadBase)} />
      </>}

      {tab === "Productos" && <>
        {editHint}
        <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); save("products", { code: form.code, name: form.name, active: check("active") }, loadBase); }}>
          <input className={inp} placeholder="Código" value={form.code ?? ""} onChange={f("code")} required />
          <input className={inp} placeholder="Nombre" value={form.name ?? ""} onChange={f("name")} required />
          {editing && activeBox()}
          {actions("producto")}
        </form>
        <Table editingId={editing?.id} rows={products} cols={[["code", "Código"], ["name", "Nombre"], ["active", "Activo", (r) => yesNo(r.active)]]}
          onEdit={(r) => { setEditing(r); setForm({ code: r.code, name: r.name, active: r.active }); }} onDelete={remove("products", loadBase)} />
      </>}

      {childPath[tab] && <>
        <SearchSelect className={inp} value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.ticketPrefix})</option>)}
        </SearchSelect>
        {editHint}
        {tab === "Instancias" && <>
          <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); save("instances", { accountId, productId: Number(form.productId), name: form.name, baseUrl: form.baseUrl ?? "", environment: form.environment ?? "prod", active: check("active") }, loadItems); }}>
            {prodSelect}
            <input className={inp} placeholder="Nombre de la instancia" value={form.name ?? ""} onChange={f("name")} required />
            <input className={inp} placeholder="URL base" value={form.baseUrl ?? ""} onChange={f("baseUrl")} />
            <SearchSelect className={inp} value={form.environment ?? "prod"} onChange={f("environment")}><option value="prod">Producción</option><option value="staging">Staging</option></SearchSelect>
            {editing && activeBox()}
            {actions("instancia", accountId === "")}
          </form>
          <Table editingId={editing?.id} rows={items} cols={[["name", "Nombre"], ["productId", "Producto", (r) => productName(r.productId)], ["environment", "Entorno"], ["baseUrl", "URL"], ["active", "Activa", (r) => yesNo(r.active)]]}
            onEdit={(r) => { setEditing(r); setForm({ productId: r.productId, name: r.name, baseUrl: r.baseUrl, environment: r.environment, active: r.active }); }} onDelete={remove("instances", loadItems)} />
        </>}
        {tab === "Contratos" && <>
          <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => {
            e.preventDefault();
            const recipients = String(form.recipients ?? "").split(/[,;\s]+/).filter(Boolean);
            // PUT replaces every field, so an edit sends the whole row back (calendar, SLA start, rates) with the changes on top.
            const keep = editing ? { slaActiveFrom: editing.slaActiveFrom, calendar: editing.calendar, extraHourRate: editing.extraHourRate, extraCurrency: editing.extraCurrency } : {};
            save("contracts", { ...keep, accountId, productId: Number(form.productId), plan: form.plan || "estandar", hoursBank: form.hoursBank || null, reportRecipients: recipients, active: check("active") }, loadItems);
          }}>
            {prodSelect}
            <input className={inp} placeholder="Plan (estandar…)" value={form.plan ?? ""} onChange={f("plan")} />
            <input className={inp} placeholder="Bolsa de horas" inputMode="decimal" value={form.hoursBank ?? ""} onChange={f("hoursBank")} />
            <input className={`${inp} w-72`} placeholder="Correos del informe mensual (separados por coma)" value={form.recipients ?? ""} onChange={f("recipients")} />
            {editing && activeBox()}
            {actions("contrato", accountId === "")}
          </form>
          <Table editingId={editing?.id} rows={items} cols={[["productId", "Producto", (r) => productName(r.productId)], ["plan", "Plan"], ["calendar", "Calendario"], ["slaActiveFrom", "SLA activo desde", (r) => (r.slaActiveFrom ? String(r.slaActiveFrom).slice(0, 10) : "—")], ["hoursBank", "Bolsa de horas", (r) => r.hoursBank ?? "—"], ["reportRecipients", "Informe a", (r) => (r.reportRecipients ?? []).join(", ") || "—"], ["active", "Activo", (r) => yesNo(r.active)]]}
            onEdit={(r) => { setEditing(r); setForm({ productId: r.productId, plan: r.plan, hoursBank: r.hoursBank ?? "", recipients: (r.reportRecipients ?? []).join(", "), active: r.active }); }} onDelete={remove("contracts", loadItems)} />
        </>}
        {tab === "Contactos" && <>
          <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); save("contacts", { accountId, email: form.email, name: form.name ?? "", role: form.role ?? "contact" }, loadItems); }}>
            <input className={inp} type="email" placeholder="Correo" value={form.email ?? ""} onChange={f("email")} required />
            <input className={inp} placeholder="Nombre" value={form.name ?? ""} onChange={f("name")} />
            <SearchSelect className={inp} value={form.role ?? "contact"} onChange={f("role")}>{CONTACT_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SearchSelect>
            {actions("contacto", accountId === "")}
          </form>
          <Table editingId={editing?.id} rows={items} cols={[["email", "Correo"], ["name", "Nombre"], ["role", "Rol", (r) => label(CONTACT_ROLES, r.role)]]}
            onEdit={(r) => { setEditing(r); setForm({ email: r.email, name: r.name, role: r.role }); }} onDelete={remove("contacts", loadItems)} />
        </>}
      </>}

      {tab === "Asignaciones" && <Assignments accounts={accounts} products={products} meId={user.id} setErr={setErr} />}
    </div>
  );
}

function Assignments({ accounts, products, meId, setErr }: { accounts: Row[]; products: Row[]; meId: number; setErr: (s: string) => void }) {
  const [users, setUsers] = useState<Row[]>([]);
  const [sel, setSel] = useState<number | "">("");
  const [list, setList] = useState<Row[]>([]);
  const [nr, setNr] = useState<Row>({ role: "agent_l2", scopeType: "global", scopeId: "" });
  const [saved, setSaved] = useState("");

  useEffect(() => { get("/api/desk/users").then(setUsers).catch(() => setErr("Solo el Owner puede ver asignaciones.")); }, [setErr]);
  useEffect(() => { setList(users.find((u) => u.id === sel)?.assignments ?? []); setSaved(""); }, [sel, users]);

  const label = (a: Row) => `${ROLES.find((r) => r[0] === a.role)?.[1]} · ${a.scopeType === "global" ? "Global"
    : a.scopeType === "account" ? `Cuenta ${accounts.find((x) => x.id === a.scopeId)?.nombre ?? a.scopeId}` : `Producto ${products.find((x) => x.id === a.scopeId)?.name ?? a.scopeId}`}`;

  const save = async () => {
    setErr(""); setSaved("");
    try {
      await apiRequest("PUT", `/api/desk/users/${sel}/assignments`, { assignments: list });
      setSaved("Guardado."); setUsers(await get("/api/desk/users"));
    } catch (e: any) { setErr(e.message?.includes("Owner a ti mismo") ? "No puedes quitarte el rol de Owner a ti mismo." : "No se pudo guardar."); }
  };

  return (
    <div className="space-y-3">
      <SearchSelect className={inp} value={sel} onChange={(e) => setSel(Number(e.target.value))}>
        <option value="">Usuario interno…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.username}{u.id === meId ? " (tú)" : ""}</option>)}
      </SearchSelect>
      {sel !== "" && <>
        <ul className="bg-white rounded-xl border divide-y">
          {list.map((a, i) => <li key={i} className="px-3 py-2 text-sm flex justify-between">{label(a)}<button className="text-red-600" onClick={() => setList(list.filter((_, j) => j !== i))}>Quitar</button></li>)}
          {!list.length && <li className="px-3 py-3 text-sm text-gray-400">Sin asignaciones: este usuario no ve nada en Soporte.</li>}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <SearchSelect className={inp} value={nr.role} onChange={(e) => setNr({ ...nr, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SearchSelect>
          <SearchSelect className={inp} value={nr.scopeType} onChange={(e) => setNr({ ...nr, scopeType: e.target.value, scopeId: "" })}><option value="global">Global</option><option value="account">Cuenta</option><option value="product">Producto</option></SearchSelect>
          {nr.scopeType !== "global" && <SearchSelect className={inp} value={nr.scopeId} onChange={(e) => setNr({ ...nr, scopeId: e.target.value })}>
            <option value="">Elegir…</option>{(nr.scopeType === "account" ? accounts.map((a) => [a.id, a.nombre]) : products.map((p) => [p.id, p.name])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </SearchSelect>}
          <button className="px-3 py-2 border rounded-lg text-sm" onClick={() => (nr.scopeType === "global" || nr.scopeId) && setList([...list, { role: nr.role, scopeType: nr.scopeType, scopeId: nr.scopeType === "global" ? null : Number(nr.scopeId) }])}>Añadir</button>
          <button className={btn} onClick={save}>Guardar cambios</button>
          {saved && <span className="text-sm text-green-700 self-center">{saved}</span>}
        </div>
      </>}
    </div>
  );
}
