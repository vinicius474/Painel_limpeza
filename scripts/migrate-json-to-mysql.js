// ============================================================================
// Migração: users.json + logs.json → MySQL
// Uso: node scripts/migrate-json-to-mysql.js
// ============================================================================
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, "../server/data");

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  port:     Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  timezone: "+00:00",
});

async function migrate() {
  console.log("[migrate] Iniciando migração...\n");

  // ── Usuários ──────────────────────────────────────────────────────────────
  const usersFile = join(DATA_DIR, "users.json");
  if (existsSync(usersFile)) {
    const users = JSON.parse(readFileSync(usersFile, "utf8"));
    console.log(`[migrate] ${users.length} usuário(s) encontrado(s) em users.json`);

    for (const u of users) {
      try {
        await pool.query(
          `INSERT IGNORE INTO users (username, password_hash, role, created_at, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [u.username, u.passwordHash, u.role, new Date(u.createdAt), u.createdBy || "system"]
        );
        console.log(`  ✓ Usuário migrado: ${u.username} (${u.role})`);
      } catch (err) {
        console.error(`  ✗ Erro ao migrar usuário "${u.username}": ${err.message}`);
      }
    }
  } else {
    console.log("[migrate] users.json não encontrado — pulando.");
  }

  console.log("");

  // ── Logs ──────────────────────────────────────────────────────────────────
  const logsFile = join(DATA_DIR, "logs.json");
  if (existsSync(logsFile)) {
    const logs = JSON.parse(readFileSync(logsFile, "utf8"));
    console.log(`[migrate] ${logs.length} log(s) encontrado(s) em logs.json`);

    let ok = 0;
    for (const l of logs) {
      try {
        await pool.query(
          `INSERT IGNORE INTO audit_logs (log_id, ts, type, username, ip, detail)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [l.id, new Date(l.ts), l.type, l.username || "—", l.ip || "—", l.detail || ""]
        );
        ok++;
      } catch (err) {
        console.error(`  ✗ Erro ao migrar log "${l.id}": ${err.message}`);
      }
    }
    console.log(`  ✓ ${ok}/${logs.length} log(s) migrado(s)`);
  } else {
    console.log("[migrate] logs.json não encontrado — pulando.");
  }

  await pool.end();
  console.log("\n[migrate] Concluído!");
}

migrate().catch((err) => {
  console.error("[migrate] Erro fatal:", err.message);
  process.exit(1);
});
