import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { fmt } from "./ticketUi";
import { SearchSelect } from "@/components/ui/search-select";

const inp = "border rounded-lg px-3 py-2 text-sm";
const errMsg = (e: any, d: string) => { try { return JSON.parse(String(e.message).replace(/^\d+: /, "")).message ?? d; } catch { return d; } };

export default function SdkPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [f, setF] = useState({ productId: "", name: "", origins: "" });
  const [secret, setSecret] = useState<{ keyId: string; secret: string } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => apiRequest("GET", "/api/desk/sdk/keys").then((r) => r.json()).then(setKeys).catch(() => setMsg("No se pudieron cargar las llaves (requiere Owner/Gerente global y MFA)."));
  useEffect(() => { load(); apiRequest("GET", "/api/desk/products").then((r) => r.json()).then(setProducts).catch(() => {}); }, []);
  const pname = (id: number) => products.find((p) => p.id === id)?.name ?? `#${id}`;
  const origins = f.origins.split(/[\s,]+/).filter(Boolean);

  const create = async () => {
    setMsg("");
    try {
      const k = await (await apiRequest("POST", "/api/desk/sdk/keys", { productId: Number(f.productId), name: f.name, allowedOrigins: origins })).json();
      setSecret({ keyId: k.keyId, secret: k.secret }); setF({ productId: "", name: "", origins: "" }); load();
    } catch (e) { setMsg(errMsg(e, "No se pudo crear (los orígenes deben ser como https://app.cliente.com, sin ruta)")); }
  };
  const rotate = async (k: any) => {
    if (!confirm(`¿Rotar la llave de "${k.name}"? La anterior dejará de funcionar de inmediato.`)) return;
    const r = await (await apiRequest("POST", `/api/desk/sdk/keys/${k.id}/rotate`)).json();
    setSecret({ keyId: r.keyId, secret: r.secret }); load();
  };
  const toggle = async (k: any) => { await apiRequest("PUT", `/api/desk/sdk/keys/${k.id}`, { name: k.name, allowedOrigins: k.allowedOrigins, active: !k.active }); load(); };

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">SDK / Widget de soporte</h1>
      <p className="text-sm text-gray-600">Cada producto firma con su propia llave un token (JWT) que identifica al usuario y su <b>tenant</b> (nombre de la instancia en el Catálogo). Los reportes llegan como tickets del canal "widget" a la cuenta de esa instancia.</p>
      {msg && <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded-lg">{msg}</div>}
      {secret && <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg text-sm space-y-1">
        <p className="font-semibold">Guarda esta llave ahora: no se volverá a mostrar.</p>
        <p>ID: <code>{secret.keyId}</code></p><p>Secreto: <code className="break-all">{secret.secret}</code></p>
        <button className="text-[#0088c2]" onClick={() => setSecret(null)}>Ya la guardé</button></div>}
      <div className="bg-white border rounded-xl p-4 grid sm:grid-cols-3 gap-3 text-sm items-end">
        <label>Producto<SearchSelect className={`${inp} w-full`} value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}><option value="">Selecciona…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SearchSelect></label>
        <label>Nombre de la llave<input className={`${inp} w-full`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="QPulseMES producción" /></label>
        <label>Orígenes permitidos<input className={`${inp} w-full`} value={f.origins} onChange={(e) => setF({ ...f, origins: e.target.value })} placeholder="https://app.cliente.com" /></label>
        <div className="sm:col-span-3"><button disabled={!f.productId || f.name.length < 2} onClick={create} className="px-4 py-2 bg-[#00aeef] text-white rounded-lg disabled:opacity-50">Crear llave</button></div>
      </div>
      <table className="w-full text-sm bg-white border rounded-xl"><thead><tr className="text-left text-gray-500"><th className="p-2">Producto</th><th>Nombre</th><th>ID</th><th>Orígenes</th><th>Último uso</th><th /></tr></thead>
        <tbody>{keys.map((k) => <tr key={k.id} className={`border-t ${k.active ? "" : "opacity-50"}`}><td className="p-2">{pname(k.productId)}</td><td>{k.name}</td><td className="font-mono text-xs">{k.keyId}</td>
          <td className="text-xs">{(k.allowedOrigins as string[]).join(", ") || "—"}</td><td>{k.lastUsedAt ? fmt(k.lastUsedAt) : "nunca"}</td>
          <td className="text-right space-x-2 pr-2"><button className="text-[#0088c2]" onClick={() => rotate(k)}>Rotar</button><button className="text-gray-600" onClick={() => toggle(k)}>{k.active ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table>
      <details className="bg-white border rounded-xl p-4 text-sm"><summary className="font-semibold cursor-pointer">Cómo integrarlo en un producto</summary>
        <pre className="bg-gray-50 p-3 rounded mt-2 text-xs overflow-x-auto">{`// 1) En TU backend (Node, ejemplo): firma un token corto con la llave secreta
const jwt = require('jsonwebtoken');
app.get('/qss-token', auth, (req, res) => res.send(jwt.sign(
  { sub: req.user.id, email: req.user.email, name: req.user.name, tenant: 'Nombre de la instancia' },
  process.env.QSS_SDK_SECRET,
  { algorithm: 'HS256', keyid: 'qk_xxxxxxxx', expiresIn: '10m' })));

// 2) En tu frontend
<script src="https://qsoftwaresolutions.com/sdk/qss-widget.js"></script>
<script>QSSWidget.init({ getToken: () => fetch('/qss-token').then(r => r.text()), appVersion: '1.0.0' });</script>`}</pre>
        <p className="mt-2 text-gray-600">El usuario final puede adjuntar captura de pantalla (el navegador le pide permiso). Se registra URL (sin parámetros), navegador, versión y errores recientes de consola.</p></details>
    </div>
  );
}
