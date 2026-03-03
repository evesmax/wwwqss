import { useState, useEffect } from "react";
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
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Layers,
  X,
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
  totalPonderado: number;
  totalGanado: number;
  cumplimientoGeneral: number;
  oportunidadesTotales: number;
}

const periodoBadge: Record<string, string> = {
  Mensual: "bg-blue-100 text-blue-700",
  Trimestral: "bg-green-100 text-green-700",
  Semestral: "bg-amber-100 text-amber-700",
  Anual: "bg-purple-100 text-purple-700",
};

function formatMoney(val: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(val);
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
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

export default function KpiTrackingPage() {
  const [data, setData] = useState<{ kpis: KpiTracking[]; resumen: Resumen } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedKpi, setExpandedKpi] = useState<number | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<KpiTracking | null>(null);

  const fetchData = async () => {
    try {
      const res = await apiRequest("GET", "/api/pipeline/kpi-tracking");
      setData(await res.json());
    } catch {
      setError("Error al cargar datos de seguimiento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#00aeef] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-red-500 text-sm bg-red-50 p-4 rounded-lg">{error}</div>;
  }

  const { kpis: kpiList, resumen } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Seguimiento de KPIs</h1>
        <p className="text-gray-500 text-sm mt-1">Monitorea el cumplimiento de indicadores clave de rendimiento</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-[#00aeef]/10 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5 text-[#00aeef]" />
            </div>
            <span className="text-xs font-medium text-gray-400">KPIs Activos</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{resumen.totalKpis}</div>
          <p className="text-xs text-gray-500 mt-1">Indicadores registrados</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <span className={`text-xs font-semibold ${getCumplimientoColor(resumen.cumplimientoGeneral)}`}>
              {resumen.cumplimientoGeneral}%
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">Cumplimiento</div>
          <ProgressBar value={resumen.cumplimientoGeneral} color={getCumplimientoBg(resumen.cumplimientoGeneral)} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-xs font-medium text-gray-400">Meta Total</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatMoney(resumen.totalMeta)}</div>
          <p className="text-xs text-gray-500 mt-1">Ponderado: {formatMoney(resumen.totalPonderado)}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-gray-400">Oportunidades</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{resumen.oportunidadesTotales}</div>
          <p className="text-xs text-gray-500 mt-1">Activas en pipeline</p>
        </div>
      </div>

      {kpiList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay KPIs registrados. Crea uno desde el catálogo de KPIs.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {kpiList.map((kpi) => {
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
                        <div className="text-sm text-gray-500">Ponderado</div>
                        <div className={`text-lg font-bold ${getCumplimientoColor(kpi.cumplimiento)}`}>{formatMoney(kpi.valorPonderado)}</div>
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
                      <span>{formatMoney(kpi.valorPonderado)} de {formatMoney(kpi.metaValor)}</span>
                      <span>{kpi.cumplimiento}%</span>
                    </div>
                    <ProgressBar value={kpi.cumplimiento} color={getCumplimientoBg(kpi.cumplimiento)} />
                  </div>
                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="text-gray-500">
                      <span className="font-medium text-gray-700">{kpi.oportunidadesActivas}</span> oportunidades activas
                    </span>
                    <span className="text-gray-500">
                      <span className="font-medium text-green-600">{kpi.oportunidadesGanadas}</span> ganadas
                    </span>
                    <span className="text-gray-500">
                      <span className="font-medium text-gray-700">{kpi.etapasVinculadas.length}</span> etapas vinculadas
                    </span>
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
