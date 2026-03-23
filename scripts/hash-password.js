// Utilitário para gerar hash bcrypt de senhas
// Uso: node scripts/hash-password.js SUA_SENHA
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Uso: node scripts/hash-password.js SUA_SENHA");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log("\nHash gerado (cole no .env):");
console.log(hash);
console.log();
