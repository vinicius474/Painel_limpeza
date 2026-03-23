import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext.jsx";

// ─── Configuração visual dos tipos de log ─────────────────────────────────────
const LOG_CFG = {
  LOGIN_SUCCESS: { label: "Login OK",         color: "#34d399", bg: "rgba(52,211,153,0.1)",   icon: "✓", rowBg: "rgba(52,211,153,0.025)" },
  LOGIN_FAILED:  { label: "Login Falhou",      color: "#f87171", bg: "rgba(248,113,113,0.1)",  icon: "✕", rowBg: "rgba(248,113,113,0.03)"  },
  ACCESS_DENIED: { label: "Acesso Negado",     color: "#fbbf24", bg: "rgba(251,191,36,0.1)",   icon: "⚠", rowBg: "rgba(251,191,36,0.025)"  },
  USER_CREATED:  { label: "Usuário Criado",    color: "#818cf8", bg: "rgba(129,140,248,0.1)",  icon: "+", rowBg: "rgba(129,140,248,0.025)" },
  USER_DELETED:  { label: "Usuário Excluído",  color: "#a78bfa", bg: "rgba(167,139,250,0.1)",  icon: "−", rowBg: "rgba(167,139,250,0.025)" },
};

const LOG_TYPES_ORDER = ["LOGIN_SUCCESS", "LOGIN_FAILED", "ACCESS_DENIED", "USER_CREATED", "USER_DELETED"];

function LogBadge({ type }) {
  const cfg = LOG_CFG[type] || { label: type, color: "#7f8ea3", bg: "rgba(255,255,255,0.05)", icon: "·" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: cfg.bg, color: cfg.color,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + "  " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function generatePasswordLocal(length = 20) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*+-=?";
  const maxUsable = Math.floor(256 / charset.length) * charset.length;
  let attempts = 0;
  while (attempts++ < 20) {
    const bytes = new Uint8Array(length * 3);
    window.crypto.getRandomValues(bytes);
    let pw = "";
    for (const byte of bytes) {
      if (pw.length >= length) break;
      if (byte < maxUsable) pw += charset[byte % charset.length];
    }
    if (pw.length >= length &&
        /[a-z]/.test(pw) && /[A-Z]/.test(pw) &&
        /[0-9]/.test(pw) && /[!@#$%&*+\-=?]/.test(pw)) return pw;
  }
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
}

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "#3d4a5c" };
  let s = 0;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[!@#$%&*+\-=?]/.test(pw)) s++;
  if (s <= 2) return { score: s, label: "Fraca",  color: "#f87171" };
  if (s <= 4) return { score: s, label: "Média",  color: "#fbbf24" };
  return             { score: s, label: "Forte",  color: "#34d399" };
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function AdminPanel({ onBack }) {
  const { session, logout } = useAuth();
  const [tab, setTab] = useState("logs");

  // ── Logs ──────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState("ALL");
  const [logSearch, setLogSearch] = useState("");

  // ── Usuários ───────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // ── Criar usuário ──────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [showPw, setShowPw] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdUser, setCreatedUser] = useState(null);
  const [copied, setCopied] = useState(false);

  // ── Fetch autenticado ──────────────────────────────────────────────────────
  const authFetch = useCallback((url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(opts.headers || {}),
      },
    }),
  [session.token]);

  // ── Carrega dados ──────────────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await authFetch("/admin/logs?limit=500");
      if (res.status === 401) { logout(); return; }
      setLogs(await res.json());
    } catch { /* silencioso */ }
    finally { setLogsLoading(false); }
  }, [authFetch, logout]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await authFetch("/admin/users");
      if (res.status === 401) { logout(); return; }
      setUsers(await res.json());
    } catch { /* silencioso */ }
    finally { setUsersLoading(false); }
  }, [authFetch, logout]);

  useEffect(() => {
    if (tab === "logs")  loadLogs();
    if (tab === "users") loadUsers();
  }, [tab]); // eslint-disable-line

  // ── Contadores por tipo (para os cards) ────────────────────────────────────
  const logCounts = useMemo(() => {
    const counts = { ALL: logs.length };
    LOG_TYPES_ORDER.forEach((t) => { counts[t] = logs.filter((l) => l.type === t).length; });
    return counts;
  }, [logs]);

  // ── Logs filtrados ─────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs
      .filter((l) => logFilter === "ALL" || l.type === logFilter)
      .filter((l) => !q ||
        l.username.toLowerCase().includes(q) ||
        l.ip.includes(q) ||
        (l.detail || "").toLowerCase().includes(q)
      );
  }, [logs, logFilter, logSearch]);

  // ── Criar usuário ──────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(""); setCreatedUser(null); setCreateLoading(true);
    try {
      const res = await authFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreatedUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      setNewUsername(""); setNewPassword(""); setNewRole("viewer"); setShowPw(false);
      loadUsers();
    } catch (err) { setCreateError(err.message); }
    finally { setCreateLoading(false); }
  }

  async function handleDelete(username) {
    if (!window.confirm(`Excluir o usuário "${username}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadUsers();
    } catch (err) { window.alert(err.message); }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const pwStrength = passwordStrength(newPassword);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: "#080810", color: "#d0d8e4",
      fontFamily: "'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        padding: "14px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.008)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onBack} style={btnGhostStyle} title="Voltar ao painel">← Painel</button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg,#818cf8,#6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>⚙</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#eef1f6", letterSpacing: "-0.02em" }}>
                Painel Administrativo
              </div>
              <div style={{ fontSize: 10, color: "#5b6b80" }}>
                Logs de acesso · Gerenciamento de usuários
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, color: "#a5b4fc",
            background: "rgba(129,140,248,0.1)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 5, padding: "3px 8px", fontWeight: 600,
          }}>
            {session?.username} · ADMIN
          </span>
          <button onClick={logout} style={btnGhostStyle}>Sair</button>
        </div>
      </header>

      <div style={{ padding: "20px 28px", maxWidth: 1300, margin: "0 auto" }}>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[{ key: "logs", label: "Logs de Acesso" }, { key: "users", label: "Usuários" }].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, transition: "all 0.15s",
              background: tab === key ? "#6366f1" : "rgba(255,255,255,0.03)",
              color:      tab === key ? "#fff"    : "#7f8ea3",
            }}>{label}</button>
          ))}
        </div>

        {/* ════════════════════════════════ TAB: LOGS ════ */}
        {tab === "logs" && (
          <div style={{ animation: "fadeIn 0.2s ease" }}>

            {/* ── Cards de resumo (clicáveis para filtrar) ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 10, marginBottom: 18,
            }}>
              {LOG_TYPES_ORDER.map((type) => {
                const cfg     = LOG_CFG[type];
                const active  = logFilter === type;
                const count   = logCounts[type] || 0;
                return (
                  <div
                    key={type}
                    onClick={() => { setLogFilter(active ? "ALL" : type); setLogSearch(""); }}
                    title={active ? "Clique para ver todos" : `Filtrar: ${cfg.label}`}
                    style={{
                      cursor: "pointer",
                      background: active ? cfg.bg : "rgba(255,255,255,0.015)",
                      border: `1px solid ${active ? cfg.color + "40" : "rgba(255,255,255,0.05)"}`,
                      borderRadius: 12, padding: "14px 16px",
                      transition: "all 0.2s",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* Barra de destaque no topo */}
                    {active && (
                      <div style={{
                        position: "absolute", top: 0, left: 0, right: 0,
                        height: 2, background: cfg.color,
                      }} />
                    )}
                    <div style={{
                      fontSize: 9, color: active ? cfg.color : "#5b6b80",
                      fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.08em", marginBottom: 10,
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%",
                        background: active ? cfg.bg : "rgba(255,255,255,0.04)",
                        color: cfg.color,
                        display: "inline-flex", alignItems: "center",
                        justifyContent: "center", fontSize: 10,
                      }}>{cfg.icon}</span>
                      {cfg.label}
                    </div>
                    <div style={{
                      fontSize: 32, fontWeight: 700, lineHeight: 1,
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: active ? cfg.color : (count > 0 ? "#f0f4f8" : "#3d4a5c"),
                    }}>
                      {count}
                    </div>
                    {active && (
                      <div style={{ fontSize: 9, color: cfg.color + "aa", marginTop: 4 }}>
                        filtro ativo · clique para limpar
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Barra de busca + controles ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 380 }}>
                <span style={{
                  position: "absolute", left: 11, top: "50%",
                  transform: "translateY(-50%)",
                  color: "#5b6b80", fontSize: 13, pointerEvents: "none",
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar por usuário, IP ou detalhe..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px 8px 34px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 9, color: "#d0d8e4", fontSize: 12,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                {logSearch && (
                  <button
                    onClick={() => setLogSearch("")}
                    style={{
                      position: "absolute", right: 9, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none",
                      color: "#5b6b80", cursor: "pointer", fontSize: 14, padding: 0,
                    }}
                  >✕</button>
                )}
              </div>

              {/* Indicador de filtro ativo */}
              {logFilter !== "ALL" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: LOG_CFG[logFilter]?.bg,
                  border: `1px solid ${LOG_CFG[logFilter]?.color}40`,
                  borderRadius: 7, padding: "5px 10px",
                }}>
                  <span style={{ fontSize: 11, color: LOG_CFG[logFilter]?.color, fontWeight: 600 }}>
                    {LOG_CFG[logFilter]?.icon} {LOG_CFG[logFilter]?.label}
                  </span>
                  <button
                    onClick={() => setLogFilter("ALL")}
                    style={{ background: "none", border: "none", color: LOG_CFG[logFilter]?.color, cursor: "pointer", fontSize: 12, padding: 0 }}
                    title="Remover filtro"
                  >✕</button>
                </div>
              )}

              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "#5b6b80" }}>
                  {filteredLogs.length} de {logCounts.ALL} evento(s)
                </span>
                <button
                  onClick={() => { loadLogs(); setLogSearch(""); }}
                  style={btnGhostStyle}
                  title="Atualizar logs"
                >
                  &#x21BB; Atualizar
                </button>
              </div>
            </div>

            {/* ── Tabela de logs ── */}
            <div style={{
              background: "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 14, overflow: "hidden",
            }}>
              {logsLoading ? (
                <div style={{ padding: 48, textAlign: "center", color: "#5b6b80", fontSize: 12 }}>
                  Carregando logs...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                  <div style={{ color: "#5b6b80", fontSize: 13 }}>
                    {logCounts.ALL === 0
                      ? "Nenhum evento registrado ainda. Os logs aparecem assim que alguém fizer login."
                      : "Nenhum evento corresponde ao filtro atual."}
                  </div>
                  {(logFilter !== "ALL" || logSearch) && (
                    <button
                      onClick={() => { setLogFilter("ALL"); setLogSearch(""); }}
                      style={{ ...btnGhostStyle, marginTop: 12 }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        {["Horário", "Tipo", "Usuário", "IP", "Detalhe"].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => {
                        const cfg = LOG_CFG[log.type];
                        return (
                          <tr
                            key={log.id}
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.03)",
                              background: cfg?.rowBg || "transparent",
                              borderLeft: `2px solid ${cfg?.color || "transparent"}`,
                            }}
                          >
                            <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono',monospace", color: "#5b6b80", whiteSpace: "nowrap", fontSize: 11 }}>
                              {formatTs(log.ts)}
                            </td>
                            <td style={tdStyle}>
                              <LogBadge type={log.type} />
                            </td>
                            <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono',monospace", color: "#b4bfff", fontWeight: 600 }}>
                              {log.username}
                            </td>
                            <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono',monospace", color: "#7f8ea3", fontSize: 11 }}>
                              {log.ip}
                            </td>
                            <td style={{ ...tdStyle, color: "#5b6b80", fontSize: 11 }}>
                              {log.detail || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════ TAB: USUÁRIOS ════ */}
        {tab === "users" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, animation: "fadeIn 0.2s ease" }}>

            {/* ── Lista de usuários ── */}
            <div>
              <div style={sectionTitleStyle}>Usuários ativos</div>
              <div style={{
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14, overflow: "hidden",
              }}>
                {usersLoading ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#5b6b80", fontSize: 12 }}>Carregando...</div>
                ) : users.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#5b6b80", fontSize: 12 }}>Nenhum usuário encontrado.</div>
                ) : (
                  users.map((u) => (
                    <div key={u.username} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: "#eef1f6", fontSize: 13 }}>
                            {u.username}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            background: u.role === "admin" ? "rgba(129,140,248,0.12)" : "rgba(255,255,255,0.04)",
                            color:      u.role === "admin" ? "#a5b4fc"                : "#5b6b80",
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: 4, padding: "2px 6px",
                            textTransform: "uppercase", letterSpacing: "0.06em",
                          }}>{u.role}</span>
                          {u.username === session?.username && (
                            <span style={{ fontSize: 9, color: "#34d399" }}>● você</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#3d4a5c", marginTop: 3 }}>
                          Criado em {u.createdAt ? new Date(u.createdAt).toLocaleDateString("pt-BR") : "—"}
                          {u.createdBy ? ` · por ${u.createdBy}` : ""}
                        </div>
                      </div>
                      {u.username !== session?.username ? (
                        <button
                          onClick={() => handleDelete(u.username)}
                          style={{
                            background: "rgba(248,113,113,0.06)",
                            border: "1px solid rgba(248,113,113,0.15)",
                            borderRadius: 7, padding: "5px 11px",
                            cursor: "pointer", color: "#f87171",
                            fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                          }}
                        >
                          Excluir
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: "#3d4a5c", padding: "5px 10px" }}>—</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Criar usuário ── */}
            <div>
              <div style={sectionTitleStyle}>Criar novo usuário</div>
              <div style={{
                background: "rgba(255,255,255,0.015)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14, padding: "20px 22px",
              }}>
                <div style={{
                  background: "rgba(129,140,248,0.06)",
                  border: "1px solid rgba(129,140,248,0.15)",
                  borderRadius: 8, padding: "10px 13px", marginBottom: 18,
                  fontSize: 11, color: "#818cf8", lineHeight: 1.5,
                }}>
                  ℹ A senha é exibida uma única vez após a criação. Anote antes de fechar.
                </div>

                <form onSubmit={handleCreate} autoComplete="off">
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Nome de usuário</label>
                    <input
                      type="text" value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                      placeholder="ex: joao.silva" required disabled={createLoading}
                      autoComplete="off" style={inputStyle}
                    />
                    <div style={{ fontSize: 10, color: "#3d4a5c", marginTop: 4 }}>
                      3–32 chars · letras minúsculas, números, ponto, hífen, underscore
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Perfil de acesso</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {["viewer", "admin"].map((r) => (
                        <button key={r} type="button" onClick={() => setNewRole(r)} style={{
                          flex: 1, padding: "8px",
                          borderRadius: 8, border: "1px solid",
                          cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                          background: newRole === r
                            ? (r === "admin" ? "rgba(129,140,248,0.15)" : "rgba(52,211,153,0.1)")
                            : "rgba(255,255,255,0.03)",
                          borderColor: newRole === r
                            ? (r === "admin" ? "rgba(129,140,248,0.3)" : "rgba(52,211,153,0.2)")
                            : "rgba(255,255,255,0.07)",
                          color: newRole === r
                            ? (r === "admin" ? "#a5b4fc" : "#34d399")
                            : "#5b6b80",
                        }}>
                          {r === "viewer" ? "Viewer — Somente leitura" : "Admin — Acesso total"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={labelStyle}>Senha</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ position: "relative", flex: 1 }}>
                        <input
                          type={showPw ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mín. 10 caracteres"
                          required disabled={createLoading}
                          autoComplete="new-password"
                          style={{ ...inputStyle, paddingRight: 40 }}
                        />
                        <button type="button" onClick={() => setShowPw((v) => !v)} style={{
                          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "#5b6b80", fontSize: 13, padding: 0,
                        }} title={showPw ? "Ocultar" : "Mostrar"}>
                          {showPw ? "🙈" : "👁"}
                        </button>
                      </div>
                      <button type="button" onClick={() => { setNewPassword(generatePasswordLocal(20)); setShowPw(true); }}
                        style={{
                          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                          borderRadius: 8, padding: "0 14px", cursor: "pointer",
                          color: "#818cf8", fontSize: 11, fontWeight: 600,
                          transition: "all 0.15s", whiteSpace: "nowrap",
                        }}>
                        🎲 Gerar
                      </button>
                    </div>
                  </div>

                  {newPassword && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            width: `${Math.min((pwStrength.score / 6) * 100, 100)}%`,
                            background: pwStrength.color, transition: "width 0.3s ease",
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: pwStrength.color, fontWeight: 600 }}>{pwStrength.label}</span>
                        <button type="button" onClick={() => copyToClipboard(newPassword)}
                          style={{ ...btnGhostStyle, fontSize: 10, padding: "3px 8px" }}>
                          {copied ? "✓ Copiado" : "Copiar"}
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: "#3d4a5c" }}>{newPassword.length} caracteres</div>
                    </div>
                  )}

                  {createError && (
                    <div style={{
                      background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
                      borderRadius: 8, padding: "9px 13px", marginBottom: 14,
                      fontSize: 12, color: "#f87171",
                    }}>{createError}</div>
                  )}

                  <button type="submit" disabled={createLoading || !newUsername || !newPassword} style={{
                    width: "100%", padding: "10px",
                    background: createLoading || !newUsername || !newPassword ? "rgba(99,102,241,0.3)" : "#6366f1",
                    border: "none", borderRadius: 9, color: "#fff",
                    fontSize: 12, fontWeight: 600, transition: "background 0.15s",
                    cursor: createLoading || !newUsername || !newPassword ? "not-allowed" : "pointer",
                  }}>
                    {createLoading ? "Criando..." : "Criar Usuário"}
                  </button>
                </form>
              </div>

              {createdUser && (
                <div style={{
                  marginTop: 14,
                  background: "rgba(52,211,153,0.06)",
                  border: "1px solid rgba(52,211,153,0.2)",
                  borderRadius: 12, padding: "16px 18px",
                  animation: "fadeIn 0.3s ease",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>✓ Usuário criado com sucesso</span>
                    <button onClick={() => setCreatedUser(null)}
                      style={{ background: "none", border: "none", color: "#5b6b80", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#7f8ea3", marginBottom: 8 }}>
                    ⚠ Anote esta senha agora. Ela não será exibida novamente.
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: "#5b6b80" }}>Usuário: </span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#eef1f6", fontSize: 12 }}>{createdUser.username}</span>
                    <span style={{
                      marginLeft: 8, fontSize: 9, fontWeight: 700,
                      background: createdUser.role === "admin" ? "rgba(129,140,248,0.12)" : "rgba(255,255,255,0.04)",
                      color: createdUser.role === "admin" ? "#a5b4fc" : "#5b6b80",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 4, padding: "2px 6px", textTransform: "uppercase",
                    }}>{createdUser.role}</span>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px",
                  }}>
                    <span style={{
                      flex: 1, fontFamily: "'IBM Plex Mono',monospace",
                      color: "#f0f4f8", fontSize: 13, letterSpacing: "0.03em", wordBreak: "break-all",
                    }}>{createdUser.password}</span>
                    <button onClick={() => copyToClipboard(createdUser.password)} style={{ ...btnGhostStyle, whiteSpace: "nowrap" }}>
                      {copied ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        *{box-sizing:border-box}
        ::-webkit-scrollbar{height:5px;width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:3px}
      `}</style>
    </div>
  );
}

const btnGhostStyle = {
  background: "none", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, padding: "6px 11px", cursor: "pointer",
  color: "#5b6b80", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
};
const labelStyle = {
  display: "block", fontSize: 10, color: "#7f8ea3", fontWeight: 600,
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em",
};
const inputStyle = {
  width: "100%", padding: "9px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 8, color: "#d0d8e4", fontSize: 12,
  outline: "none", boxSizing: "border-box",
};
const sectionTitleStyle = {
  fontSize: 11, color: "#7f8ea3", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
};
const thStyle = {
  padding: "11px 14px", textAlign: "left",
  fontSize: 9, fontWeight: 600, color: "#5b6b80",
  textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
};
const tdStyle = { padding: "10px 14px", color: "#d0d8e4" };