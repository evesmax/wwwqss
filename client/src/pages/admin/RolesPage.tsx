import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, Shield } from "lucide-react";

interface Permission {
  id: number;
  key: string;
  description: string;
  module: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: { permissionId: number; permissionKey: string; permissionDesc: string }[];
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "", description: "", permissionIds: [] as number[] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiRequest("GET", "/api/admin/roles"),
        apiRequest("GET", "/api/admin/permissions"),
      ]);
      setRoles(await rolesRes.json());
      setPermissions(await permsRes.json());
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
    setForm({ name: "", description: "", permissionIds: [] });
    setShowModal(true);
    setError("");
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description,
      permissionIds: role.permissions.map((p) => p.permissionId),
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    try {
      if (editing) {
        await apiRequest("PUT", `/api/admin/roles/${editing.id}`, form);
      } else {
        await apiRequest("POST", "/api/admin/roles", form);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "El nombre del rol ya existe" : "Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este rol?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/roles/${id}`);
      fetchData();
    } catch {
      setError("Error al eliminar");
    }
  };

  const togglePermission = (permId: number) => {
    setForm((prev) => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(permId)
        ? prev.permissionIds.filter((id) => id !== permId)
        : [...prev.permissionIds, permId],
    }));
  };

  const groupedPermissions = permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

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
          <h1 className="text-2xl font-bold text-gray-900">Roles y Permisos</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona los roles y sus permisos asignados</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Rol
        </button>
      </div>

      <div className="grid gap-4">
        {roles.map((role) => (
          <div key={role.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#00aeef]/10 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-[#00aeef]" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{role.name}</h3>
                  <p className="text-sm text-gray-500">{role.description}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(role)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => handleDelete(role.id)} className="p-2 hover:bg-red-50 rounded-lg transition">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
            {role.permissions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {role.permissions.map((p) => (
                  <span key={p.permissionId} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg font-medium">
                    {p.permissionKey}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {roles.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No hay roles registrados. Crea el primero.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editing ? "Editar Rol" : "Nuevo Rol"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del rol</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Ej. Editor"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Descripción del rol"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Permisos</label>
                {Object.entries(groupedPermissions).map(([module, perms]) => (
                  <div key={module} className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{module}</p>
                    <div className="space-y-2">
                      {perms.map((p) => (
                        <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.permissionIds.includes(p.id)}
                            onChange={() => togglePermission(p.id)}
                            className="w-4 h-4 rounded text-[#00aeef] focus:ring-[#00aeef]"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700">{p.key}</span>
                            <span className="text-xs text-gray-400 ml-2">{p.description}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {permissions.length === 0 && (
                  <p className="text-sm text-gray-400">No hay permisos disponibles</p>
                )}
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
                  {editing ? "Guardar Cambios" : "Crear Rol"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
