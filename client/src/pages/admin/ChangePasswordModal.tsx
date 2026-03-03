import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      await apiRequest("PUT", "/api/auth/password", { currentPassword, newPassword });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Contraseña actual incorrecta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">Cambiar Contraseña</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="bg-green-50 text-green-600 p-4 rounded-lg text-center">
            Contraseña actualizada correctamente
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nueva contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                required
              />
            </div>
            {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#00aeef] text-white font-semibold rounded-xl hover:bg-[#0099d6] disabled:opacity-50 transition"
            >
              {loading ? "Actualizando..." : "Actualizar Contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
