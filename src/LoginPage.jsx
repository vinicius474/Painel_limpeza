import { useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
        padding: "0 16px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "36px 32px",
          background: "rgba(255,255,255,0.018)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          animation: "fadeIn 0.3s ease",
        }}
      >
        {/* Logo e título */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg,#818cf8,#6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              margin: "0 auto 14px",
            }}
          >
            &#x1F9F9;
          </div>
          <h1
            style={{
              color: "#eef1f6",
              fontSize: 18,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Painel de Limpeza
          </h1>
          <p style={{ color: "#5b6b80", fontSize: 12, marginTop: 5 }}>
            Acesso restrito &mdash; fa&ccedil;a login para continuar
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} autoComplete="on" noValidate>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Usu&aacute;rio</label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
              placeholder="seu.usuario"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Senha</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 16,
                fontSize: 12,
                color: "#f87171",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: "100%",
              padding: "11px",
              background:
                loading || !username || !password
                  ? "rgba(99,102,241,0.4)"
                  : "#6366f1",
              border: "none",
              borderRadius: 9,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !username || !password ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              letterSpacing: "0.01em",
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 11,
  color: "#7f8ea3",
  fontWeight: 600,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 8,
  color: "#d0d8e4",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
