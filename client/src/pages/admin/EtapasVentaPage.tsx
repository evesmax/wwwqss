import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, ListOrdered } from "lucide-react";

interface EtapaVenta {
  id: number;
  codigoEtapa: string;
  etapa: string;
  descripcion: string;
  inicial: boolean;
  final: boolean;
  probabilidad: number;
  orden: number;
}

const emptyForm = { codigoEtapa: "", etapa: "", descripcion: "", inicial: false, final: false, probabilidad: 0, orden: 0 };

export default function EtapasVentaPage() {
  const [items, setItems] = useState<EtapaVenta[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EtapaVenta | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const res = await apiRequest("GET", "/api/catalog/etapas-venta");
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
    setForm(emptyForm);
    setShowModal(true);
    setError("");
  };

  const openEdit = (item: EtapaVenta) => {
    setEditing(item);
    setForm({
      codigoEtapa: item.codigoEtapa,
      etapa: item.etapa,
      descripcion: item.descripcion,
      inicial: item.inicial,
      final: item.final,
      probabilidad: item.probabilidad ?? 0,
      orden: item.orden ?? 0,
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      const body = { ...form, esFinal: form.final };
      if (editing) {
        await apiRequest("PUT", `/api/catalog/etapas-venta/${editing.id}`, body);
      } else {
        await apiRequest("POST", "/api/catalog/etapas-venta", body);
      }
      setShowModal(false);
      fetchData();
    } catch {
      setError("Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta etapa?")) return;
    try {
      await apiRequest("DELETE", `/api/catalog/etapas-venta/${id}`);
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
          <h1 className="text-2xl font-bold text-gray-900">Etapas de Venta</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona las etapas del proceso de venta</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nueva Etapa
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Código</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Etapa</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Descripción</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-600">Orden</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-600">Probabilidad</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-600">Inicial</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-600">Final</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                <td className="px-5 py-3 font-medium text-gray-900">{item.codigoEtapa}</td>
                <td className="px-5 py-3 text-gray-700">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-[#00aeef]/10 rounded-lg flex items-center justify-center">
                      <ListOrdered className="w-4 h-4 text-[#00aeef]" />
                    </div>
                    {item.etapa}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-500">{item.descripcion}</td>
                <td className="px-5 py-3 text-center">
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg font-medium">{item.orden}</span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs rounded-lg font-medium">{item.probabilidad}%</span>
                </td>
                <td className="px-5 py-3 text-center">
                  {item.inicial ? (
                    <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded-lg font-medium">Sí</span>
                  ) : (
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-400 text-xs rounded-lg font-medium">No</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center">
                  {item.final ? (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg font-medium">Sí</span>
                  ) : (
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-400 text-xs rounded-lg font-medium">No</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-2">
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
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  No hay etapas registradas. Crea la primera.
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
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editing ? "Editar Etapa" : "Nueva Etapa"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input
                  type="text"
                  value={form.codigoEtapa}
                  onChange={(e) => setForm({ ...form, codigoEtapa: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. EV-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
                <input
                  type="text"
                  value={form.etapa}
                  onChange={(e) => setForm({ ...form, etapa: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. Prospección"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Descripción de la etapa"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
                  <input
                    type="number"
                    min={0}
                    value={form.orden}
                    onChange={(e) => setForm({ ...form, orden: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                    placeholder="0"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Probabilidad (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.probabilidad}
                    onChange={(e) => setForm({ ...form, probabilidad: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                    placeholder="0"
                  />
                  <div className="mt-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={form.probabilidad}
                      onChange={(e) => setForm({ ...form, probabilidad: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00aeef]"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.inicial}
                    onChange={(e) => setForm({ ...form, inicial: e.target.checked })}
                    className="w-4 h-4 rounded text-[#00aeef] focus:ring-[#00aeef]"
                  />
                  <span className="text-sm font-medium text-gray-700">Etapa Inicial</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.final}
                    onChange={(e) => setForm({ ...form, final: e.target.checked })}
                    className="w-4 h-4 rounded text-[#00aeef] focus:ring-[#00aeef]"
                  />
                  <span className="text-sm font-medium text-gray-700">Etapa Final</span>
                </label>
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
                  {editing ? "Guardar Cambios" : "Crear Etapa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
