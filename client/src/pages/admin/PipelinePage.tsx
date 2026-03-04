import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  TrendingUp,
  AlertCircle,
  DollarSign,
  Target,
  MoreVertical,
  Trash2,
  Edit2,
  X,
  Eye,
  List,
  LayoutGrid,
  ArrowRight,
  Clock,
  GripVertical,
  UserPlus,
  Check,
} from "lucide-react";

interface Etapa {
  id: number;
  codigoEtapa: string;
  etapa: string;
  descripcion: string;
  inicial: boolean;
  final: boolean;
  probabilidad: number;
  orden: number;
}

interface OportunidadFull {
  id: number;
  codigo: string;
  nombre: string;
  clienteId: number | null;
  tipoNegocioId: number | null;
  productoId: number | null;
  etapaVentaId: number;
  valorEstimado: string;
  probabilidad: number;
  responsableId: number | null;
  estado: string;
  motivoCierre: string | null;
  fechaCierre: string | null;
  createdAt: string;
  updatedAt: string;
  cliente: { id: number; codigo: string; nombreNegocio: string } | null;
  etapa: Etapa;
  responsable: { id: number; username: string; fullName: string } | null;
  producto: { id: number; nombre: string } | null;
  tipoNegocio: { id: number; nombre: string } | null;
  diasInactividad: number;
}

interface Stats {
  pipelineValue: number;
  totalValue: number;
  activeCount: number;
  winRate: number;
  atRiskCount: number;
}

interface Cliente {
  id: number;
  codigo: string;
  nombreNegocio: string;
}

interface Producto {
  id: number;
  nombre: string;
  codigoProducto: string;
}

interface TipoNegocio {
  id: number;
  nombre: string;
}

interface UserMin {
  id: number;
  username: string;
  fullName: string;
}

export default function PipelinePage() {
  const [oportunidades, setOportunidades] = useState<OportunidadFull[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [stats, setStats] = useState<Stats>({ pipelineValue: 0, totalValue: 0, activeCount: 0, winRate: 0, atRiskCount: 0 });
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedOp, setSelectedOp] = useState<OportunidadFull | null>(null);
  const [presetEtapaId, setPresetEtapaId] = useState<number | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productosLst, setProductosLst] = useState<Producto[]>([]);
  const [tiposNeg, setTiposNeg] = useState<TipoNegocio[]>([]);
  const [usersLst, setUsersLst] = useState<UserMin[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [closeForm, setCloseForm] = useState({ estado: "ganada", motivoCierre: "" });
  const [createForm, setCreateForm] = useState({
    nombre: "", clienteId: "", tipoNegocioId: "", productoId: "", etapaVentaId: "", valorEstimado: "", responsableId: "",
  });

  const [actividadesData, setActividadesData] = useState<any[]>([]);
  const [cotizacionesData, setCotizacionesData] = useState<any[]>([]);
  const [newActivity, setNewActivity] = useState({ tipo: "nota", descripcion: "" });
  const [newCotizacion, setNewCotizacion] = useState({ codigo: "", descripcion: "", monto: "" });
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [newClienteForm, setNewClienteForm] = useState({ codigo: "", tipo: "Prospecto", nombreNegocio: "", tipoNegocioId: "", nombreContacto: "", telefonoContacto: "" });
  const [newClienteLoading, setNewClienteLoading] = useState(false);
  const [newClienteError, setNewClienteError] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [opsRes, etapasRes, statsRes, clientesRes, prodRes, tiposRes, usersRes] = await Promise.all([
        apiRequest("GET", "/api/pipeline/oportunidades"),
        apiRequest("GET", "/api/catalog/etapas-venta"),
        apiRequest("GET", "/api/pipeline/stats"),
        apiRequest("GET", "/api/catalog/clientes"),
        apiRequest("GET", "/api/catalog/productos"),
        apiRequest("GET", "/api/catalog/tipos-negocio"),
        apiRequest("GET", "/api/admin/users"),
      ]);
      const [ops, etps, sts, cls, pds, tns, usrs] = await Promise.all([
        opsRes.json(), etapasRes.json(), statsRes.json(), clientesRes.json(), prodRes.json(), tiposRes.json(), usersRes.json(),
      ]);
      setOportunidades(ops);
      setEtapas(etps.sort((a: Etapa, b: Etapa) => a.orden - b.orden));
      setStats(sts);
      setClientes(cls);
      setProductosLst(pds);
      setTiposNeg(tns);
      setUsersLst(usrs);
    } catch {
      setError("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDragStart = (e: React.DragEvent, opId: number) => {
    setDragId(opId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(opId));
  };

  const handleDrop = async (e: React.DragEvent, etapaId: number) => {
    e.preventDefault();
    const opId = parseInt(e.dataTransfer.getData("text/plain"));
    if (!opId) return;

    const op = oportunidades.find(o => o.id === opId);
    if (!op || op.etapaVentaId === etapaId) { setDragId(null); return; }

    const targetEtapa = etapas.find(et => et.id === etapaId);
    if (targetEtapa?.final) {
      setSelectedOp(op);
      setCloseForm({ estado: "ganada", motivoCierre: "" });
      setShowCloseModal(true);
      try {
        await apiRequest("PUT", `/api/pipeline/oportunidades/${opId}/etapa`, { etapaVentaId: etapaId });
        fetchAll();
      } catch {}
      setDragId(null);
      return;
    }

    try {
      await apiRequest("PUT", `/api/pipeline/oportunidades/${opId}/etapa`, { etapaVentaId: etapaId });
      fetchAll();
    } catch {
      setError("Error al mover oportunidad");
    }
    setDragId(null);
  };

  const handleClose = async () => {
    if (!selectedOp) return;
    try {
      await apiRequest("PUT", `/api/pipeline/oportunidades/${selectedOp.id}/cerrar`, closeForm);
      setShowCloseModal(false);
      setSelectedOp(null);
      fetchAll();
    } catch {
      setError("Error al cerrar oportunidad");
    }
  };

  const handleCreateCliente = async () => {
    if (!newClienteForm.nombreNegocio.trim()) {
      setNewClienteError("El nombre del negocio es requerido");
      return;
    }
    setNewClienteLoading(true);
    setNewClienteError("");
    try {
      const codigo = newClienteForm.codigo.trim() || `CLI-${Date.now().toString().slice(-6)}`;
      const res = await apiRequest("POST", "/api/catalog/clientes", {
        codigo,
        tipo: newClienteForm.tipo,
        nombreNegocio: newClienteForm.nombreNegocio.trim(),
        tipoNegocioId: newClienteForm.tipoNegocioId ? parseInt(newClienteForm.tipoNegocioId) : null,
        nombreContacto: newClienteForm.nombreContacto.trim() || null,
        telefonoContacto: newClienteForm.telefonoContacto.trim() || null,
        metadata: {},
      });
      const created = await res.json();
      setClientes(prev => [...prev, { id: created.id, codigo: created.codigo, nombreNegocio: created.nombreNegocio }]);
      setCreateForm(prev => ({ ...prev, clienteId: String(created.id) }));
      setShowNewCliente(false);
      setNewClienteForm({ codigo: "", tipo: "Prospecto", nombreNegocio: "", tipoNegocioId: "", nombreContacto: "", telefonoContacto: "" });
    } catch (err: any) {
      const msg = err?.message || "Error al crear cliente";
      setNewClienteError(msg.includes("código") ? "El código ya existe" : msg);
    } finally {
      setNewClienteLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.nombre || !createForm.etapaVentaId) return;
    try {
      await apiRequest("POST", "/api/pipeline/oportunidades", {
        nombre: createForm.nombre,
        clienteId: createForm.clienteId ? parseInt(createForm.clienteId) : null,
        tipoNegocioId: createForm.tipoNegocioId ? parseInt(createForm.tipoNegocioId) : null,
        productoId: createForm.productoId ? parseInt(createForm.productoId) : null,
        etapaVentaId: parseInt(createForm.etapaVentaId),
        valorEstimado: createForm.valorEstimado || 0,
        responsableId: createForm.responsableId ? parseInt(createForm.responsableId) : null,
      });
      setShowCreateModal(false);
      setCreateForm({ nombre: "", clienteId: "", tipoNegocioId: "", productoId: "", etapaVentaId: "", valorEstimado: "", responsableId: "" });
      fetchAll();
    } catch {
      setError("Error al crear oportunidad");
    }
  };

  const handleUpdate = async () => {
    if (!selectedOp || !createForm.nombre || !createForm.etapaVentaId) return;
    try {
      await apiRequest("PUT", `/api/pipeline/oportunidades/${selectedOp.id}`, {
        nombre: createForm.nombre,
        clienteId: createForm.clienteId ? parseInt(createForm.clienteId) : null,
        tipoNegocioId: createForm.tipoNegocioId ? parseInt(createForm.tipoNegocioId) : null,
        productoId: createForm.productoId ? parseInt(createForm.productoId) : null,
        etapaVentaId: parseInt(createForm.etapaVentaId),
        valorEstimado: createForm.valorEstimado || 0,
        responsableId: createForm.responsableId ? parseInt(createForm.responsableId) : null,
      });
      setShowEditModal(false);
      setSelectedOp(null);
      fetchAll();
    } catch {
      setError("Error al actualizar oportunidad");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta oportunidad?")) return;
    try {
      await apiRequest("DELETE", `/api/pipeline/oportunidades/${id}`);
      fetchAll();
    } catch {
      setError("Error al eliminar");
    }
  };

  const openDetail = async (op: OportunidadFull) => {
    setSelectedOp(op);
    setShowDetailModal(true);
    try {
      const [actRes, cotRes] = await Promise.all([
        apiRequest("GET", `/api/pipeline/oportunidades/${op.id}/actividades`),
        apiRequest("GET", `/api/pipeline/oportunidades/${op.id}/cotizaciones`),
      ]);
      setActividadesData(await actRes.json());
      setCotizacionesData(await cotRes.json());
    } catch {}
  };

  const addActivity = async () => {
    if (!selectedOp || !newActivity.descripcion) return;
    try {
      await apiRequest("POST", `/api/pipeline/oportunidades/${selectedOp.id}/actividades`, newActivity);
      setNewActivity({ tipo: "nota", descripcion: "" });
      const res = await apiRequest("GET", `/api/pipeline/oportunidades/${selectedOp.id}/actividades`);
      setActividadesData(await res.json());
      fetchAll();
    } catch {}
  };

  const addCotizacion = async () => {
    if (!selectedOp || !newCotizacion.codigo) return;
    try {
      await apiRequest("POST", `/api/pipeline/oportunidades/${selectedOp.id}/cotizaciones`, {
        ...newCotizacion, monto: newCotizacion.monto || "0",
      });
      setNewCotizacion({ codigo: "", descripcion: "", monto: "" });
      const res = await apiRequest("GET", `/api/pipeline/oportunidades/${selectedOp.id}/cotizaciones`);
      setCotizacionesData(await res.json());
    } catch {}
  };

  const deleteCotizacion = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/pipeline/cotizaciones/${id}`);
      if (selectedOp) {
        const res = await apiRequest("GET", `/api/pipeline/oportunidades/${selectedOp.id}/cotizaciones`);
        setCotizacionesData(await res.json());
      }
    } catch {}
  };

  const openCreate = (etapaId?: number) => {
    const defaultEtapa = etapaId || (etapas.find(e => e.inicial)?.id) || (etapas[0]?.id) || "";
    setCreateForm({ nombre: "", clienteId: "", tipoNegocioId: "", productoId: "", etapaVentaId: String(defaultEtapa), valorEstimado: "", responsableId: "" });
    setPresetEtapaId(null);
    setShowCreateModal(true);
  };

  const openEdit = (op: OportunidadFull) => {
    setSelectedOp(op);
    setCreateForm({
      nombre: op.nombre,
      clienteId: op.clienteId ? String(op.clienteId) : "",
      tipoNegocioId: op.tipoNegocioId ? String(op.tipoNegocioId) : "",
      productoId: op.productoId ? String(op.productoId) : "",
      etapaVentaId: String(op.etapaVentaId),
      valorEstimado: op.valorEstimado,
      responsableId: op.responsableId ? String(op.responsableId) : "",
    });
    setShowEditModal(true);
  };

  const formatCurrency = (val: string | number) => {
    const n = typeof val === "string" ? parseFloat(val) : val;
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  };

  const getEstadoBadge = (estado: string) => {
    if (estado === "ganada") return "bg-green-100 text-green-700";
    if (estado === "perdida") return "bg-red-100 text-red-700";
    return "";
  };

  const activeOps = oportunidades.filter(op => op.estado === "activa");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#00aeef] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline de Ventas</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona tus oportunidades comerciales y acelera el cierre.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${view === "kanban" ? "bg-[#00aeef] text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
            <button
              onClick={() => setView("lista")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${view === "lista" ? "bg-[#00aeef] text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              <List className="w-4 h-4" />
              Lista
            </button>
          </div>
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
          >
            <Plus className="w-4 h-4" />
            Nueva Oportunidad
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Valor del Pipeline</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(stats.pipelineValue)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Oportunidades Activas</p>
            <p className="text-lg font-bold text-gray-900">{stats.activeCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Win Rate</p>
            <p className="text-lg font-bold text-gray-900">{stats.winRate}%</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500">En Riesgo</p>
            <p className="text-lg font-bold text-gray-900">{stats.atRiskCount}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg mb-4">{error}
          <button onClick={() => setError("")} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {view === "kanban" ? (
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max h-full">
            {etapas.map(etapa => {
              const etapaOps = activeOps.filter(op => op.etapaVentaId === etapa.id);
              return (
                <div
                  key={etapa.id}
                  className="w-[320px] flex-shrink-0 flex flex-col"
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => handleDrop(e, etapa.id)}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{etapa.etapa}</h3>
                      <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">{etapaOps.length}</span>
                    </div>
                    <button className="p-1 text-gray-400 hover:text-gray-600 rounded">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 bg-gray-50 rounded-xl p-2 space-y-2 min-h-[200px]">
                    {etapaOps.map(op => (
                      <div
                        key={op.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, op.id)}
                        onDragEnd={() => setDragId(null)}
                        className={`bg-white rounded-xl border-2 p-4 cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                          dragId === op.id ? "opacity-50 border-[#00aeef] border-dashed" : "border-gray-100"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md">{op.codigo}</span>
                          {op.diasInactividad > 7 && (
                            <span className="bg-red-50 text-red-500 text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> ESTANCADA
                            </span>
                          )}
                        </div>
                        <h4 className="font-semibold text-sm text-gray-900 mb-1 line-clamp-2">{op.nombre}</h4>
                        <p className="text-xs text-gray-500 mb-3">{op.cliente?.nombreNegocio || "Sin cliente"}</p>

                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-800">{formatCurrency(op.valorEstimado)}</span>
                          {op.responsable && (
                            <div className="w-7 h-7 rounded-full bg-[#00aeef] flex items-center justify-center" title={op.responsable.fullName}>
                              <span className="text-white text-[10px] font-bold">{getInitials(op.responsable.fullName || op.responsable.username)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-50">
                          <button onClick={() => openDetail(op)} className="p-1.5 text-gray-400 hover:text-[#00aeef] hover:bg-blue-50 rounded-lg transition" title="Ver detalle">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(op)} className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition" title="Editar">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(op.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1" />
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {op.diasInactividad}d
                          </span>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => openCreate(etapa.id)}
                      className="w-full py-2.5 text-sm text-gray-400 hover:text-[#00aeef] hover:bg-blue-50 rounded-lg transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Añadir tarjeta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Oportunidad</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Etapa</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Valor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Prob.</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Responsable</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {oportunidades.map(op => (
                  <tr key={op.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-md">{op.codigo}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{op.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{op.cliente?.nombreNegocio || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-lg">{op.etapa?.etapa}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{formatCurrency(op.valorEstimado)}</td>
                    <td className="px-4 py-3 text-gray-600">{op.probabilidad}%</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg capitalize ${getEstadoBadge(op.estado) || "bg-blue-50 text-blue-600"}`}>
                        {op.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{op.responsable?.fullName || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openDetail(op)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Eye className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => openEdit(op)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                        <button onClick={() => handleDelete(op.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {oportunidades.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No hay oportunidades registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{showEditModal ? "Editar Oportunidad" : "Nueva Oportunidad"}</h2>
              <button onClick={() => { setShowCreateModal(false); setShowEditModal(false); setSelectedOp(null); setShowNewCliente(false); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la oportunidad *</label>
                <input type="text" value={createForm.nombre} onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]" placeholder="Ej. Transporte Refrigerado" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Cliente</label>
                <div className="flex gap-2">
                  <select value={createForm.clienteId} onChange={e => setCreateForm({ ...createForm, clienteId: e.target.value })} className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]">
                    <option value="">Seleccionar cliente</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombreNegocio}</option>)}
                  </select>
                  <button type="button" onClick={() => { setShowNewCliente(!showNewCliente); setNewClienteError(""); }} className={`px-3 py-2.5 rounded-xl border transition flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${showNewCliente ? "bg-red-50 border-red-300 text-red-500 hover:bg-red-100" : "bg-[#00aeef]/10 border-[#00aeef]/30 text-[#00aeef] hover:bg-[#00aeef]/20"}`} title={showNewCliente ? "Cancelar" : "Crear nuevo cliente"}>
                    {showNewCliente ? <><X className="w-4 h-4" /> Cancelar</> : <><UserPlus className="w-4 h-4" /> Nuevo</>}
                  </button>
                </div>
                {showNewCliente && (
                  <div className="mt-3 p-4 bg-blue-50/50 border border-[#00aeef]/20 rounded-xl space-y-3">
                    <p className="text-xs font-semibold text-[#00aeef] flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Crear Nuevo Cliente</p>
                    {newClienteError && <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{newClienteError}</p>}
                    <input type="text" value={newClienteForm.nombreNegocio} onChange={e => setNewClienteForm({ ...newClienteForm, nombreNegocio: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00aeef]" placeholder="Nombre del negocio *" />
                    <div className="grid grid-cols-3 gap-3">
                      <input type="text" value={newClienteForm.codigo} onChange={e => setNewClienteForm({ ...newClienteForm, codigo: e.target.value })} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00aeef]" placeholder="Código (auto)" />
                      <select value={newClienteForm.tipo} onChange={e => setNewClienteForm({ ...newClienteForm, tipo: e.target.value })} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00aeef]">
                        <option value="Prospecto">Prospecto</option>
                        <option value="Cliente">Cliente</option>
                      </select>
                      <select value={newClienteForm.tipoNegocioId} onChange={e => setNewClienteForm({ ...newClienteForm, tipoNegocioId: e.target.value })} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00aeef]">
                        <option value="">Tipo negocio</option>
                        {tiposNeg.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={newClienteForm.nombreContacto} onChange={e => setNewClienteForm({ ...newClienteForm, nombreContacto: e.target.value })} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00aeef]" placeholder="Nombre de contacto" />
                      <input type="text" value={newClienteForm.telefonoContacto} onChange={e => setNewClienteForm({ ...newClienteForm, telefonoContacto: e.target.value })} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#00aeef]" placeholder="Teléfono" />
                    </div>
                    <button type="button" onClick={handleCreateCliente} disabled={newClienteLoading} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#00aeef] text-white text-sm font-medium rounded-lg hover:bg-[#0099d6] disabled:opacity-50 transition">
                      {newClienteLoading ? "Creando..." : <><Check className="w-4 h-4" /> Crear y Seleccionar Cliente</>}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de Negocio</label>
                  <select value={createForm.tipoNegocioId} onChange={e => setCreateForm({ ...createForm, tipoNegocioId: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]">
                    <option value="">Seleccionar</option>
                    {tiposNeg.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Producto</label>
                  <select value={createForm.productoId} onChange={e => setCreateForm({ ...createForm, productoId: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]">
                    <option value="">Seleccionar</option>
                    {productosLst.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Etapa de Venta *</label>
                  <select value={createForm.etapaVentaId} onChange={e => setCreateForm({ ...createForm, etapaVentaId: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]">
                    <option value="">Seleccionar</option>
                    {etapas.map(e => <option key={e.id} value={e.id}>{e.etapa}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor Estimado</label>
                  <input type="number" value={createForm.valorEstimado} onChange={e => setCreateForm({ ...createForm, valorEstimado: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Responsable</label>
                <select value={createForm.responsableId} onChange={e => setCreateForm({ ...createForm, responsableId: e.target.value })} className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]">
                  <option value="">Auto (yo)</option>
                  {usersLst.map(u => <option key={u.id} value={u.id}>{u.fullName || u.username}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-3">
                <button onClick={() => { setShowCreateModal(false); setShowEditModal(false); setSelectedOp(null); setShowNewCliente(false); }} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancelar</button>
                <button onClick={showEditModal ? handleUpdate : handleCreate} className="flex-1 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition">
                  {showEditModal ? "Guardar Cambios" : "Crear Oportunidad"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && selectedOp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Cerrar Oportunidad</h2>
              <button onClick={() => { setShowCloseModal(false); setSelectedOp(null); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{selectedOp.codigo}</strong> - {selectedOp.nombre}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Resultado</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCloseForm({ ...closeForm, estado: "ganada" })}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                      closeForm.estado === "ganada" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >Ganada</button>
                  <button
                    onClick={() => setCloseForm({ ...closeForm, estado: "perdida" })}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                      closeForm.estado === "perdida" ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >Perdida</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
                <textarea
                  value={closeForm.motivoCierre}
                  onChange={e => setCloseForm({ ...closeForm, motivoCierre: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef] resize-none"
                  rows={3}
                  placeholder="Describe el motivo del cierre..."
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowCloseModal(false); setSelectedOp(null); }} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancelar</button>
                <button
                  onClick={handleClose}
                  disabled={!closeForm.motivoCierre.trim()}
                  className="flex-1 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >Confirmar Cierre</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedOp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-md">{selectedOp.codigo}</span>
                <h2 className="text-lg font-bold">{selectedOp.nombre}</h2>
                <span className={`text-xs font-medium px-2 py-1 rounded-lg capitalize ${getEstadoBadge(selectedOp.estado) || "bg-blue-50 text-blue-600"}`}>
                  {selectedOp.estado}
                </span>
              </div>
              <button onClick={() => { setShowDetailModal(false); setSelectedOp(null); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 rounded-xl p-4">
              <div><span className="text-xs text-gray-500">Cliente</span><p className="text-sm font-medium">{selectedOp.cliente?.nombreNegocio || "-"}</p></div>
              <div><span className="text-xs text-gray-500">Producto</span><p className="text-sm font-medium">{selectedOp.producto?.nombre || "-"}</p></div>
              <div><span className="text-xs text-gray-500">Etapa</span><p className="text-sm font-medium">{selectedOp.etapa?.etapa}</p></div>
              <div><span className="text-xs text-gray-500">Probabilidad</span><p className="text-sm font-medium">{selectedOp.probabilidad}%</p></div>
              <div><span className="text-xs text-gray-500">Valor Estimado</span><p className="text-sm font-bold text-gray-900">{formatCurrency(selectedOp.valorEstimado)}</p></div>
              <div><span className="text-xs text-gray-500">Responsable</span><p className="text-sm font-medium">{selectedOp.responsable?.fullName || "-"}</p></div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Cotizaciones</h3>
              {cotizacionesData.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {cotizacionesData.map((cot: any) => (
                    <div key={cot.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div>
                        <span className="text-xs font-bold text-gray-700">{cot.codigo}</span>
                        <span className="text-xs text-gray-500 ml-2">{cot.descripcion}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatCurrency(cot.monto)}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${cot.estado === "aprobada" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>{cot.estado}</span>
                        <button onClick={() => deleteCotizacion(cot.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-400" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-3">Sin cotizaciones</p>
              )}
              <div className="flex gap-2">
                <input type="text" placeholder="Código" value={newCotizacion.codigo} onChange={e => setNewCotizacion({ ...newCotizacion, codigo: e.target.value })} className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#00aeef]" />
                <input type="text" placeholder="Descripción" value={newCotizacion.descripcion} onChange={e => setNewCotizacion({ ...newCotizacion, descripcion: e.target.value })} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#00aeef]" />
                <input type="number" placeholder="Monto" value={newCotizacion.monto} onChange={e => setNewCotizacion({ ...newCotizacion, monto: e.target.value })} className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#00aeef]" />
                <button onClick={addCotizacion} disabled={!newCotizacion.codigo} className="px-3 py-1.5 bg-[#00aeef] text-white rounded-lg text-xs font-medium hover:bg-[#0099d6] disabled:opacity-50">Agregar</button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Actividades</h3>
              <div className="flex gap-2 mb-4">
                <select value={newActivity.tipo} onChange={e => setNewActivity({ ...newActivity, tipo: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#00aeef]">
                  <option value="nota">Nota</option>
                  <option value="llamada">Llamada</option>
                  <option value="correo">Correo</option>
                  <option value="reunion">Reunión</option>
                </select>
                <input type="text" placeholder="Descripción de la actividad..." value={newActivity.descripcion} onChange={e => setNewActivity({ ...newActivity, descripcion: e.target.value })} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#00aeef]" />
                <button onClick={addActivity} disabled={!newActivity.descripcion} className="px-3 py-1.5 bg-[#00aeef] text-white rounded-lg text-xs font-medium hover:bg-[#0099d6] disabled:opacity-50">Registrar</button>
              </div>
              <div className="space-y-0 border-l-2 border-gray-200 ml-3">
                {actividadesData.map((act: any) => (
                  <div key={act.id} className="relative pl-6 pb-4">
                    <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-[#00aeef]" />
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        act.tipo === "llamada" ? "bg-green-100 text-green-700" :
                        act.tipo === "correo" ? "bg-purple-100 text-purple-700" :
                        act.tipo === "reunion" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{act.tipo}</span>
                      <span className="text-[10px] text-gray-400">{act.usuarioNombre || "Sistema"}</span>
                      <span className="text-[10px] text-gray-400">{new Date(act.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-xs text-gray-700">{act.descripcion}</p>
                  </div>
                ))}
                {actividadesData.length === 0 && (
                  <p className="pl-6 text-xs text-gray-400">Sin actividades registradas</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
