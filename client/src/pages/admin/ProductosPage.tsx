import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, Package } from "lucide-react";

interface TipoNegocio {
  id: number;
  codigo: string;
  nombre: string;
}

interface Producto {
  id: number;
  codigoProducto: string;
  nombre: string;
  descripcion: string;
  precio: string;
  tiposNegocio: { tipoNegocioId: number; nombre: string }[];
}

export default function ProductosPage() {
  const [items, setItems] = useState<Producto[]>([]);
  const [tiposNegocio, setTiposNegocio] = useState<TipoNegocio[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [form, setForm] = useState({
    codigoProducto: "",
    nombre: "",
    descripcion: "",
    precio: "",
    tipoNegocioIds: [] as number[],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [prodRes, tiposRes] = await Promise.all([
        apiRequest("GET", "/api/catalog/productos"),
        apiRequest("GET", "/api/catalog/tipos-negocio"),
      ]);
      setItems(await prodRes.json());
      setTiposNegocio(await tiposRes.json());
    } catch {
      setError("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ codigoProducto: "", nombre: "", descripcion: "", precio: "", tipoNegocioIds: [] });
    setShowModal(true);
    setError("");
  };

  const openEdit = (item: Producto) => {
    setEditing(item);
    setForm({
      codigoProducto: item.codigoProducto,
      nombre: item.nombre,
      descripcion: item.descripcion,
      precio: item.precio,
      tipoNegocioIds: item.tiposNegocio.map((t) => t.tipoNegocioId),
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      const payload = { ...form, precio: parseFloat(form.precio) || 0 };
      if (editing) {
        await apiRequest("PUT", `/api/catalog/productos/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/catalog/productos", payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "El código ya existe" : "Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este producto?")) return;
    try {
      await apiRequest("DELETE", `/api/catalog/productos/${id}`);
      fetchData();
    } catch {
      setError("Error al eliminar");
    }
  };

  const toggleTipoNegocio = (tipoId: number) => {
    setForm((prev) => ({
      ...prev,
      tipoNegocioIds: prev.tipoNegocioIds.includes(tipoId)
        ? prev.tipoNegocioIds.filter((id) => id !== tipoId)
        : [...prev.tipoNegocioIds, tipoId],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#00aeef] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona el catálogo de productos</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Producto
        </button>
      </div>

      {error && !showModal && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Nombre</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Descripción</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipos de Negocio</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.codigoProducto}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{item.nombre}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{item.descripcion}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  ${parseFloat(item.precio).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {item.tiposNegocio.map((t) => (
                      <span
                        key={t.tipoNegocioId}
                        className="px-2 py-0.5 bg-[#00aeef]/10 text-[#00aeef] text-xs rounded-lg font-medium"
                      >
                        {t.nombre}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(item)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-50 rounded-lg transition">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">
                  No hay productos registrados. Crea el primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editing ? "Editar Producto" : "Nuevo Producto"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código del producto</label>
                <input
                  type="text"
                  value={form.codigoProducto}
                  onChange={(e) => setForm({ ...form, codigoProducto: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. PROD-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Nombre del producto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Descripción del producto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio}
                  onChange={(e) => setForm({ ...form, precio: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Tipos de Negocio</label>
                <div className="space-y-2">
                  {tiposNegocio.map((tipo) => (
                    <label key={tipo.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.tipoNegocioIds.includes(tipo.id)}
                        onChange={() => toggleTipoNegocio(tipo.id)}
                        className="w-4 h-4 rounded text-[#00aeef] focus:ring-[#00aeef]"
                      />
                      <span className="text-sm font-medium text-gray-700">{tipo.nombre}</span>
                    </label>
                  ))}
                  {tiposNegocio.length === 0 && (
                    <p className="text-sm text-gray-400">No hay tipos de negocio disponibles</p>
                  )}
                </div>
              </div>

              {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
                >
                  {editing ? "Guardar Cambios" : "Crear Producto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
