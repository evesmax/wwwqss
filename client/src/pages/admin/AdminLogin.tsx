import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import qssLogo from "@assets/qss-logo.png";
import { Code2, Globe, Lightbulb, Rocket, Users, Shield } from "lucide-react";

interface AdminLoginProps {
  onLogin: (user: any) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const user = await res.json();
      onLogin(user);
    } catch (err: any) {
      setError(err.message?.includes("401") ? "Credenciales incorrectas" : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-[#003d5c] to-[#00aeef] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#00aeef]/15 blur-3xl" />
          <div className="absolute bottom-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#00aeef]/10 blur-3xl" />
          <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-white/5 blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <div className="bg-white/95 rounded-xl px-4 py-2 inline-block backdrop-blur-sm">
              <img src={qssLogo} alt="QSoftware Solutions" className="h-10 object-contain" />
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-white leading-tight">
                Impulsamos la
                <br />
                <span className="text-[#4dd4ff]">transformación digital</span>
                <br />
                de tu negocio.
              </h1>
              <p className="text-white/70 text-lg mt-4 max-w-md leading-relaxed">
                Desarrollamos soluciones de software innovadoras que optimizan operaciones, impulsan el crecimiento y generan valor real para nuestros clientes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-9 h-9 rounded-lg bg-[#00aeef]/30 flex items-center justify-center flex-shrink-0">
                  <Code2 className="w-5 h-5 text-[#4dd4ff]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Software SaaS</p>
                  <p className="text-white/50 text-xs mt-0.5">Productos escalables y robustos</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-9 h-9 rounded-lg bg-[#00aeef]/30 flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="w-5 h-5 text-[#4dd4ff]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Innovación</p>
                  <p className="text-white/50 text-xs mt-0.5">Tecnología de vanguardia</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-9 h-9 rounded-lg bg-[#00aeef]/30 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-[#4dd4ff]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Impacto Global</p>
                  <p className="text-white/50 text-xs mt-0.5">Desde Guadalajara al mundo</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-9 h-9 rounded-lg bg-[#00aeef]/30 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-[#4dd4ff]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Consultoría</p>
                  <p className="text-white/50 text-xs mt-0.5">Acompañamiento estratégico</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 text-white/40 text-sm">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              <span>5+ Productos SaaS</span>
            </div>
            <div className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Seguridad empresarial</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-8">
            <img src={qssLogo} alt="QSoftware Solutions" className="h-12 object-contain" />
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="text-center mb-8">
              <div className="hidden lg:flex justify-center mb-5">
                <img src={qssLogo} alt="QSoftware Solutions" className="h-11 object-contain" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
              <p className="text-gray-500 mt-1.5 text-sm">Ingresa tus credenciales para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00aeef] focus:border-transparent outline-none transition"
                  placeholder="Ingresa tu usuario"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00aeef] focus:border-transparent outline-none transition"
                  placeholder="Ingresa tu contraseña"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#00aeef] text-white font-semibold rounded-xl hover:bg-[#0099d6] transition disabled:opacity-50"
              >
                {loading ? "Ingresando..." : "Iniciar Sesión"}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-6">
              QSoftware Solutions &middot; Guadalajara, México
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
