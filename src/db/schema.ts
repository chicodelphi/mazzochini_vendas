import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Empresas / equipes (multi-tenant – gerenciado pelo Super Admin) */
export const empresas = pgTable("empresas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").references(() => empresas.id),
    nome: text("nome").notNull(),
    email: text("email").notNull().unique(),
    senhaHash: text("senha_hash").notNull(),
    /** super_admin | admin | vendedor */
    role: text("role").notNull().default("vendedor"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    /** Foto do funcionário (JPEG/PNG/WebP redimensionado no navegador, ~50 KB) */
    foto: bytea("foto"),
    fotoMime: text("foto_mime"),
    fotoAtualizadaEm: timestamp("foto_atualizada_em", { withTimezone: true }),
  },
  (t) => [index("users_empresa_idx").on(t.empresaId)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    revogado: boolean("revogado").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refresh_user_idx").on(t.userId)],
);

export const regioes = pgTable("regioes", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresas.id),
  nome: text("nome").notNull(),
});

export const vendedores = pgTable(
  "vendedores",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().unique().references(() => users.id),
    empresaId: integer("empresa_id").notNull().references(() => empresas.id),
    regiaoId: integer("regiao_id").references(() => regioes.id),
    telefone: text("telefone"),
    metaMensal: numeric("meta_mensal", { precision: 12, scale: 2 }).notNull().default("0"),
    /** offline | online | em_atendimento | em_pausa | em_deslocamento */
    statusAtual: text("status_atual").notNull().default("offline"),
    statusDesde: timestamp("status_desde", { withTimezone: true }).defaultNow(),
    ultimoHeartbeat: timestamp("ultimo_heartbeat", { withTimezone: true }),
  },
  (t) => [index("vendedores_empresa_idx").on(t.empresaId)],
);

/** Empresas clientes atendidas pelos vendedores */
export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  empresaId: integer("empresa_id").notNull().references(() => empresas.id),
  nome: text("nome").notNull(),
  email: text("email"),
  telefone: text("telefone"),
  endereco: text("endereco"),
});

/** Colaboradores (contatos) das empresas clientes */
export const colaboradores = pgTable(
  "colaboradores",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull().references(() => empresas.id),
    clienteId: integer("cliente_id").notNull().references(() => clientes.id),
    nome: text("nome").notNull(),
    email: text("email"),
    telefone: text("telefone"),
  },
  (t) => [index("colab_cliente_idx").on(t.clienteId)],
);

export const atividades = pgTable(
  "atividades",
  {
    id: serial("id").primaryKey(),
    vendedorId: integer("vendedor_id").notNull().references(() => vendedores.id),
    /** login | logout | status | venda | checkin | checkout | offline */
    tipo: text("tipo").notNull(),
    descricao: text("descricao"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("atividades_vend_ts_idx").on(t.vendedorId, t.timestamp)],
);

export const vendas = pgTable(
  "vendas",
  {
    id: serial("id").primaryKey(),
    vendedorId: integer("vendedor_id").notNull().references(() => vendedores.id),
    clienteId: integer("cliente_id").references(() => clientes.id),
    cliente: text("cliente").notNull(),
    produto: text("produto").notNull(),
    valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
    data: timestamp("data", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vendas_vend_data_idx").on(t.vendedorId, t.data)],
);

/**
 * Atendimentos (check-in em cliente). Local é sempre a "Sede da empresa".
 * tipoContato: email | carta | presencial | ligacao | whatsapp | whatsapp_ligacao
 */
export const checkins = pgTable(
  "checkins",
  {
    id: serial("id").primaryKey(),
    vendedorId: integer("vendedor_id").notNull().references(() => vendedores.id),
    clienteId: integer("cliente_id").references(() => clientes.id),
    clienteNome: text("cliente_nome").notNull(),
    emailEmpresa: text("email_empresa"),
    colaboradorId: integer("colaborador_id").references(() => colaboradores.id),
    colaboradorNome: text("colaborador_nome"),
    emailColaborador: text("email_colaborador"),
    telefoneColaborador: text("telefone_colaborador"),
    tipoContato: text("tipo_contato"),
    /** Descritivo de como foi o atendimento (preenchido ao finalizar) */
    descricao: text("descricao"),
    /** efetivo | refazer (preenchido ao finalizar) */
    resultado: text("resultado"),
    /** Por que não foi efetivo (obrigatório quando resultado = refazer) */
    motivo: text("motivo"),
    /** Quando o contato deve ser refeito (obrigatório quando resultado = refazer) */
    refazerEm: timestamp("refazer_em", { withTimezone: true }),
    /** true quando o contato "refazer" já foi refeito em um novo atendimento */
    refeito: boolean("refeito").notNull().default(false),
    /** Atendimento de origem, quando este contato refaz outro */
    refazerDeId: integer("refazer_de_id"),
    entrada: timestamp("entrada", { withTimezone: true }).notNull().defaultNow(),
    saida: timestamp("saida", { withTimezone: true }),
  },
  (t) => [index("checkins_vend_idx").on(t.vendedorId, t.entrada)],
);

/** Histórico da conversa (arquivos enviados pelo vendedor) */
export const anexos = pgTable(
  "anexos",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull().references(() => empresas.id),
    checkinId: integer("checkin_id").notNull().references(() => checkins.id),
    vendedorId: integer("vendedor_id").notNull().references(() => vendedores.id),
    nome: text("nome").notNull(),
    mime: text("mime").notNull(),
    tamanho: integer("tamanho").notNull(),
    dados: bytea("dados").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("anexos_checkin_idx").on(t.checkinId)],
);

export const mensagens = pgTable(
  "mensagens",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull().references(() => empresas.id),
    remetenteId: integer("remetente_id").notNull().references(() => users.id),
    destinatarioId: integer("destinatario_id").notNull().references(() => users.id),
    conteudo: text("conteudo").notNull(),
    lida: boolean("lida").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("msg_dest_idx").on(t.destinatarioId, t.lida)],
);

export const alertas = pgTable(
  "alertas",
  {
    id: serial("id").primaryKey(),
    empresaId: integer("empresa_id").notNull().references(() => empresas.id),
    vendedorId: integer("vendedor_id").notNull().references(() => vendedores.id),
    /** parado | pausa_longa */
    tipo: text("tipo").notNull(),
    mensagem: text("mensagem").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
  },
  (t) => [index("alertas_empresa_idx").on(t.empresaId, t.resolvidoEm)],
);

/**
 * Fila de eventos em tempo real (substitui o pub/sub em memória, que não funciona em serverless).
 * Os navegadores consultam /api/realtime/poll a cada poucos segundos. Limpeza: > 24 h.
 */
export const eventos = pgTable(
  "eventos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    empresaId: integer("empresa_id").notNull().references(() => empresas.id),
    evento: text("evento").notNull(),
    dados: jsonb("dados").notNull(),
    /** admin | todos */
    escopo: text("escopo").notNull().default("admin"),
    paraUserId: integer("para_user_id"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_empresa_id_idx").on(t.empresaId, t.id), index("eventos_criado_idx").on(t.criadoEm)],
);

/** Controle de tarefas periódicas (ex.: última execução do monitor) */
export const sistemaKv = pgTable("sistema_kv", {
  chave: text("chave").primaryKey(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});
