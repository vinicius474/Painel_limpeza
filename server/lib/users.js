// ============================================================================
// Gerenciamento de usuários — Painel de Limpeza
// Persiste usuários em server/data/users.json.
// Na primeira execução migra automaticamente as credenciais do .env.
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, "../data");
const USERS_FILE = join(DATA_DIR, "users.json");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ── Leitura / escrita ─────────────────────────────────────────────────────────
function readFile() {
  try {
    if (!existsSync(USERS_FILE)) return null;
    return JSON.parse(readFileSync(USERS_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeFile(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ── Inicialização ─────────────────────────────────────────────────────────────
/**
 * Deve ser chamado UMA VEZ no startup.
 * Se users.json não existir, cria a partir dos seedUsers (vindos do .env).
 * Retorna a lista de usuários carregada.
 */
export function initUsers(seedUsers) {
  const existing = readFile();
  if (existing !== null) {
    console.log(`[users] users.json carregado (${existing.length} usuário(s))`);
    return existing;
  }

  if (!seedUsers || seedUsers.length === 0) {
    console.error("[FATAL] users.json não encontrado e nenhum usuário seed fornecido.");
    process.exit(1);
  }

  const users = seedUsers.map((u) => ({
    username:    u.username,
    passwordHash: u.passwordHash,
    role:        u.role,
    createdAt:   new Date().toISOString(),
    createdBy:   "system (.env)",
  }));

  writeFile(users);
  console.log(`[users] users.json criado com ${users.length} usuário(s) migrado(s) do .env`);
  return users;
}

// ── Consultas ─────────────────────────────────────────────────────────────────
export function findUser(username) {
  const users = readFile() || [];
  return users.find((u) => u.username === username) ?? null;
}

/** Lista usuários sem expor passwordHash */
export function listUsers() {
  return (readFile() || []).map(({ username, role, createdAt, createdBy }) => ({
    username, role, createdAt: createdAt || null, createdBy: createdBy || null,
  }));
}

// ── Mutações ──────────────────────────────────────────────────────────────────
/**
 * Cria um novo usuário. Lança Error se o username já existir.
 * Retorna os dados públicos do usuário criado (sem hash).
 */
export async function createUser(username, password, role, createdBy) {
  const users = readFile() || [];

  if (users.find((u) => u.username === username)) {
    throw new Error(`Usuário "${username}" já existe.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const newUser = {
    username,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
    createdBy,
  };

  users.push(newUser);
  writeFile(users);

  const { passwordHash: _h, ...publicData } = newUser;
  return publicData;
}

/**
 * Exclui um usuário. Lança Error em caso de violação de regra.
 */
export function deleteUser(username, requestingUsername) {
  const users = readFile() || [];

  const idx = users.findIndex((u) => u.username === username);
  if (idx === -1) throw new Error(`Usuário "${username}" não encontrado.`);

  if (username === requestingUsername) {
    throw new Error("Você não pode excluir seu próprio usuário.");
  }

  const admins = users.filter((u) => u.role === "admin");
  if (users[idx].role === "admin" && admins.length === 1) {
    throw new Error("Não é possível excluir o único administrador do sistema.");
  }

  users.splice(idx, 1);
  writeFile(users);
}
