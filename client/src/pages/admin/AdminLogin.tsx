import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-[#00aeef] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">Q</span>
              </div>
              <span className="text-xl font-bold text-gray-900">QSoftware</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
            <p className="text-gray-500 mt-1">Ingresa tus credenciales para continuar</p>
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
        </div>
      </div>
    </div>
  );
}
