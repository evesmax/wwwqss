import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, BarChart3, Clock } from "lucide-react";

const PERIODOS = ["Mensual", "Trimestral", "Semestral", "Anual"];

const periodoBadgeColor: Record<string, string> = {
  Mensual: "bg-blue-100 text-blue-700",
  Trimestral: "bg-green-100 text-green-700",
  Semestral: "bg-amber-100 text-amber-700",
  Anual: "bg-purple-100 text-purple-700",
};

interface Kpi {
  id: number;
  codigoKpi: string;
  kpi: string;
  descripcion: string | null;
  valor: string | null;
  periodoEvaluacion: string;
}

export default function KpisPage() {
  const [items, setItems] = useState<Kpi[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Kpi | null>(null);
  const [form, setForm] = useState({ codigoKpi: "", kpi: "", descripcion: "", valor: "", periodoEvaluacion: "Mensual" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const res = await apiRequest("GET", "/api/catalog/kpis");
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
    setForm({ codigoKpi: "", kpi: "", descripcion: "", valor: "", periodoEvaluacion: "Mensual" });
    setShowModal(true);
    setError("");
  };

  const openEdit = (item: Kpi) => {
    setEditing(item);
    setForm({
      codigoKpi: item.codigoKpi,
      kpi: item.kpi,
      descripcion: item.descripcion || "",
      valor: item.valor || "",
      periodoEvaluacion: item.periodoEvaluacion || "Mensual",
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      if (editing) {
        await apiRequest("PUT", `/api/catalog/kpis/${editing.id}`, form);
      } else {
        await apiRequest("POST", "/api/catalog/kpis", form);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "El código ya existe" : "Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este KPI?")) return;
    try {
      await apiRequest("DELETE", `/api/catalog/kpis/${id}`);
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
          <h1 className="text-2xl font-bold text-gray-900">KPIs</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona los indicadores clave de rendimiento</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo KPI
        </button>
      </div>

      {error && !showModal && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Código</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">KPI</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Descripción</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Valor</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-600">Periodo de Evaluación</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#00aeef]/10 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-4 h-4 text-[#00aeef]" />
                    </div>
                    <span className="font-medium text-gray-900">{item.codigoKpi}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-700">{item.kpi}</td>
                <td className="px-5 py-3 text-gray-500">{item.descripcion || "—"}</td>
                <td className="px-5 py-3 text-gray-700 font-medium">{item.valor || "—"}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium ${periodoBadgeColor[item.periodoEvaluacion] || "bg-gray-100 text-gray-700"}`}>
                    <Clock className="w-3 h-3" />
                    {item.periodoEvaluacion}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1 justify-end">
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
                  No hay KPIs registrados. Crea el primero.
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
              <h2 className="text-lg font-bold">{editing ? "Editar KPI" : "Nuevo KPI"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input
                  type="text"
                  value={form.codigoKpi}
                  onChange={(e) => setForm({ ...form, codigoKpi: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. KPI-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KPI</label>
                <input
                  type="text"
                  value={form.kpi}
                  onChange={(e) => setForm({ ...form, kpi: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Nombre del KPI"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Descripción del KPI"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                <input
                  type="text"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Valor del KPI"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Periodo de Evaluación</label>
                <div className="grid grid-cols-4 gap-2">
                  {PERIODOS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, periodoEvaluacion: p })}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition ${
                        form.periodoEvaluacion === p
                          ? "bg-[#00aeef] text-white border-[#00aeef]"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
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
                  {editing ? "Guardar Cambios" : "Crear KPI"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
