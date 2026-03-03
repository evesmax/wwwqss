import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, Users, PlusCircle, MinusCircle } from "lucide-react";

interface TipoNegocio {
  id: number;
  codigo: string;
  nombre: string;
}

interface Cliente {
  id: number;
  codigo: string;
  tipo: string;
  nombreNegocio: string;
  tipoNegocioId: number | null;
  nombreContacto: string;
  telefonoContacto: string;
  metadata: Record<string, string>;
}

const emptyForm = {
  codigo: "",
  tipo: "Prospecto",
  nombreNegocio: "",
  tipoNegocioId: "" as string | number,
  nombreContacto: "",
  telefonoContacto: "",
  metadata: [] as { key: string; value: string }[],
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tiposNegocio, setTiposNegocio] = useState<TipoNegocio[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [clientesRes, tiposRes] = await Promise.all([
        apiRequest("GET", "/api/catalog/clientes"),
        apiRequest("GET", "/api/catalog/tipos-negocio"),
      ]);
      setClientes(await clientesRes.json());
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
    setForm({ ...emptyForm, metadata: [] });
    setShowModal(true);
    setError("");
  };

  const openEdit = (cliente: Cliente) => {
    setEditing(cliente);
    const metaEntries = cliente.metadata
      ? Object.entries(cliente.metadata).map(([key, value]) => ({ key, value: String(value) }))
      : [];
    setForm({
      codigo: cliente.codigo,
      tipo: cliente.tipo,
      nombreNegocio: cliente.nombreNegocio,
      tipoNegocioId: cliente.tipoNegocioId ?? "",
      nombreContacto: cliente.nombreContacto,
      telefonoContacto: cliente.telefonoContacto,
      metadata: metaEntries,
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      const metadataObj: Record<string, string> = {};
      form.metadata.forEach((m) => {
        if (m.key.trim()) metadataObj[m.key.trim()] = m.value;
      });
      const payload = {
        codigo: form.codigo,
        tipo: form.tipo,
        nombreNegocio: form.nombreNegocio,
        tipoNegocioId: form.tipoNegocioId === "" ? null : Number(form.tipoNegocioId),
        nombreContacto: form.nombreContacto,
        telefonoContacto: form.telefonoContacto,
        metadata: metadataObj,
      };
      if (editing) {
        await apiRequest("PUT", `/api/catalog/clientes/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/catalog/clientes", payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "El código ya existe" : "Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;
    try {
      await apiRequest("DELETE", `/api/catalog/clientes/${id}`);
      fetchData();
    } catch {
      setError("Error al eliminar");
    }
  };

  const addMetaRow = () => {
    setForm((prev) => ({ ...prev, metadata: [...prev.metadata, { key: "", value: "" }] }));
  };

  const removeMetaRow = (index: number) => {
    setForm((prev) => ({ ...prev, metadata: prev.metadata.filter((_, i) => i !== index) }));
  };

  const updateMetaRow = (index: number, field: "key" | "value", val: string) => {
    setForm((prev) => ({
      ...prev,
      metadata: prev.metadata.map((m, i) => (i === index ? { ...m, [field]: val } : m)),
    }));
  };

  const getTipoNegocioNombre = (id: number | null) => {
    if (!id) return "—";
    return tiposNegocio.find((t) => t.id === id)?.nombre || "—";
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
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona prospectos y clientes</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
      </div>

      {error && !showModal && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Código</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nombre Negocio</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipo Negocio</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contacto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Teléfono</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.codigo}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        c.tipo === "Cliente"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.nombreNegocio}</td>
                  <td className="px-4 py-3 text-gray-500">{getTipoNegocioNombre(c.tipoNegocioId)}</td>
                  <td className="px-4 py-3 text-gray-700">{c.nombreContacto}</td>
                  <td className="px-4 py-3 text-gray-500">{c.telefonoContacto}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-2 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    No hay clientes registrados. Crea el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editing ? "Editar Cliente" : "Nuevo Cliente"}</h2>
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
                  placeholder="Ej. CLI-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef] bg-white"
                >
                  <option value="Prospecto">Prospecto</option>
                  <option value="Cliente">Cliente</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Negocio</label>
                <input
                  type="text"
                  value={form.nombreNegocio}
                  onChange={(e) => setForm({ ...form, nombreNegocio: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Nombre del negocio"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Negocio</label>
                <select
                  value={form.tipoNegocioId}
                  onChange={(e) => setForm({ ...form, tipoNegocioId: e.target.value === "" ? "" : Number(e.target.value) })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef] bg-white"
                >
                  <option value="">— Sin tipo de negocio —</option>
                  {tiposNegocio.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Contacto</label>
                <input
                  type="text"
                  value={form.nombreContacto}
                  onChange={(e) => setForm({ ...form, nombreContacto: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Nombre del contacto"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono de Contacto</label>
                <input
                  type="text"
                  value={form.telefonoContacto}
                  onChange={(e) => setForm({ ...form, telefonoContacto: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Teléfono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Metadata</label>
                  <button
                    type="button"
                    onClick={addMetaRow}
                    className="flex items-center gap-1 text-xs text-[#00aeef] hover:text-[#0099d6] font-medium transition"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Agregar
                  </button>
                </div>
                {form.metadata.length === 0 && (
                  <p className="text-xs text-gray-400">Sin datos adicionales</p>
                )}
                <div className="space-y-2">
                  {form.metadata.map((m, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={m.key}
                        onChange={(e) => updateMetaRow(i, "key", e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef] text-sm"
                        placeholder="Clave"
                      />
                      <input
                        type="text"
                        value={m.value}
                        onChange={(e) => updateMetaRow(i, "value", e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef] text-sm"
                        placeholder="Valor"
                      />
                      <button
                        type="button"
                        onClick={() => removeMetaRow(i)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition"
                      >
                        <MinusCircle className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
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
                  {editing ? "Guardar Cambios" : "Crear Cliente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}