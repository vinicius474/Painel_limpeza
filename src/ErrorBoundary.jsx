import { Component } from "react";

// Captura erros em qualquer componente filho.
// Sem isso, qualquer exceção derruba a tela inteira em branco.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", background: "#080810",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 16, padding: 32,
          fontFamily: "'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
        }}>
          <div style={{ fontSize: 36, color: "#f87171" }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#eef1f6" }}>
            Algo deu errado
          </div>
          <div style={{
            fontSize: 12, color: "#5b6b80", maxWidth: 420,
            textAlign: "center", lineHeight: 1.6,
          }}>
            {this.state.error.message || "Erro inesperado. Recarregue a página."}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: "9px 22px",
              background: "#6366f1", border: "none",
              borderRadius: 9, color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
