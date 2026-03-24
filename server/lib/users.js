// ============================================================================
// Gerenciamento de usuários — Painel de Limpeza
// Persiste usuários no banco MySQL (tabela `users`).
// ============================================================================
import bcrypt from "bcryptjs";
import pool from "./db.js";

// ── Inicialização ─────────────────────────────────────────────────────────────
/**
 * Deve ser chamado UMA VEZ no startup (após initDb).
 * Se a tabela estiver vazia, insere os seedUsers vindos do .env.
 */
export async function initUsers(seedUsers) {
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM users");

  if (count > 0) {
    console.log(`[users] ${count} usuário(s) carregado(s) do banco.`);
    return;
  }

  if (!seedUsers || seedUsers.length === 0) {
    console.error("[FATAL] Tabela users vazia e nenhum usuário seed fornecido.");
    process.exit(1);
  }

  for (const u of seedUsers) {
    await pool.query(
      "INSERT INTO users (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)",
      [u.username, u.passwordHash, u.role, "system (.env)"]
    );
  }
  console.log(`[users] ${seedUsers.length} usuário(s) inserido(s) a partir do .env.`);
}

// ── Consultas ─────────────────────────────────────────────────────────────────
export async function findUser(username) {
  const [rows] = await pool.query(
    "SELECT username, password_hash AS passwordHash, role FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  return rows[0] ?? null;
}

/** Lista usuários sem expor password_hash */
export async function listUsers() {
  const [rows] = await pool.query(
    "SELECT username, role, created_at AS createdAt, created_by AS createdBy FROM users ORDER BY created_at ASC"
  );
  return rows;
}

// ── Mutações ──────────────────────────────────────────────────────────────────
/**
 * Cria um novo usuário. Lança Error se o username já existir.
 * Retorna os dados públicos do usuário criado (sem hash).
 */
export async function createUser(username, password, role, createdBy) {
  const [existing] = await pool.query(
    "SELECT id FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  if (existing.length > 0) throw new Error(`Usuário "${username}" já existe.`);

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO users (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)",
    [username, passwordHash, role, createdBy]
  );

  const [rows] = await pool.query(
    "SELECT username, role, created_at AS createdAt, created_by AS createdBy FROM users WHERE username = ?",
    [username]
  );
  return rows[0];
}

/**
 * Exclui um usuário. Lança Error em caso de violação de regra.
 */
export async function deleteUser(username, requestingUsername) {
  if (username === requestingUsername) {
    throw new Error("Você não pode excluir seu próprio usuário.");
  }

  const [rows] = await pool.query(
    "SELECT id, role FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  if (rows.length === 0) throw new Error(`Usuário "${username}" não encontrado.`);

  if (rows[0].role === "admin") {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM users WHERE role = "admin"'
    );
    if (count <= 1) {
      throw new Error("Não é possível excluir o único administrador do sistema.");
    }
  }

  await pool.query("DELETE FROM users WHERE username = ?", [username]);
}
