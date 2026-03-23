import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);
const SESSION_KEY = "painel_session";

// ── Verifica expiração do token sem precisar de chave secreta ─────────────────
// O campo `exp` no payload JWT é público (só a assinatura é secreta).
// A verificação de assinatura é responsabilidade exclusiva do servidor.
function isTokenExpired(token) {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return true;
    const payload = JSON.parse(atob(payloadB64));
    if (!payload?.exp) return true;
    // Margem de 30s para compensar variação de clock
    return Date.now() / 1000 >= payload.exp - 30;
  } catch {
    return true;
  }
}

// ── Carrega sessão do sessionStorage, descartando tokens expirados ─────────────
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || !session?.username) return null;

    if (isTokenExpired(session.token)) {
      // Limpar sessão expirada agora para evitar flash do painel
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  const login = useCallback(async (username, password) => {
    let data;
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no login.");
    } catch (err) {
      // Se o fetch falhar antes de receber uma resposta (servidor offline), garantir mensagem amigável
      if (err instanceof TypeError) {
        throw new Error("Servidor indisponível. Verifique a conexão.");
      }
      throw err;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    setSession(data);
    return data;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
  return ctx;
}
