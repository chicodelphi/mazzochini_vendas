import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Conexão com o PostgreSQL.
 * - Local/Docker: DATABASE_URL (ex.: postgresql://postgres:postgres@127.0.0.1:5432/app_db)
 * - Vercel + Neon (Marketplace): a integração cria DATABASE_URL (pooled) automaticamente.
 *   POSTGRES_URL é aceito como alternativa.
 */
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!databaseUrl) {
  // Não derruba o build; a primeira consulta falhará com mensagem clara.
  console.error("[db] DATABASE_URL não definida — configure a variável de ambiente");
}

const onVercel = process.env.VERCEL === "1";

const globalForDb = globalThis as typeof globalThis & { __mazzPool?: Pool };

export const pool =
  globalForDb.__mazzPool ??
  new Pool({
    connectionString: databaseUrl,
    // Serverless: poucas conexões por instância (o Neon faz o pooling via PgBouncer)
    max: onVercel ? 5 : 10,
    idleTimeoutMillis: onVercel ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });

globalForDb.__mazzPool = pool;

// Na Vercel (Fluid compute), fecha conexões ociosas antes da instância ser suspensa.
if (onVercel) attachDatabasePool(pool);

export const db = drizzle(pool);
