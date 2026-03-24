import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  const [logDateFilter, setLogDateFilter] = useState("ALL");
  const [logSearch, setLogSearch] = useState("");

  // ── Usuários ───────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  // ── Criar usuário ──────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [showPw, setShowPw] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdUser, setCreatedUser] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // username pendente de confirmação

  // ── Cleanup de timeout do "Copiado" para evitar setState em componente desmontado
  const copyTimeoutRef = useRef(null);
  useEffect(() => () => clearTimeout(copyTimeoutRef.current), []);

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
  }, [tab, loadLogs, loadUsers]);

  // ── Contadores por tipo (para os cards) — O(n) com passagem única ────────
  const logCounts = useMemo(() => {
    const counts = { ALL: logs.length };
    LOG_TYPES_ORDER.forEach((t) => (counts[t] = 0));
    for (const l of logs) {
      if (counts[l.type] !== undefined) counts[l.type]++;
    }
    return counts;
  }, [logs]);

  // ── Logs filtrados (tipo + período + busca) ────────────────────────────────
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    const now = Date.now();
    const periodMs = { TODAY: 86_400_000, "7D": 7 * 86_400_000, "30D": 30 * 86_400_000 };

    return logs.filter((l) => {
      if (logFilter !== "ALL" && l.type !== logFilter) return false;
      if (logDateFilter !== "ALL") {
        if (now - new Date(l.ts).getTime() > periodMs[logDateFilter]) return false;
      }
      if (q) {
        return (
          l.username.toLowerCase().includes(q) ||
          l.ip.includes(q) ||
          (l.detail || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, logFilter, logDateFilter, logSearch]);

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
    try {
      const res = await authFetch(`/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      setDeleteConfirm(null);
      setUsersError(err.message);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  const pwStrength = passwordStrength(newPassword);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", background: "#080810", color: "#d0d8e4",
      fontFamily: "'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
    }}>
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

            {/* ── Métricas (somente leitura) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
              {LOG_TYPES_ORDER.map((type) => {
                const cfg   = LOG_CFG[type];
                const count = logCounts[type] || 0;
                return (
                  <div key={type} style={{
                    background: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderTop: `2px solid ${cfg.color}50`,
                    borderRadius: 12, padding: "13px 15px",
                  }}>
                    <div style={{
                      fontSize: 9, color: "#5b6b80", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      marginBottom: 8, display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{ color: cfg.color }}>{cfg.icon}</span>
                      {cfg.label}
                    </div>
                    <div style={{
                      fontSize: 28, fontWeight: 700, lineHeight: 1,
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: count > 0 ? "#f0f4f8" : "#3d4a5c",
                    }}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Painel de filtros ── */}
            <div style={{
              background: "rgba(255,255,255,0.018)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "14px 16px",
              marginBottom: 14, display: "flex", flexDirection: "column", gap: 10,
            }}>

              {/* Linha 1: busca + atualizar */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <span style={{
                    position: "absolute", left: 11, top: "50%",
                    transform: "translateY(-50%)",
                    color: "#5b6b80", fontSize: 13, pointerEvents: "none",
                  }}>🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar usuário, IP ou detalhe..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 32px 8px 34px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 8, color: "#d0d8e4", fontSize: 12,
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                  {logSearch && (
                    <button onClick={() => setLogSearch("")} style={{
                      position: "absolute", right: 9, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none",
                      color: "#5b6b80", cursor: "pointer", fontSize: 14, padding: 0,
                    }}>✕</button>
                  )}
                </div>
                <button
                  onClick={() => { loadLogs(); setLogSearch(""); setLogFilter("ALL"); setLogDateFilter("ALL"); }}
                  style={btnGhostStyle}
                  title="Recarregar logs e limpar filtros"
                >
                  ↻ Atualizar
                </button>
              </div>

              {/* Linha 2: filtros por tipo + data + contagem + limpar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>

                {/* Label */}
                <span style={{
                  fontSize: 10, color: "#3d4a5c", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  marginRight: 2,
                }}>Tipo</span>

                {/* Pills de tipo */}
                {[{ key: "ALL", label: "Todos", color: "#7f8ea3", icon: "≡" },
                  ...LOG_TYPES_ORDER.map((t) => ({ key: t, ...LOG_CFG[t] }))
                ].map(({ key, label, color, icon }) => {
                  const active = logFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setLogFilter(active && key !== "ALL" ? "ALL" : key)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 11px", borderRadius: 20,
                        border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.07)"}`,
                        background: active ? color + "18" : "rgba(255,255,255,0.03)",
                        color: active ? color : "#7f8ea3",
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                        transition: "all 0.15s", whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{icon}</span>
                      {label}
                      {active && key !== "ALL" && (
                        <span style={{ fontSize: 9, opacity: 0.7 }}>✕</span>
                      )}
                    </button>
                  );
                })}

                {/* Separador */}
                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.07)", margin: "0 4px" }} />

                {/* Label período */}
                <span style={{
                  fontSize: 10, color: "#3d4a5c", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  marginRight: 2,
                }}>Período</span>

                {/* Pills de período */}
                {[
                  { key: "ALL",   label: "Tudo"   },
                  { key: "TODAY", label: "Hoje"   },
                  { key: "7D",    label: "7 dias" },
                  { key: "30D",   label: "30 dias" },
                ].map(({ key, label }) => {
                  const active = logDateFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setLogDateFilter(key)}
                      style={{
                        padding: "4px 11px", borderRadius: 20,
                        border: `1px solid ${active ? "#818cf855" : "rgba(255,255,255,0.07)"}`,
                        background: active ? "rgba(129,140,248,0.14)" : "rgba(255,255,255,0.03)",
                        color: active ? "#a5b4fc" : "#7f8ea3",
                        fontSize: 11, fontWeight: 600, cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}

                {/* Contagem + limpar — ficam no final */}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: "#5b6b80" }}>
                    {filteredLogs.length === logCounts.ALL
                      ? `${filteredLogs.length} evento(s)`
                      : <><span style={{ color: "#d0d8e4", fontWeight: 600 }}>{filteredLogs.length}</span> de {logCounts.ALL}</>
                    }
                  </span>
                  {(logFilter !== "ALL" || logDateFilter !== "ALL" || logSearch) && (
                    <button
                      onClick={() => { setLogFilter("ALL"); setLogDateFilter("ALL"); setLogSearch(""); }}
                      style={{
                        ...btnGhostStyle,
                        fontSize: 10, padding: "3px 10px",
                        color: "#f87171", borderColor: "rgba(248,113,113,0.25)",
                      }}
                    >
                      ✕ Limpar filtros
                    </button>
                  )}
                </div>
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
                {usersError && (
                  <div style={{ padding: "10px 18px", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 12 }}>
                    {usersError}
                  </div>
                )}
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
                        deleteConfirm === u.username ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, color: "#f87171" }}>Confirmar?</span>
                            <button
                              onClick={() => handleDelete(u.username)}
                              style={{
                                background: "rgba(248,113,113,0.15)",
                                border: "1px solid rgba(248,113,113,0.3)",
                                borderRadius: 7, padding: "4px 10px",
                                cursor: "pointer", color: "#f87171",
                                fontSize: 11, fontWeight: 700,
                              }}
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 7, padding: "4px 10px",
                                cursor: "pointer", color: "#7f8ea3",
                                fontSize: 11, fontWeight: 600,
                              }}
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(u.username)}
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
                        )
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