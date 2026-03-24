// ============================================================================
// Pool de conexão MySQL — Painel de Limpeza
// ============================================================================
import mysql from "mysql2/promise";
import "dotenv/config";

const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error("[FATAL] Variáveis de banco ausentes:", missing.join(", "));
  process.exit(1);
}

const pool = mysql.createPool({
  host:             process.env.DB_HOST,
  port:             Number(process.env.DB_PORT) || 3306,
  database:         process.env.DB_NAME,
  user:             process.env.DB_USER,
  password:         process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  timezone:         "+00:00",
  charset:          "utf8mb4",
});

// Cria as tabelas se ainda não existirem
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(32)      NOT NULL UNIQUE,
      password_hash VARCHAR(255)     NOT NULL,
      role          ENUM('admin','viewer') NOT NULL,
      created_at    DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_by    VARCHAR(32)      NOT NULL DEFAULT 'system',
      INDEX idx_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id       BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
      log_id   VARCHAR(32)      NOT NULL UNIQUE,
      ts       DATETIME(3)      NOT NULL,
      type     VARCHAR(32)      NOT NULL,
      username VARCHAR(64)      NOT NULL DEFAULT '—',
      ip       VARCHAR(45)      NOT NULL DEFAULT '—',
      detail   VARCHAR(255)     NOT NULL DEFAULT '',
      INDEX idx_ts       (ts),
      INDEX idx_type     (type),
      INDEX idx_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log("[db] Tabelas verificadas/criadas.");
}

export default pool;
