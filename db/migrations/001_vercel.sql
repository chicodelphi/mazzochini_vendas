-- Migração 001 (idempotente): suporte a deploy na Vercel
--  * fotos dos funcionários (armazenadas no próprio PostgreSQL)
--  * fila de eventos em tempo real (substitui o pub/sub em memória)
--  * controle do monitor de heartbeat/alertas (substitui o setInterval)

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "foto" bytea;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "foto_mime" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "foto_atualizada_em" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "eventos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL REFERENCES "empresas"("id"),
	"evento" text NOT NULL,
	"dados" jsonb NOT NULL,
	-- admin: só gestores da empresa | todos: todos da empresa
	"escopo" text DEFAULT 'admin' NOT NULL,
	-- destinatário extra (ex.: mensagem para o vendedor)
	"para_user_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "eventos_empresa_id_idx" ON "eventos" USING btree ("empresa_id", "id");
CREATE INDEX IF NOT EXISTS "eventos_criado_idx" ON "eventos" USING btree ("criado_em");

CREATE TABLE IF NOT EXISTS "sistema_kv" (
	"chave" text PRIMARY KEY NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
