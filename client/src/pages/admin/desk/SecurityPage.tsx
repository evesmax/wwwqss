import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export default function SecurityPage({ user, onChanged }: { user: any; onChanged: (patch: any) => void }) {
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e: any) {
      setMsg({ kind: "err", text: e.message?.includes("400") ? "Código incorrecto" : "No se pudo completar la operación" });
    } finally { setBusy(false); }
  };

  const start = () => run(async () => {
    const res = await apiRequest("POST", "/api/auth/mfa/setup", {});
    setSetup(await res.json());
  });
  const enable = () => run(async () => {
    await apiRequest("POST", "/api/auth/mfa/enable", { token: code.trim() });
    setSetup(null); setCode("");
    onChanged({ totpEnabled: true });
    setMsg({ kind: "ok", text: "Verificación en dos pasos activada." });
  });
  const disable = () => run(async () => {
    await apiRequest("POST", "/api/auth/mfa/disable", { token: code.trim() });
    setCode("");
    onChanged({ totpEnabled: false });
    setMsg({ kind: "ok", text: "Verificación en dos pasos desactivada." });
  });

  return (
    <div className="max-w-xl p-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Seguridad</h1>
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-800">Verificación en dos pasos (TOTP)</p>
            <p className="text-sm text-gray-500">Usa una app como Google Authenticator o 1Password.</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${user.totpEnabled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {user.totpEnabled ? "Activada" : "Desactivada"}
          </span>
        </div>

        {!user.totpEnabled && !setup && (
          <button onClick={start} disabled={busy} className="px-4 py-2 bg-[#00aeef] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            Activar
          </button>
        )}

        {setup && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Escanea el código QR y escribe el código de 6 dígitos que muestra la app.</p>
            <img src={setup.qrDataUrl} alt="Código QR de TOTP" className="w-48 h-48 border rounded" />
            <p className="text-xs text-gray-500 break-all">Clave manual: <code>{setup.secret}</code></p>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6} inputMode="numeric"
                className="border rounded-lg px-3 py-2 tracking-widest w-32 text-center" placeholder="000000" />
              <button onClick={enable} disabled={busy || code.length !== 6} className="px-4 py-2 bg-[#00aeef] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                Confirmar
              </button>
            </div>
          </div>
        )}

        {user.totpEnabled && (
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6} inputMode="numeric"
              className="border rounded-lg px-3 py-2 tracking-widest w-32 text-center" placeholder="000000" />
            <button onClick={disable} disabled={busy || code.length !== 6} className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-semibold disabled:opacity-50">
              Desactivar
            </button>
          </div>
        )}

        {msg && <div className={`text-sm p-3 rounded-lg border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}
