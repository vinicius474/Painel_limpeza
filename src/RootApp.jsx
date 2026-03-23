import { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import LoginPage from "./LoginPage.jsx";
import App from "./App.jsx";
import AdminPanel from "./AdminPanel.jsx";

// Roteamento protegido baseado em estado (sem React Router)
// - Sem sessão         → Login
// - Sessão + admin + page="admin" → AdminPanel
// - Sessão (qualquer perfil)       → Dashboard
export default function RootApp() {
  const { session } = useAuth();
  const [page, setPage] = useState("dashboard");

  if (!session) return <LoginPage />;

  if (page === "admin" && session.role === "admin") {
    return <AdminPanel onBack={() => setPage("dashboard")} />;
  }

  return (
    <App
      onAdminClick={session.role === "admin" ? () => setPage("admin") : null}
    />
  );
}
