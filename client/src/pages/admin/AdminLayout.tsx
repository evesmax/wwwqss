import { useState } from "react";
import { useLocation } from "wouter";
import {
  Shield,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Key,
  Menu,
  X,
  MessageCircle,
  BookOpen,
  Building2,
  GitBranch,
  Package,
  BarChart3,
  Briefcase,
} from "lucide-react";
import ChangePasswordModal from "./ChangePasswordModal";
import GeminiChat from "./GeminiChat";
import qssLogo from "@assets/qss-logo.png";

interface AdminLayoutProps {
  user: any;
  onLogout: () => void;
  children: React.ReactNode;
}

const mainMenuItems = [
  { path: "/roles", label: "Roles y Permisos", icon: Shield },
  { path: "/users", label: "Alta de Usuarios", icon: Users },
];

const catalogMenuItems = [
  { path: "/catalogs/tipos-negocio", label: "Tipos de Negocio", icon: Briefcase },
  { path: "/catalogs/clientes", label: "Clientes", icon: Building2 },
  { path: "/catalogs/etapas-venta", label: "Etapas de Venta", icon: GitBranch },
  { path: "/catalogs/productos", label: "Productos", icon: Package },
  { path: "/catalogs/kpis", label: "KPIs", icon: BarChart3 },
];

export default function AdminLayout({ user, onLogout, children }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [location, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catalogsOpen, setCatalogsOpen] = useState(() => location.startsWith("/catalogs"));

  const renderMenuItem = (item: typeof mainMenuItems[0]) => {
    const Icon = item.icon;
    const isActive = location === item.path;
    return (
      <button
        key={item.path}
        onClick={() => {
          navigate(item.path);
          setMobileMenuOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
          isActive
            ? "bg-[#00aeef]/10 text-[#00aeef]"
            : "text-gray-600 hover:bg-gray-100"
        } ${collapsed ? "justify-center" : ""}`}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </button>
    );
  };

  const isCatalogActive = location.startsWith("/catalogs");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${
          collapsed ? "w-20" : "w-64"
        } ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className={`flex items-center gap-3 p-4 border-b border-gray-100 ${collapsed ? "justify-center" : ""}`}>
          {collapsed ? (
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
              <img src={qssLogo} alt="QSS" className="w-9 h-9 object-contain" />
            </div>
          ) : (
            <img src={qssLogo} alt="QSoftware Solutions" className="h-9 object-contain" />
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {mainMenuItems.map(renderMenuItem)}

          <div className="pt-2">
            {collapsed ? (
              <button
                onClick={() => {
                  setCollapsed(false);
                  setCatalogsOpen(true);
                }}
                className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isCatalogActive
                    ? "bg-[#00aeef]/10 text-[#00aeef]"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                title="Catálogos"
              >
                <BookOpen className="w-5 h-5" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setCatalogsOpen(!catalogsOpen)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isCatalogActive
                      ? "bg-[#00aeef]/10 text-[#00aeef]"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <BookOpen className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-left">Catálogos</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${catalogsOpen ? "rotate-180" : ""}`} />
                </button>

                {catalogsOpen && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-3">
                    {catalogMenuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;
                      return (
                        <button
                          key={item.path}
                          onClick={() => {
                            navigate(item.path);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                            isActive
                              ? "bg-[#00aeef]/10 text-[#00aeef] font-medium"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </nav>

        <div className="border-t border-gray-100 p-3 space-y-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition hidden lg:flex"
            title={collapsed ? "Expandir menú" : "Minimizar menú"}
          >
            {collapsed ? <ChevronRight className="w-5 h-5 mx-auto" /> : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span>Minimizar</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowPassword(true)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Cambiar contraseña" : undefined}
          >
            <Key className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Cambiar contraseña</span>}
          </button>

          <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-8 h-8 rounded-full bg-[#00aeef] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user.fullName?.charAt(0)?.toUpperCase() || user.username?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.fullName || user.username}</p>
                <p className="text-xs text-gray-500 truncate">{user.roles?.join(", ")}</p>
              </div>
            )}
          </div>

          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Cerrar sesión" : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowChat(!showChat)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              showChat
                ? "bg-[#00aeef] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {showChat ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
            <span className="hidden sm:inline">Asistente IA</span>
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
      {showChat && <GeminiChat onClose={() => setShowChat(false)} />}
    </div>
  );
}
