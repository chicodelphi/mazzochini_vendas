CREATE TABLE "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"vendedor_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"mensagem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone
);

CREATE TABLE "anexos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"checkin_id" integer NOT NULL,
	"vendedor_id" integer NOT NULL,
	"nome" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho" integer NOT NULL,
	"dados" "bytea" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "atividades" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendedor_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendedor_id" integer NOT NULL,
	"cliente_id" integer,
	"cliente_nome" text NOT NULL,
	"email_empresa" text,
	"colaborador_id" integer,
	"colaborador_nome" text,
	"email_colaborador" text,
	"telefone_colaborador" text,
	"tipo_contato" text,
	"descricao" text,
	"resultado" text,
	"motivo" text,
	"refazer_em" timestamp with time zone,
	"refeito" boolean DEFAULT false NOT NULL,
	"refazer_de_id" integer,
	"entrada" timestamp with time zone DEFAULT now() NOT NULL,
	"saida" timestamp with time zone
);

CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"telefone" text,
	"endereco" text
);

CREATE TABLE "colaboradores" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"cliente_id" integer NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"telefone" text
);

CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "mensagens" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"remetente_id" integer NOT NULL,
	"destinatario_id" integer NOT NULL,
	"conteudo" text NOT NULL,
	"lida" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"revogado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE "regioes" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"nome" text NOT NULL
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"role" text DEFAULT 'vendedor' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "vendas" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendedor_id" integer NOT NULL,
	"cliente_id" integer,
	"cliente" text NOT NULL,
	"produto" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"data" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "vendedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"empresa_id" integer NOT NULL,
	"regiao_id" integer,
	"telefone" text,
	"meta_mensal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status_atual" text DEFAULT 'offline' NOT NULL,
	"status_desde" timestamp with time zone DEFAULT now(),
	"ultimo_heartbeat" timestamp with time zone,
	CONSTRAINT "vendedores_user_id_unique" UNIQUE("user_id")
);

ALTER TABLE "alertas" ADD CONSTRAINT "alertas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_remetente_id_users_id_fk" FOREIGN KEY ("remetente_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_destinatario_id_users_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "regioes" ADD CONSTRAINT "regioes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_regiao_id_regioes_id_fk" FOREIGN KEY ("regiao_id") REFERENCES "public"."regioes"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "alertas_empresa_idx" ON "alertas" USING btree ("empresa_id","resolvido_em");
CREATE INDEX "anexos_checkin_idx" ON "anexos" USING btree ("checkin_id");
CREATE INDEX "atividades_vend_ts_idx" ON "atividades" USING btree ("vendedor_id","timestamp");
CREATE INDEX "checkins_vend_idx" ON "checkins" USING btree ("vendedor_id","entrada");
CREATE INDEX "colab_cliente_idx" ON "colaboradores" USING btree ("cliente_id");
CREATE INDEX "msg_dest_idx" ON "mensagens" USING btree ("destinatario_id","lida");
CREATE INDEX "refresh_user_idx" ON "refresh_tokens" USING btree ("user_id");
CREATE INDEX "users_empresa_idx" ON "users" USING btree ("empresa_id");
CREATE INDEX "vendas_vend_data_idx" ON "vendas" USING btree ("vendedor_id","data");
CREATE INDEX "vendedores_empresa_idx" ON "vendedores" USING btree ("empresa_id");
