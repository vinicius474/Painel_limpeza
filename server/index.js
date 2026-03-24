// ============================================================================
// Servidor proxy seguro — Painel de Limpeza
// Node.js >= 18 requerido (fetch nativo + top-level await ESM)
// ============================================================================
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

import { initUsers, findUser, listUsers, createUser, deleteUser } from "./lib/users.js";
import { addLog, getLogs, LOG_TYPES } from "./lib/logger.js";
import { initDb } from "./lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Validação de variáveis de ambiente obrigatórias ───────────────────────────
const ALWAYS_REQUIRED = ["JWT_SECRET", "WEBHOOK_URL", "DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missingAlways = ALWAYS_REQUIRED.filter((k) => !process.env[k]);
if (missingAlways.length > 0) {
  console.error("[FATAL] Variáveis obrigatórias ausentes:", missingAlways.join(", "));
  console.error("[FATAL] Copie .env.example para .env e preencha os valores.");
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error("[FATAL] JWT_SECRET deve ter ao menos 32 caracteres.");
  process.exit(1);
}

// ── Constantes ────────────────────────────────────────────────────────────────
const PORT    = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === "production";

// ── Inicialização de usuários ─────────────────────────────────────────────────
// Monta seed a partir do .env (usado apenas na PRIMEIRA execução, quando a tabela users está vazia)
const seedUsers = [];
if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
  seedUsers.push({
    username:    process.env.ADMIN_USERNAME,
    passwordHash: process.env.ADMIN_PASSWORD_HASH,
    role:        "admin",
  });
}
if (process.env.VIEWER_USERNAME && process.env.VIEWER_PASSWORD_HASH) {
  seedUsers.push({
    username:    process.env.VIEWER_USERNAME,
    passwordHash: process.env.VIEWER_PASSWORD_HASH,
    role:        "viewer",
  });
}
// ── Hash dummy para comparação com timing constante ───────────────────────────
// Gerado com top-level await (ESM) para garantir formato 100% válido.
// Impede enumeração de usuários por diferença de tempo na resposta de login.
console.log("[server] Computando hash de segurança...");
const TIMING_DUMMY_HASH = await bcrypt.hash("__timing_safe_dummy_painel__", 12);

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
// "loopback" = confiar em proxies em 127.0.0.1 (Nginx em prod, Vite proxy em dev)
// Necessário para capturar o IP real via X-Forwarded-For
app.set("trust proxy", "loopback");

// ── Helmet ────────────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc:        ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc:     ["'self'"],
        imgSrc:         ["'self'", "data:"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: IS_PROD
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error("CORS bloqueado."));
      }
    : true,
  credentials: true,
}));

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Limite de requisições atingido. Tente em instantes." },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Limite de requisições admin atingido." },
});

// ── JWT helpers ───────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    algorithm: "HS256",
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
}

// ── Middleware: autenticação ──────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    addLog(LOG_TYPES.ACCESS_DENIED, null, req.ip, "token ausente");
    return res.status(401).json({ error: "Autenticação necessária." });
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    addLog(LOG_TYPES.ACCESS_DENIED, null, req.ip, "token inválido/expirado");
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

// ── Middleware: autorização por perfil ────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Autenticação necessária." });
    if (!roles.includes(req.user.role)) {
      addLog(LOG_TYPES.ACCESS_DENIED, req.user.sub, req.ip, `perfil "${req.user.role}" sem permissão`);
      return res.status(403).json({ error: "Acesso não autorizado para este perfil." });
    }
    next();
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ROTAS
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /auth/login ──────────────────────────────────────────────────────────
app.post("/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password || typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
  }
  if (username.length > 64 || password.length > 128) {
    return res.status(400).json({ error: "Credenciais inválidas." });
  }

  const user = await findUser(username);
  const hashToCompare = user?.passwordHash ?? TIMING_DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) {
    addLog(LOG_TYPES.LOGIN_FAILED, username, req.ip);
    console.warn(`[auth] Login falhou: usuario="${username}" ip="${req.ip}"`);
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }

  const token = signToken({ sub: user.username, role: user.role });
  addLog(LOG_TYPES.LOGIN_SUCCESS, user.username, req.ip);
  console.log(`[auth] Login OK: usuario="${user.username}" role="${user.role}" ip="${req.ip}"`);
  return res.json({ token, role: user.role, username: user.username });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
app.get("/auth/me", requireAuth, (req, res) => {
  return res.json({ username: req.user.sub, role: req.user.role });
});

// ── GET /api/painel ───────────────────────────────────────────────────────────
app.get("/api/painel", requireAuth, apiLimiter, async (req, res) => {
  try {
    const headers = { Accept: "application/json" };
    if (process.env.WEBHOOK_API_KEY) headers["X-Api-Key"] = process.env.WEBHOOK_API_KEY;

    const upstream = await fetch(process.env.WEBHOOK_URL, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) throw new Error(`Upstream retornou status ${upstream.status}`);
    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    console.error(`[api/painel] ${err.message}`);
    return res.status(502).json({ error: "Dados temporariamente indisponíveis." });
  }
});

// ── GET /admin/logs ───────────────────────────────────────────────────────────
app.get("/admin/logs", requireAuth, requireRole("admin"), adminLimiter, async (req, res) => {
  const { limit, type } = req.query;
  return res.json(await getLogs({ limit, type }));
});

// ── GET /admin/users ──────────────────────────────────────────────────────────
app.get("/admin/users", requireAuth, requireRole("admin"), adminLimiter, async (_req, res) => {
  return res.json(await listUsers());
});

// ── POST /admin/users ─────────────────────────────────────────────────────────
app.post("/admin/users", requireAuth, requireRole("admin"), adminLimiter, async (req, res) => {
  const { username, password, role } = req.body || {};

  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password e role são obrigatórios." });
  }
  if (!["admin", "viewer"].includes(role)) {
    return res.status(400).json({ error: 'role deve ser "admin" ou "viewer".' });
  }
  if (typeof username !== "string" || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: "username: 3–32 chars, apenas letras minúsculas, números, ponto, hífen, underscore." });
  }
  if (typeof password !== "string" || password.length < 10) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 10 caracteres." });
  }

  try {
    const newUser = await createUser(username, password, role, req.user.sub);

    addLog(LOG_TYPES.USER_CREATED, username, req.ip, `criado por ${req.user.sub} (${role})`);
    console.log(`[admin] Usuário criado: "${username}" role="${role}" por "${req.user.sub}"`);
    return res.status(201).json(newUser);
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }
});

// ── DELETE /admin/users/:username ─────────────────────────────────────────────
app.delete("/admin/users/:username", requireAuth, requireRole("admin"), adminLimiter, async (req, res) => {
  const { username } = req.params;
  try {
    await deleteUser(username, req.user.sub);
    addLog(LOG_TYPES.USER_DELETED, username, req.ip, `excluído por ${req.user.sub}`);
    console.log(`[admin] Usuário excluído: "${username}" por "${req.user.sub}"`);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── GET /admin/generate-password ──────────────────────────────────────────────
// Gera uma senha forte no servidor usando crypto.randomBytes
app.get("/admin/generate-password", requireAuth, requireRole("admin"), (req, res) => {
  const length = Math.min(Math.max(Number(req.query.length) || 20, 12), 64);
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*+-=?";
  const maxUsable = Math.floor(256 / charset.length) * charset.length;

  let password = "";
  while (password.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const byte of bytes) {
      if (password.length >= length) break;
      if (byte < maxUsable) password += charset[byte % charset.length];
    }
  }

  // Garante pelo menos 1 char de cada categoria
  const hasLower  = /[a-z]/.test(password);
  const hasUpper  = /[A-Z]/.test(password);
  const hasDigit  = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%&*+\-=?]/.test(password);

  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    // Resposta de erro para tentar novamente (extremamente raro)
    return res.status(503).json({ error: "Tente novamente." });
  }

  return res.json({ password });
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

// ── Static + SPA fallback ─────────────────────────────────────────────────────
const distPath = join(__dirname, "../dist");
app.use(express.static(distPath, { index: false }));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/") || req.path.startsWith("/admin/")) {
    return res.status(404).json({ error: "Rota não encontrada." });
  }
  res.sendFile(join(distPath, "index.html"));
});

// ── Erro global ───────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[server] Erro não tratado:", err.message);
  res.status(500).json({ error: "Erro interno do servidor." });
});

// ── Start ─────────────────────────────────────────────────────────────────────
let server;

async function start() {
  // 1. Inicializa banco e cria tabelas
  await initDb();

  // 2. Popula usuários iniciais (apenas se a tabela estiver vazia)
  await initUsers(seedUsers);

  // 3. Sobe o servidor HTTP
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Painel de Limpeza iniciado na porta ${PORT}`);
    console.log(`[server] Ambiente: ${process.env.NODE_ENV || "development"}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[FATAL] Porta ${PORT} já está em uso.`);
    } else {
      console.error("[FATAL] Erro ao iniciar servidor:", err.message);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("[FATAL] Falha na inicialização:", err.message);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`[server] ${signal} recebido. Encerrando...`);
  if (server) server.close(() => { console.log("[server] Encerrado."); process.exit(0); });
  setTimeout(() => { console.error("[server] Timeout. Forçando saída."); process.exit(1); }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("[server] UnhandledRejection:", reason));
