import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, Briefcase } from "lucide-react";

interface TipoNegocio {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

export default function TiposNegocioPage() {
  const [items, setItems] = useState<TipoNegocio[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TipoNegocio | null>(null);
  const [form, setForm] = useState({ codigo: "", nombre: "", descripcion: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const res = await apiRequest("GET", "/api/catalog/tipos-negocio");
      setItems(await res.json());
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
    setForm({ codigo: "", nombre: "", descripcion: "" });
    setShowModal(true);
    setError("");
  };

  const openEdit = (item: TipoNegocio) => {
    setEditing(item);
    setForm({
      codigo: item.codigo,
      nombre: item.nombre,
      descripcion: item.descripcion || "",
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      if (editing) {
        await apiRequest("PUT", `/api/catalog/tipos-negocio/${editing.id}`, form);
      } else {
        await apiRequest("POST", "/api/catalog/tipos-negocio", form);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "El código ya existe" : "Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este tipo de negocio?")) return;
    try {
      await apiRequest("DELETE", `/api/catalog/tipos-negocio/${id}`);
      fetchData();
    } catch {
      setError("Error al eliminar");
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Tipos de Negocio</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona los tipos de negocio del catálogo</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Tipo
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Código</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Nombre</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Descripción</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                <td className="px-5 py-3">
                  <span className="px-2.5 py-1 bg-[#00aeef]/10 text-[#00aeef] text-xs rounded-lg font-semibold">
                    {item.codigo}
                  </span>
                </td>
                <td className="px-5 py-3 font-medium text-gray-900">{item.nombre}</td>
                <td className="px-5 py-3 text-gray-500">{item.descripcion || "—"}</td>
                <td className="px-5 py-3">
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
                <td colSpan={4} className="text-center py-12 text-gray-400">
                  No hay tipos de negocio registrados. Crea el primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && !showModal && (
        <div className="mt-4 text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editing ? "Editar Tipo de Negocio" : "Nuevo Tipo de Negocio"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input
                  type="text"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. TN001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. Restaurante"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Descripción del tipo de negocio"
                />
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
                  {editing ? "Guardar Cambios" : "Crear Tipo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
