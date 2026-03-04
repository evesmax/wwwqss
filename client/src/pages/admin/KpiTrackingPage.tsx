import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart3,
  Target,
  TrendingUp,
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Layers,
  X,
  Filter,
  Calendar,
  Check,
} from "lucide-react";

interface OportunidadKpi {
  id: number;
  codigo: string;
  nombre: string;
  valorEstimado: number;
  probabilidad: number;
  estado: string;
  diasInactividad: number;
}

interface EtapaVinculada {
  id: number;
  etapa: string;
  orden: number;
  probabilidad: number;
  oportunidades: OportunidadKpi[];
}

interface KpiTracking {
  id: number;
  codigoKpi: string;
  nombre: string;
  descripcion: string;
  metaValor: number;
  periodoEvaluacion: string;
  cumplimiento: number;
  valorTotal: number;
  valorPonderado: number;
  valorGanado: number;
  oportunidadesActivas: number;
  oportunidadesGanadas: number;
  etapasVinculadas: EtapaVinculada[];
}

interface Resumen {
  totalKpis: number;
  totalMeta: number;
  totalValor: number;
  totalPonderado: number;
  totalGanado: number;
  cumplimientoGeneral: number;
  oportunidadesTotales: number;
}

interface KpiOption {
  id: number;
  codigoKpi: string;
  kpi: string;
  periodoEvaluacion: string;
}

const periodoBadge: Record<string, string> = {
  Mensual: "bg-blue-100 text-blue-700",
  Trimestral: "bg-green-100 text-green-700",
  Semestral: "bg-amber-100 text-amber-700",
  Anual: "bg-purple-100 text-purple-700",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TRIMESTRES = ["Q1 (Ene-Mar)", "Q2 (Abr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dic)"];
const SEMESTRES = ["S1 (Ene-Jun)", "S2 (Jul-Dic)"];

function formatMoney(val: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(val);
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function getCumplimientoColor(val: number) {
  if (val >= 80) return "text-green-600";
  if (val >= 50) return "text-amber-600";
  return "text-red-500";
}

function getCumplimientoBg(val: number) {
  if (val >= 80) return "bg-green-500";
  if (val >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function getCumplimientoLabel(val: number) {
  if (val >= 80) return "En Meta";
  if (val >= 50) return "En Progreso";
  return "Bajo Meta";
}

function getDateRange(periodo: string, year: number, subIndex: number): { desde: string; hasta: string } {
  switch (periodo) {
    case "Mensual": {
      const desde = new Date(year, subIndex, 1);
      const hasta = new Date(year, subIndex + 1, 0);
      return { desde: desde.toISOString().split("T")[0], hasta: hasta.toISOString().split("T")[0] };
    }
    case "Trimestral": {
      const startMonth = subIndex * 3;
      const desde = new Date(year, startMonth, 1);
      const hasta = new Date(year, startMonth + 3, 0);
      return { desde: desde.toISOString().split("T")[0], hasta: hasta.toISOString().split("T")[0] };
    }
    case "Semestral": {
      const startMonth = subIndex * 6;
      const desde = new Date(year, startMonth, 1);
      const hasta = new Date(year, startMonth + 6, 0);
      return { desde: desde.toISOString().split("T")[0], hasta: hasta.toISOString().split("T")[0] };
    }
    case "Anual": {
      const desde = new Date(year, 0, 1);
      const hasta = new Date(year, 11, 31);
      return { desde: desde.toISOString().split("T")[0], hasta: hasta.toISOString().split("T")[0] };
    }
    default:
      return { desde: "", hasta: "" };
  }
}

function getCurrentSubIndex(periodo: string): number {
  const now = new Date();
  const month = now.getMonth();
  switch (periodo) {
    case "Mensual": return month;
    case "Trimestral": return Math.floor(month / 3);
    case "Semestral": return Math.floor(month / 6);
    case "Anual": return 0;
    default: return 0;
  }
}

function getSubOptions(periodo: string): string[] {
  switch (periodo) {
    case "Mensual": return MESES;
    case "Trimestral": return TRIMESTRES;
    case "Semestral": return SEMESTRES;
    case "Anual": return [];
    default: return [];
  }
}

function getPeriodoLabel(periodo: string, subIndex: number, year: number): string {
  switch (periodo) {
    case "Mensual": return `${MESES[subIndex]} ${year}`;
    case "Trimestral": return `${TRIMESTRES[subIndex]} ${year}`;
    case "Semestral": return `${SEMESTRES[subIndex]} ${year}`;
    case "Anual": return `${year}`;
    default: return "";
  }
}

export default function KpiTrackingPage() {
  const [data, setData] = useState<{ kpis: KpiTracking[]; resumen: Resumen } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedKpi, setExpandedKpi] = useState<number | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<KpiTracking | null>(null);

  const [allKpiOptions, setAllKpiOptions] = useState<KpiOption[]>([]);
  const [selectedKpiIds, setSelectedKpiIds] = useState<Set<number>>(new Set());
  const [showKpiFilter, setShowKpiFilter] = useState(false);

  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterPeriodo, setFilterPeriodo] = useState("Mensual");
  const [filterSubIndex, setFilterSubIndex] = useState(getCurrentSubIndex("Mensual"));
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customDesde, setCustomDesde] = useState("");
  const [customHasta, setCustomHasta] = useState("");

  const fetchKpiOptions = async () => {
    try {
      const res = await apiRequest("GET", "/api/catalog/kpis");
      const kpis: KpiOption[] = await res.json();
      setAllKpiOptions(kpis);
    } catch {}
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let params = "";
      if (useCustomRange) {
        if (customDesde) params += `desde=${customDesde}`;
        if (customHasta) params += `${params ? "&" : ""}hasta=${customHasta}`;
      } else {
        const range = getDateRange(filterPeriodo, filterYear, filterSubIndex);
        params = `desde=${range.desde}&hasta=${range.hasta}`;
      }
      const res = await apiRequest("GET", `/api/pipeline/kpi-tracking${params ? "?" + params : ""}`);
      setData(await res.json());
    } catch {
      setError("Error al cargar datos de seguimiento");
    } finally {
      setLoading(false);
    }
  }, [filterPeriodo, filterYear, filterSubIndex, useCustomRange, customDesde, customHasta]);

  useEffect(() => {
    fetchKpiOptions();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleKpiFilter = (id: number) => {
    setSelectedKpiIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearKpiFilter = () => {
    setSelectedKpiIds(new Set());
  };

  const filteredKpis = data?.kpis.filter(k => selectedKpiIds.size === 0 || selectedKpiIds.has(k.id)) ?? [];

  const filteredResumen: Resumen = selectedKpiIds.size === 0 || !data
    ? (data?.resumen ?? { totalKpis: 0, totalMeta: 0, totalValor: 0, totalPonderado: 0, totalGanado: 0, cumplimientoGeneral: 0, oportunidadesTotales: 0 })
    : {
        totalKpis: filteredKpis.length,
        totalMeta: filteredKpis.reduce((s, k) => s + k.metaValor, 0),
        totalValor: filteredKpis.reduce((s, k) => s + k.valorTotal, 0),
        totalPonderado: filteredKpis.reduce((s, k) => s + k.valorPonderado, 0),
        totalGanado: filteredKpis.reduce((s, k) => s + k.valorGanado, 0),
        cumplimientoGeneral: (() => {
          const m = filteredKpis.reduce((s, k) => s + k.metaValor, 0);
          const v = filteredKpis.reduce((s, k) => s + k.valorTotal, 0);
          return m > 0 ? Math.min(100, Math.round((v / m) * 100)) : 0;
        })(),
        oportunidadesTotales: filteredKpis.reduce((s, k) => s + k.oportunidadesActivas, 0),
      };

  const subOptions = getSubOptions(filterPeriodo);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const currentPeriodoLabel = useCustomRange
    ? `${customDesde || "..."} — ${customHasta || "..."}`
    : getPeriodoLabel(filterPeriodo, filterSubIndex, filterYear);

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seguimiento de KPIs</h1>
          <p className="text-gray-500 text-sm mt-1">Monitorea el cumplimiento de indicadores clave de rendimiento</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-700">{currentPeriodoLabel}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filtros</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">KPIs</label>
            <button
              onClick={() => setShowKpiFilter(!showKpiFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-left bg-white hover:bg-gray-50 transition flex items-center justify-between"
            >
              <span className="truncate text-gray-700">
                {selectedKpiIds.size === 0
                  ? "Todos los KPIs"
                  : `${selectedKpiIds.size} seleccionado${selectedKpiIds.size > 1 ? "s" : ""}`}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
            {showKpiFilter && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-64 overflow-y-auto">
                <button
                  onClick={clearKpiFilter}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 ${selectedKpiIds.size === 0 ? "text-[#00aeef] font-medium" : "text-gray-600"}`}
                >
                  {selectedKpiIds.size === 0 && <Check className="w-3.5 h-3.5" />}
                  <span className={selectedKpiIds.size === 0 ? "" : "ml-5"}>Todos los KPIs</span>
                </button>
                {allKpiOptions.map((kpi) => {
                  const isSelected = selectedKpiIds.has(kpi.id);
                  return (
                    <button
                      key={kpi.id}
                      onClick={() => toggleKpiFilter(kpi.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${isSelected ? "text-[#00aeef] font-medium" : "text-gray-700"}`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[#00aeef] border-[#00aeef]" : "border-gray-300"}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="truncate">{kpi.codigoKpi} - {kpi.kpi}</span>
                      <span className={`ml-auto text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${periodoBadge[kpi.periodoEvaluacion] || "bg-gray-100 text-gray-600"}`}>
                        {kpi.periodoEvaluacion}
                      </span>
                    </button>
                  );
                })}
                <div className="p-2 border-t border-gray-100">
                  <button
                    onClick={() => setShowKpiFilter(false)}
                    className="w-full py-1.5 text-xs font-medium text-[#00aeef] hover:bg-[#00aeef]/5 rounded-lg transition"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Periodo</label>
            <div className="flex rounded-xl border border-gray-300 overflow-hidden">
              {["Mensual", "Trimestral", "Semestral", "Anual"].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setFilterPeriodo(p);
                    setFilterSubIndex(getCurrentSubIndex(p));
                    setUseCustomRange(false);
                  }}
                  className={`flex-1 py-2 text-xs font-medium transition ${
                    !useCustomRange && filterPeriodo === p
                      ? "bg-[#00aeef] text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.slice(0, 4)}.
                </button>
              ))}
            </div>
          </div>

          {!useCustomRange && subOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {filterPeriodo === "Mensual" ? "Mes" : filterPeriodo === "Trimestral" ? "Trimestre" : "Semestre"}
              </label>
              <select
                value={filterSubIndex}
                onChange={(e) => setFilterSubIndex(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00aeef] bg-white"
              >
                {subOptions.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Año</label>
            {!useCustomRange ? (
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00aeef] bg-white"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setUseCustomRange(false)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
              >
                Volver a periodo
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setUseCustomRange(!useCustomRange)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
              useCustomRange ? "bg-[#00aeef] text-white border-[#00aeef]" : "text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            Rango personalizado
          </button>

          {useCustomRange && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customDesde}
                onChange={(e) => setCustomDesde(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#00aeef]"
              />
              <span className="text-xs text-gray-400">a</span>
              <input
                type="date"
                value={customHasta}
                onChange={(e) => setCustomHasta(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#00aeef]"
              />
            </div>
          )}

          {selectedKpiIds.size > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {Array.from(selectedKpiIds).map(id => {
                const kpi = allKpiOptions.find(k => k.id === id);
                return kpi ? (
                  <span key={id} className="inline-flex items-center gap-1 text-xs bg-[#00aeef]/10 text-[#00aeef] px-2 py-1 rounded-lg font-medium">
                    {kpi.codigoKpi}
                    <button onClick={() => toggleKpiFilter(id)} className="hover:text-red-500 transition">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ) : null;
              })}
              <button onClick={clearKpiFilter} className="text-xs text-gray-400 hover:text-gray-600 ml-1">
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-[#00aeef]/10 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5 text-[#00aeef]" />
            </div>
            <span className="text-xs font-medium text-gray-400">KPIs</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{filteredResumen.totalKpis}</div>
          <p className="text-xs text-gray-500 mt-1">{selectedKpiIds.size > 0 ? "Filtrados" : "Registrados"}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <span className={`text-xs font-semibold ${getCumplimientoColor(filteredResumen.cumplimientoGeneral)}`}>
              {filteredResumen.cumplimientoGeneral}%
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">Cumplimiento</div>
          <ProgressBar value={filteredResumen.cumplimientoGeneral} color={getCumplimientoBg(filteredResumen.cumplimientoGeneral)} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-xs font-medium text-gray-400">Meta Total</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatMoney(filteredResumen.totalMeta)}</div>
          <p className="text-xs text-gray-500 mt-1">Total: {formatMoney(filteredResumen.totalValor || 0)} | Pond: {formatMoney(filteredResumen.totalPonderado)}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-gray-400">Oportunidades</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{filteredResumen.oportunidadesTotales}</div>
          <p className="text-xs text-gray-500 mt-1">En el periodo</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-8 h-8 border-4 border-[#00aeef] border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="text-red-500 text-sm bg-red-50 p-4 rounded-lg">{error}</div>
      ) : filteredKpis.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {selectedKpiIds.size > 0
              ? "No hay datos para los KPIs seleccionados en este periodo."
              : "No hay KPIs registrados. Crea uno desde el catálogo de KPIs."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredKpis.map((kpi) => {
            const isExpanded = expandedKpi === kpi.id;
            return (
              <div key={kpi.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedKpi(isExpanded ? null : kpi.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#00aeef] to-[#0077b6] rounded-xl flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{kpi.codigoKpi}</span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${periodoBadge[kpi.periodoEvaluacion] || "bg-gray-100 text-gray-700"}`}>
                            <Clock className="w-3 h-3" />
                            {kpi.periodoEvaluacion}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${
                            kpi.cumplimiento >= 80 ? "bg-green-100 text-green-700" :
                            kpi.cumplimiento >= 50 ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {kpi.cumplimiento >= 80 ? <CheckCircle2 className="w-3 h-3" /> : kpi.cumplimiento >= 50 ? <ArrowUpRight className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {getCumplimientoLabel(kpi.cumplimiento)}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{kpi.nombre}</h3>
                        {kpi.descripcion && <p className="text-sm text-gray-500 mt-0.5 truncate">{kpi.descripcion}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-right hidden md:block">
                        <div className="text-sm text-gray-500">Meta</div>
                        <div className="text-lg font-bold text-gray-900">{formatMoney(kpi.metaValor)}</div>
                      </div>
                      <div className="text-right hidden md:block">
                        <div className="text-sm text-gray-500">Valor Total</div>
                        <div className={`text-lg font-bold ${getCumplimientoColor(kpi.cumplimiento)}`}>{formatMoney(kpi.valorTotal)}</div>
                      </div>
                      <div className="text-right hidden md:block">
                        <div className="text-sm text-gray-500">Ponderado</div>
                        <div className="text-lg font-bold text-gray-500">{formatMoney(kpi.valorPonderado)}</div>
                      </div>
                      <div className="text-right hidden lg:block">
                        <div className="text-sm text-gray-500">Cumplimiento</div>
                        <div className={`text-2xl font-bold ${getCumplimientoColor(kpi.cumplimiento)}`}>{kpi.cumplimiento}%</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedKpi(kpi); }}
                          className="p-2 hover:bg-[#00aeef]/10 rounded-lg transition text-[#00aeef]"
                          title="Ver análisis detallado"
                        >
                          <Layers className="w-5 h-5" />
                        </button>
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{formatMoney(kpi.valorTotal)} de {formatMoney(kpi.metaValor)}</span>
                      <span>{kpi.cumplimiento}%</span>
                    </div>
                    <ProgressBar value={kpi.cumplimiento} color={getCumplimientoBg(kpi.cumplimiento)} />
                  </div>
                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="text-gray-500"><span className="font-medium text-gray-700">{kpi.oportunidadesActivas}</span> oportunidades activas</span>
                    <span className="text-gray-500"><span className="font-medium text-green-600">{kpi.oportunidadesGanadas}</span> ganadas</span>
                    <span className="text-gray-500"><span className="font-medium text-gray-700">{kpi.etapasVinculadas.length}</span> etapas vinculadas</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                      <div className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">Valor Total (sin ponderar)</div>
                        <div className="text-xl font-bold text-gray-900">{formatMoney(kpi.valorTotal)}</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">Valor Ponderado</div>
                        <div className={`text-xl font-bold ${getCumplimientoColor(kpi.cumplimiento)}`}>{formatMoney(kpi.valorPonderado)}</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">Valor Ganado</div>
                        <div className="text-xl font-bold text-green-600">{formatMoney(kpi.valorGanado)}</div>
                      </div>
                    </div>

                    {kpi.etapasVinculadas.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        Este KPI no tiene etapas de venta vinculadas.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700">Etapas Vinculadas y Oportunidades</h4>
                        {kpi.etapasVinculadas
                          .sort((a, b) => a.orden - b.orden)
                          .map((etapa) => (
                          <div key={etapa.id} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                            <div className="px-4 py-3 flex items-center justify-between bg-gray-50/50">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[#00aeef]/10 rounded-lg flex items-center justify-center">
                                  <span className="text-xs font-bold text-[#00aeef]">{etapa.orden}</span>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-900 text-sm">{etapa.etapa}</span>
                                  <span className="text-xs text-gray-400 ml-2">({etapa.probabilidad}% prob.)</span>
                                </div>
                              </div>
                              <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                                {etapa.oportunidades.length} oportunidades
                              </span>
                            </div>
                            {etapa.oportunidades.length > 0 && (
                              <div className="divide-y divide-gray-100">
                                {etapa.oportunidades.map((op) => (
                                  <div key={op.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{op.codigo}</span>
                                      <span className="text-gray-700">{op.nombre}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      {op.diasInactividad > 7 && (
                                        <span className="flex items-center gap-1 text-xs text-red-500">
                                          <AlertTriangle className="w-3 h-3" />
                                          {op.diasInactividad}d inactiva
                                        </span>
                                      )}
                                      <span className="text-gray-500 text-xs">{op.probabilidad}%</span>
                                      <span className="font-medium text-gray-900">{formatMoney(op.valorEstimado)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedKpi && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{selectedKpi.codigoKpi}</span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${periodoBadge[selectedKpi.periodoEvaluacion] || "bg-gray-100 text-gray-700"}`}>
                    <Clock className="w-3 h-3" />
                    {selectedKpi.periodoEvaluacion}
                  </span>
                  <span className="text-xs text-gray-400">{currentPeriodoLabel}</span>
                </div>
                <h2 className="text-lg font-bold text-gray-900">{selectedKpi.nombre}</h2>
              </div>
              <button onClick={() => setSelectedKpi(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Meta</div>
                  <div className="text-lg font-bold text-gray-900">{formatMoney(selectedKpi.metaValor)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Ponderado</div>
                  <div className={`text-lg font-bold ${getCumplimientoColor(selectedKpi.cumplimiento)}`}>{formatMoney(selectedKpi.valorPonderado)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Ganado</div>
                  <div className="text-lg font-bold text-green-600">{formatMoney(selectedKpi.valorGanado)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Cumplimiento</div>
                  <div className={`text-lg font-bold ${getCumplimientoColor(selectedKpi.cumplimiento)}`}>{selectedKpi.cumplimiento}%</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                  <span>Progreso hacia la meta</span>
                  <span>{selectedKpi.cumplimiento}%</span>
                </div>
                <ProgressBar value={selectedKpi.cumplimiento} color={getCumplimientoBg(selectedKpi.cumplimiento)} />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#00aeef]" />
                  Cruce: KPI vs Oportunidades por Etapa
                </h3>

                {selectedKpi.etapasVinculadas.length === 0 ? (
                  <div className="bg-gray-50 rounded-xl p-8 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No hay etapas de venta vinculadas a este KPI.</p>
                    <p className="text-gray-400 text-xs mt-1">Vincula etapas desde el catálogo de Etapas de Venta.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedKpi.etapasVinculadas
                      .sort((a, b) => a.orden - b.orden)
                      .map((etapa) => {
                      const etapaValorTotal = etapa.oportunidades.reduce((s, o) => s + o.valorEstimado, 0);
                      const etapaValorPonderado = etapa.oportunidades.reduce((s, o) => s + o.valorEstimado * (o.probabilidad / 100), 0);
                      const etapaContribPct = selectedKpi.metaValor > 0 ? Math.round((etapaValorPonderado / selectedKpi.metaValor) * 100) : 0;

                      return (
                        <div key={etapa.id} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-gradient-to-r from-gray-50 to-white px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[#00aeef] rounded-lg flex items-center justify-center">
                                  <span className="text-xs font-bold text-white">{etapa.orden}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-900">{etapa.etapa}</span>
                                  <span className="text-xs text-gray-400 ml-2">Probabilidad: {etapa.probabilidad}%</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-gray-500">Contribución a meta</div>
                                <div className={`text-sm font-bold ${getCumplimientoColor(etapaContribPct > 20 ? 80 : etapaContribPct > 5 ? 50 : 20)}`}>{etapaContribPct}%</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <span className="text-gray-500">Oportunidades</span>
                                <div className="font-bold text-gray-900">{etapa.oportunidades.length}</div>
                              </div>
                              <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <span className="text-gray-500">Valor Total</span>
                                <div className="font-bold text-gray-900">{formatMoney(etapaValorTotal)}</div>
                              </div>
                              <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <span className="text-gray-500">Ponderado</span>
                                <div className={`font-bold ${getCumplimientoColor(etapaContribPct > 20 ? 80 : 50)}`}>{formatMoney(Math.round(etapaValorPonderado))}</div>
                              </div>
                            </div>
                          </div>

                          {etapa.oportunidades.length > 0 && (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 border-t border-gray-200">
                                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Código</th>
                                  <th className="text-left px-4 py-2 font-semibold text-gray-500">Oportunidad</th>
                                  <th className="text-right px-4 py-2 font-semibold text-gray-500">Valor</th>
                                  <th className="text-right px-4 py-2 font-semibold text-gray-500">Prob.</th>
                                  <th className="text-right px-4 py-2 font-semibold text-gray-500">Ponderado</th>
                                  <th className="text-right px-4 py-2 font-semibold text-gray-500">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {etapa.oportunidades.map((op) => (
                                  <tr key={op.id} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2">
                                      <span className="font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{op.codigo}</span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">{op.nombre}</td>
                                    <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMoney(op.valorEstimado)}</td>
                                    <td className="px-4 py-2 text-right text-gray-500">{op.probabilidad}%</td>
                                    <td className="px-4 py-2 text-right font-medium text-[#00aeef]">{formatMoney(Math.round(op.valorEstimado * op.probabilidad / 100))}</td>
                                    <td className="px-4 py-2 text-right">
                                      {op.diasInactividad > 7 ? (
                                        <span className="inline-flex items-center gap-1 text-red-500">
                                          <AlertTriangle className="w-3 h-3" />
                                          {op.diasInactividad}d
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-green-600">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Activa
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
