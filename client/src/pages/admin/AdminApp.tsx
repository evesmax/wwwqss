import { useState, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import AdminLogin from "./AdminLogin";
import AdminLayout from "./AdminLayout";
import RolesPage from "./RolesPage";
import UsersPage from "./UsersPage";

export default function AdminApp() {
  const [user, setUser] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [location, navigate] = useLocation();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
    navigate("/admin/roles");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-[#00aeef] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <AdminLayout user={user} onLogout={handleLogout}>
      <Switch>
        <Route path="/admin/roles" component={RolesPage} />
        <Route path="/admin/users" component={UsersPage} />
        <Route path="/admin">
          <Redirect to="/admin/roles" />
        </Route>
      </Switch>
    </AdminLayout>
  );
}
