import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type Row = Record<string, any>;
const TABS = ["Cuentas", "Productos", "Instancias", "Contratos", "Contactos", "Asignaciones"] as const;
const ACCOUNT_TYPES = [["suscripcion", "Suscripción"], ["proyecto", "Proyecto"], ["bolsa_horas", "Bolsa de horas"], ["demo", "Demo"], ["interno", "Interno"]];
const ROLES = [["owner", "Owner"], ["support_manager", "Gerente de soporte"], ["agent_l2", "Agente L2"], ["agent_l1", "Agente L1"], ["finance", "Finanzas"], ["readonly", "Solo lectura"]];

const inp = "border rounded-lg px-3 py-2 text-sm";
const btn = "px-3 py-2 bg-[#00aeef] text-white rounded-lg text-sm font-semibold disabled:opacity-50";

async function get(url: string): Promise<Row[]> { return (await apiRequest("GET", url)).json(); }

function Table({ cols, rows }: { cols: [string, string][]; rows: Row[] }) {
  return (
    <div className="overflow-x-auto bg-white rounded-xl border">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b">{cols.map(([, h]) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={r.id ?? i} className="border-b last:border-0">{cols.map(([k]) => <td key={k} className="px-3 py-2">{String(r[k] ?? "")}</td>)}</tr>)}
          {!rows.length && <tr><td className="px-3 py-4 text-gray-400" colSpan={cols.length}>Sin registros</td></tr>}
        </tbody>
      </table>
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
  const [err, setErr] = useState("");

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
  useEffect(() => { loadItems(); setForm({}); setErr(""); }, [loadItems]);

  const submit = async (url: string, body: Row, after: () => void) => {
    setErr("");
    try { await apiRequest("POST", url, body); setForm({}); after(); }
    catch (e: any) { setErr(e.message?.startsWith("403") ? "No tienes permiso para esta acción." : "Datos inválidos o duplicados."); }
  };
  const f = (k: string) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.value });
  const prodSelect = <select className={inp} value={form.productId ?? ""} onChange={f("productId")} required><option value="">Producto…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Catálogo de soporte</h1>
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? "bg-[#00aeef] text-white" : "bg-white border text-gray-600"}`}>{t}</button>)}
      </div>
      {err && <div className="text-sm p-3 rounded-lg border bg-red-50 border-red-200 text-red-600">{err}</div>}

      {tab === "Cuentas" && <>
        <Table cols={[["codigo", "Código cliente"], ["nombre", "Cliente"], ["accountType", "Tipo"], ["ticketPrefix", "Prefijo"], ["active", "Activa"]]} rows={accounts} />
        <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); submit("/api/desk/accounts", { clienteId: Number(form.clienteId), accountType: form.accountType ?? "suscripcion", ticketPrefix: form.ticketPrefix }, loadBase); }}>
          <select className={inp} value={form.clienteId ?? ""} onChange={f("clienteId")} required><option value="">Cliente del CRM…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombreNegocio}</option>)}</select>
          <select className={inp} value={form.accountType ?? "suscripcion"} onChange={f("accountType")}>{ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input className={inp} placeholder="Prefijo (ej. ROT)" maxLength={6} value={form.ticketPrefix ?? ""} onChange={f("ticketPrefix")} required />
          <button className={btn}>Agregar cuenta</button>
        </form>
      </>}

      {tab === "Productos" && <>
        <Table cols={[["code", "Código"], ["name", "Nombre"], ["active", "Activo"]]} rows={products} />
        <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); submit("/api/desk/products", { code: form.code, name: form.name }, loadBase); }}>
          <input className={inp} placeholder="Código" value={form.code ?? ""} onChange={f("code")} required />
          <input className={inp} placeholder="Nombre" value={form.name ?? ""} onChange={f("name")} required />
          <button className={btn}>Agregar producto</button>
        </form>
      </>}

      {childPath[tab] && <>
        <select className={inp} value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.ticketPrefix})</option>)}
        </select>
        {tab === "Instancias" && <>
          <Table cols={[["name", "Nombre"], ["productId", "Producto"], ["environment", "Entorno"], ["baseUrl", "URL"]]} rows={items} />
          <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); submit("/api/desk/instances", { accountId, productId: Number(form.productId), name: form.name, baseUrl: form.baseUrl ?? "", environment: form.environment ?? "prod" }, loadItems); }}>
            {prodSelect}
            <input className={inp} placeholder="Nombre de la instancia" value={form.name ?? ""} onChange={f("name")} required />
            <input className={inp} placeholder="URL base" value={form.baseUrl ?? ""} onChange={f("baseUrl")} />
            <select className={inp} value={form.environment ?? "prod"} onChange={f("environment")}><option value="prod">Producción</option><option value="staging">Staging</option></select>
            <button className={btn} disabled={accountId === ""}>Agregar</button>
          </form>
        </>}
        {tab === "Contratos" && <>
          <Table cols={[["productId", "Producto"], ["plan", "Plan"], ["calendar", "Calendario"], ["slaActiveFrom", "SLA activo desde"], ["hoursBank", "Bolsa de horas"]]} rows={items} />
          <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); submit("/api/desk/contracts", { accountId, productId: Number(form.productId), plan: form.plan || "estandar", hoursBank: form.hoursBank || null }, loadItems); }}>
            {prodSelect}
            <input className={inp} placeholder="Plan (estandar…)" value={form.plan ?? ""} onChange={f("plan")} />
            <input className={inp} placeholder="Bolsa de horas" inputMode="decimal" value={form.hoursBank ?? ""} onChange={f("hoursBank")} />
            <button className={btn} disabled={accountId === ""}>Agregar</button>
          </form>
        </>}
        {tab === "Contactos" && <>
          <Table cols={[["email", "Correo"], ["name", "Nombre"], ["role", "Rol"]]} rows={items} />
          <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); submit("/api/desk/contacts", { accountId, email: form.email, name: form.name ?? "", role: form.role ?? "contact" }, loadItems); }}>
            <input className={inp} type="email" placeholder="Correo" value={form.email ?? ""} onChange={f("email")} required />
            <input className={inp} placeholder="Nombre" value={form.name ?? ""} onChange={f("name")} />
            <select className={inp} value={form.role ?? "contact"} onChange={f("role")}><option value="account_admin">Admin de cuenta</option><option value="contact">Contacto</option><option value="reporter">Reportante</option></select>
            <button className={btn} disabled={accountId === ""}>Agregar</button>
          </form>
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
      <select className={inp} value={sel} onChange={(e) => setSel(Number(e.target.value))}>
        <option value="">Usuario interno…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.username}{u.id === meId ? " (tú)" : ""}</option>)}
      </select>
      {sel !== "" && <>
        <ul className="bg-white rounded-xl border divide-y">
          {list.map((a, i) => <li key={i} className="px-3 py-2 text-sm flex justify-between">{label(a)}<button className="text-red-600" onClick={() => setList(list.filter((_, j) => j !== i))}>Quitar</button></li>)}
          {!list.length && <li className="px-3 py-3 text-sm text-gray-400">Sin asignaciones: este usuario no ve nada en Soporte.</li>}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <select className={inp} value={nr.role} onChange={(e) => setNr({ ...nr, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className={inp} value={nr.scopeType} onChange={(e) => setNr({ ...nr, scopeType: e.target.value, scopeId: "" })}><option value="global">Global</option><option value="account">Cuenta</option><option value="product">Producto</option></select>
          {nr.scopeType !== "global" && <select className={inp} value={nr.scopeId} onChange={(e) => setNr({ ...nr, scopeId: e.target.value })}>
            <option value="">Elegir…</option>{(nr.scopeType === "account" ? accounts.map((a) => [a.id, a.nombre]) : products.map((p) => [p.id, p.name])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>}
          <button className="px-3 py-2 border rounded-lg text-sm" onClick={() => (nr.scopeType === "global" || nr.scopeId) && setList([...list, { role: nr.role, scopeType: nr.scopeType, scopeId: nr.scopeType === "global" ? null : Number(nr.scopeId) }])}>Añadir</button>
          <button className={btn} onClick={save}>Guardar cambios</button>
          {saved && <span className="text-sm text-green-700 self-center">{saved}</span>}
        </div>
      </>}
    </div>
  );
}
