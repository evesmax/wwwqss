import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, X, UserCheck, UserX } from "lucide-react";

interface Role {
  id: number;
  name: string;
}

interface UserItem {
  id: number;
  username: string;
  fullName: string;
  email: string;
  active: boolean;
  avatarUrl: string | null;
  createdAt: string;
  roles: { roleId: number; roleName: string }[];
}

export default function UsersPage() {
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    active: true,
    roleIds: [] as number[],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiRequest("GET", "/api/admin/users"),
        apiRequest("GET", "/api/admin/roles"),
      ]);
      setUsersList(await usersRes.json());
      setAllRoles(await rolesRes.json());
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
    setForm({ username: "", password: "", fullName: "", email: "", active: true, roleIds: [] });
    setShowModal(true);
    setError("");
  };

  const openEdit = (user: UserItem) => {
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      fullName: user.fullName,
      email: user.email,
      active: user.active,
      roleIds: user.roles.map((r) => r.roleId),
    });
    setShowModal(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    if (!form.username) {
      setError("El nombre de usuario es requerido");
      return;
    }
    if (!editing && !form.password) {
      setError("La contraseña es requerida");
      return;
    }

    try {
      const data = { ...form };
      if (editing && !data.password) {
        const { password, ...rest } = data;
        await apiRequest("PUT", `/api/admin/users/${editing.id}`, rest);
      } else if (editing) {
        await apiRequest("PUT", `/api/admin/users/${editing.id}`, data);
      } else {
        await apiRequest("POST", "/api/admin/users", data);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "El nombre de usuario ya existe" : "Error al guardar");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este usuario?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
      fetchData();
    } catch (err: any) {
      setError(err.message?.includes("400") ? "No puedes eliminar tu propio usuario" : "Error al eliminar");
    }
  };

  const toggleRole = (roleId: number) => {
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Alta de Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona los usuarios del sistema</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00aeef] text-white rounded-xl text-sm font-semibold hover:bg-[#0099d6] transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Usuario</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Roles</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usersList.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#00aeef] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {user.fullName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium text-sm text-gray-900">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{user.fullName}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 hidden md:table-cell">{user.email}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <span key={r.roleId} className="px-2 py-0.5 bg-[#00aeef]/10 text-[#00aeef] text-xs rounded-md font-medium">
                          {r.roleName}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {user.active ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                        <UserCheck className="w-3.5 h-3.5" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium">
                        <UserX className="w-3.5 h-3.5" /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(user)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => handleDelete(user.id)} className="p-2 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usersList.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    No hay usuarios registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editing ? "Editar Usuario" : "Nuevo Usuario"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de usuario</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="usuario"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña {editing && <span className="text-gray-400">(dejar vacío para no cambiar)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder={editing ? "••••••" : "Contraseña"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#00aeef]"
                  placeholder="email@ejemplo.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Roles</label>
                <div className="space-y-2">
                  {allRoles.map((role) => (
                    <label key={role.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.roleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="w-4 h-4 rounded text-[#00aeef] focus:ring-[#00aeef]"
                      />
                      <span className="text-sm font-medium text-gray-700">{role.name}</span>
                    </label>
                  ))}
                  {allRoles.length === 0 && (
                    <p className="text-sm text-gray-400">No hay roles disponibles. Crea uno primero.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition ${form.active ? "bg-[#00aeef]" : "bg-gray-300"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition mt-0.5 ${form.active ? "translate-x-5.5 ml-[22px]" : "ml-0.5"}`} />
                  </div>
                </label>
                <span className="text-sm text-gray-700">{form.active ? "Activo" : "Inactivo"}</span>
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
                  {editing ? "Guardar Cambios" : "Crear Usuario"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
