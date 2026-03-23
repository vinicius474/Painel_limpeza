// ============================================================================
// Log store — Painel de Limpeza
// Mantém os últimos MAX_LOGS eventos em memória e persiste em arquivo JSON.
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, "../data");
const LOGS_FILE  = join(DATA_DIR, "logs.json");
const MAX_LOGS   = 1000;

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// Carrega logs persistidos ao iniciar
let logs = [];
try {
  if (existsSync(LOGS_FILE)) {
    logs = JSON.parse(readFileSync(LOGS_FILE, "utf8"));
  }
} catch {
  logs = [];
}

function persist() {
  try {
    writeFileSync(LOGS_FILE, JSON.stringify(logs.slice(-MAX_LOGS), null, 2), "utf8");
  } catch (err) {
    console.error("[logger] Erro ao persistir logs:", err.message);
  }
}

// Tipos de evento disponíveis
export const LOG_TYPES = {
  LOGIN_SUCCESS:  "LOGIN_SUCCESS",
  LOGIN_FAILED:   "LOGIN_FAILED",
  ACCESS_DENIED:  "ACCESS_DENIED",
  USER_CREATED:   "USER_CREATED",
  USER_DELETED:   "USER_DELETED",
};

/**
 * Registra um evento de segurança/auditoria.
 * @param {string} type    — um dos LOG_TYPES
 * @param {string} username — usuário envolvido (ou null)
 * @param {string} ip       — IP do request
 * @param {string} detail   — detalhe adicional (sem dados sensíveis)
 */
export function addLog(type, username, ip, detail = "") {
  const entry = {
    id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts:       new Date().toISOString(),
    type,
    username: username || "—",
    ip:       ip       || "—",
    detail,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  persist();
  return entry;
}

/**
 * Retorna os eventos mais recentes, opcionalmente filtrados por tipo.
 * @param {object} opts
 * @param {number} opts.limit — máximo de entradas (padrão 300, máx 500)
 * @param {string} opts.type  — filtrar por tipo (opcional)
 */
export function getLogs({ limit = 300, type = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 300, 1), 500);
  let result = [...logs].reverse(); // mais recentes primeiro
  if (type && Object.values(LOG_TYPES).includes(type)) {
    result = result.filter((l) => l.type === type);
  }
  return result.slice(0, safeLimit);
}
