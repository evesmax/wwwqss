import { useState, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Edit2, Trash2, X, Users, PlusCircle, MinusCircle,
  Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
} from "lucide-react";

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

type SortField = "codigo" | "tipo" | "nombreNegocio" | "tipoNegocio" | "nombreContacto" | "telefonoContacto";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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

  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("");
  const [filterTipoNegocioId, setFilterTipoNegocioId] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("codigo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  useEffect(() => { fetchData(); }, []);

  const getTipoNegocioNombre = (id: number | null) => {
    if (!id) return "";
    return tiposNegocio.find((t) => t.id === id)?.nombre || "";
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clientes.filter((c) => {
      if (filterTipo && c.tipo !== filterTipo) return false;
      if (filterTipoNegocioId && String(c.tipoNegocioId) !== filterTipoNegocioId) return false;
      if (!q) return true;
      return (
        c.codigo.toLowerCase().includes(q) ||
        c.tipo.toLowerCase().includes(q) ||
        c.nombreNegocio.toLowerCase().includes(q) ||
        c.nombreContacto.toLowerCase().includes(q) ||
        c.telefonoContacto.toLowerCase().includes(q) ||
        getTipoNegocioNombre(c.tipoNegocioId).toLowerCase().includes(q)
      );
    });
  }, [clientes, search, filterTipo, filterTipoNegocioId, tiposNegocio]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = "";
      let vb = "";
      if (sortField === "tipoNegocio") {
        va = getTipoNegocioNombre(a.tipoNegocioId);
        vb = getTipoNegocioNombre(b.tipoNegocioId);
      } else {
        va = String(a[sortField] ?? "");
        vb = String(b[sortField] ?? "");
      }
      const cmp = va.localeCompare(vb, "es", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir, tiposNegocio]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleFilterTipo = (val: string) => { setFilterTipo(val); setPage(1); };
  const handleFilterTipoNegocio = (val: string) => { setFilterTipoNegocioId(val); setPage(1); };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3.5 h-3.5 text-[#00aeef] inline ml-1" />
      : <ChevronDown className="w-3.5 h-3.5 text-[#00aeef] inline ml-1" />;
  };

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

  const addMetaRow = () => setForm((p) => ({ ...p, metadata: [...p.metadata, { key: "", value: "" }] }));
  const removeMetaRow = (i: number) => setForm((p) => ({ ...p, metadata: p.metadata.filter((_, idx) => idx !== i) }));
  const updateMetaRow = (i: number, field: "key" | "value", val: string) =>
    setForm((p) => ({ ...p, metadata: p.metadata.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)) }));

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
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} de {clientes.length} registro{clientes.length !== 1 ? "s" : ""}
          </p>
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

      <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por código, nombre, contacto..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00aeef]"
            />
          </div>
          <div>
            <select
              value={filterTipo}
              onChange={(e) => handleFilterTipo(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00aeef] bg-white"
            >
              <option value="">Todos los tipos</option>
              <option value="Prospecto">Prospecto</option>
              <option value="Cliente">Cliente</option>
            </select>
          </div>
          <div>
            <select
              value={filterTipoNegocioId}
              onChange={(e) => handleFilterTipoNegocio(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00aeef] bg-white"
            >
              <option value="">Todos los tipos de negocio</option>
              {tiposNegocio.map((t) => (
                <option key={t.id} value={String(t.id)}>{t.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        {(search || filterTipo || filterTipoNegocioId) && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Filtros activos:</span>
            {search && (
              <span className="inline-flex items-center gap-1 text-xs bg-[#00aeef]/10 text-[#00aeef] px-2 py-1 rounded-lg font-medium">
                "{search}"
                <button onClick={() => handleSearch("")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterTipo && (
              <span className="inline-flex items-center gap-1 text-xs bg-[#00aeef]/10 text-[#00aeef] px-2 py-1 rounded-lg font-medium">
                {filterTipo}
                <button onClick={() => handleFilterTipo("")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterTipoNegocioId && (
              <span className="inline-flex items-center gap-1 text-xs bg-[#00aeef]/10 text-[#00aeef] px-2 py-1 rounded-lg font-medium">
                {getTipoNegocioNombre(Number(filterTipoNegocioId))}
                <button onClick={() => handleFilterTipoNegocio("")}><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort("codigo")}
                >
                  Código <SortIcon field="codigo" />
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort("tipo")}
                >
                  Tipo <SortIcon field="tipo" />
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort("nombreNegocio")}
                >
                  Nombre Negocio <SortIcon field="nombreNegocio" />
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort("tipoNegocio")}
                >
                  Tipo Negocio <SortIcon field="tipoNegocio" />
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort("nombreContacto")}
                >
                  Contacto <SortIcon field="nombreContacto" />
                </th>
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                  onClick={() => handleSort("telefonoContacto")}
                >
                  Teléfono <SortIcon field="telefonoContacto" />
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.codigo}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      c.tipo === "Cliente" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.nombreNegocio}</td>
                  <td className="px-4 py-3 text-gray-500">{getTipoNegocioNombre(c.tipoNegocioId) || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{c.nombreContacto || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{c.telefonoContacto || "—"}</td>
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
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    {clientes.length === 0
                      ? "No hay clientes registrados. Crea el primero."
                      : "No hay resultados para la búsqueda actual."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Filas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#00aeef]"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1 text-sm text-gray-600">
            <span>
              {sorted.length === 0 ? "0" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)}`}
              {" "}de {sorted.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Primera página"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition"
            >
              Anterior
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "…" ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      safePage === item
                        ? "bg-[#00aeef] text-white"
                        : "hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-sm transition"
            >
              Siguiente
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Última página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
                    <option key={t.id} value={t.id}>{t.nombre}</option>
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
