// ============================================================================
// Log store — Painel de Limpeza
// Persiste eventos de auditoria no banco MySQL (tabela `audit_logs`).
// ============================================================================
import pool from "./db.js";

export const LOG_TYPES = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED:  "LOGIN_FAILED",
  ACCESS_DENIED: "ACCESS_DENIED",
  USER_CREATED:  "USER_CREATED",
  USER_DELETED:  "USER_DELETED",
};

/**
 * Registra um evento de segurança/auditoria.
 * Fire-and-forget: erros de banco são logados no console mas não propagados.
 */
export async function addLog(type, username, ip, detail = "") {
  const logId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    await pool.query(
      "INSERT INTO audit_logs (log_id, ts, type, username, ip, detail) VALUES (?, NOW(3), ?, ?, ?, ?)",
      [logId, type, username || "—", ip || "—", detail]
    );
  } catch (err) {
    console.error("[logger] Erro ao salvar log:", err.message);
  }
}

/**
 * Retorna os eventos mais recentes, opcionalmente filtrados por tipo.
 */
export async function getLogs({ limit = 300, type = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 300, 1), 500);

  let query = "SELECT log_id AS id, ts, type, username, ip, detail FROM audit_logs";
  const params = [];

  if (type && Object.values(LOG_TYPES).includes(type)) {
    query += " WHERE type = ?";
    params.push(type);
  }

  query += " ORDER BY ts DESC LIMIT ?";
  params.push(safeLimit);

  const [rows] = await pool.query(query, params);
  return rows;
}
