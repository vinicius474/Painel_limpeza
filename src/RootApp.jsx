import { useState, lazy, Suspense } from "react";
import { useAuth } from "./AuthContext.jsx";
import LoginPage from "./LoginPage.jsx";
import App from "./App.jsx";
import { LoadingSkeleton } from "./components.jsx";

// AdminPanel é carregado apenas quando um admin navega para ele.
// Viewers nunca fazem download deste chunk.
const AdminPanel = lazy(() => import("./AdminPanel.jsx"));

export default function RootApp() {
  const { session } = useAuth();
  const [page, setPage] = useState("dashboard");

  if (!session) return <LoginPage />;

  if (page === "admin" && session.role === "admin") {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <AdminPanel onBack={() => setPage("dashboard")} />
      </Suspense>
    );
  }

  return (
    <App
      onAdminClick={session.role === "admin" ? () => setPage("admin") : null}
    />
  );
}
