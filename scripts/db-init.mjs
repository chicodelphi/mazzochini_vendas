// Prepara o banco:
//  1) cria o schema base (db/init.sql) se o banco estiver vazio;
//  2) aplica as migrações idempotentes de db/migrations/*.sql (em ordem).
// Uso: node scripts/db-init.mjs  (roda automaticamente no build da Vercel via "vercel-build")
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// DDL: prefira a conexão direta (sem PgBouncer) quando existir
const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

if (!url) {
  console.warn("[db-init] DATABASE_URL não definida — pulando preparação do banco");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = new pg.Client({ connectionString: url });

// aguarda o banco aceitar conexões (até ~60 s; o Neon pode estar "acordando")
for (let i = 1; ; i++) {
  try {
    await client.connect();
    break;
  } catch (e) {
    if (i >= 30) {
      console.error("[db-init] banco indisponível:", e.message);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

try {
  const { rows } = await client.query("select to_regclass('public.users') as t");
  if (rows[0].t) {
    console.log("[db-init] schema base já existe");
  } else {
    await client.query(readFileSync(join(root, "db", "init.sql"), "utf8"));
    console.log("[db-init] schema base criado");
  }
  const dir = join(root, "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await client.query(readFileSync(join(dir, f), "utf8"));
    console.log(`[db-init] migração aplicada: ${f}`);
  }
} catch (e) {
  console.error("[db-init] erro:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
