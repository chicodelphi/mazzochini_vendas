type Op = { m: "get" | "post" | "patch" | "delete"; tag: string; summary: string; body?: Record<string, string>; auth?: boolean };

const ops: Record<string, Op[]> = {
  "/api/auth/login": [{ m: "post", tag: "Auth", summary: "Login (JWT em cookie httpOnly + refresh token). Vendedor: registra entrada automaticamente", body: { email: "string", senha: "string" }, auth: false }],
  "/api/auth/refresh": [{ m: "post", tag: "Auth", summary: "Renova access token (rotaciona refresh token)", auth: false }],
  "/api/auth/logout": [{ m: "post", tag: "Auth", summary: "Logout (vendedor: registra saída automaticamente)" }],
  "/api/auth/me": [{ m: "get", tag: "Auth", summary: "Sessão atual" }],
  "/api/dashboard": [{ m: "get", tag: "Admin", summary: "KPIs, vendedores (status/posição) e alertas abertos" }],
  "/api/vendedores": [
    { m: "get", tag: "Admin", summary: "Lista vendedores com status ao vivo e metas" },
    { m: "post", tag: "Admin", summary: "Cadastra vendedor", body: { nome: "string", email: "string", senha: "string", telefone: "string", regiaoId: "integer", metaMensal: "number" } },
  ],
  "/api/vendedores/{id}": [
    { m: "get", tag: "Admin", summary: "Detalhe: timeline, vendas, atendimentos e tempos (?data=YYYY-MM-DD)" },
    { m: "patch", tag: "Admin", summary: "Atualiza vendedor/meta/região/ativo", body: { nome: "string", metaMensal: "number", regiaoId: "integer", ativo: "boolean" } },
    { m: "delete", tag: "Admin", summary: "Desativa vendedor" },
  ],
  "/api/regioes": [
    { m: "get", tag: "Admin", summary: "Lista regiões" },
    { m: "post", tag: "Admin", summary: "Cria região", body: { nome: "string" } },
  ],
  "/api/regioes/{id}": [{ m: "delete", tag: "Admin", summary: "Remove região" }],
  "/api/clientes": [
    { m: "get", tag: "Clientes", summary: "Lista clientes da empresa" },
    { m: "post", tag: "Clientes", summary: "Cadastra cliente", body: { nome: "string", email: "string", endereco: "string" } },
  ],
  "/api/admin/limpar": [{ m: "post", tag: "Admin", summary: "Apagar TODOS os dados da empresa (irreversível): vendedores e logins, clientes, colaboradores, regiões, atendimentos, anexos, vendas, alertas, mensagens. Mantém só as contas de gestor. confirmacao: LIMPAR", body: { confirmacao: "string" } }],
  "/api/alertas": [{ m: "get", tag: "Admin", summary: "Alertas automáticos abertos" }],
  "/api/alertas/{id}": [{ m: "patch", tag: "Admin", summary: "Resolve alerta" }],
  "/api/relatorios": [{ m: "get", tag: "Relatórios", summary: "Relatório de vendas, tempo produtivo/ocioso e metas (?de&ate&vendedorId)" }],
  "/api/relatorios/export": [{ m: "get", tag: "Relatórios", summary: "Exporta Excel (.xlsx)" }],
  "/api/mensagens": [
    { m: "get", tag: "Chat", summary: "Conversa com ?com=<userId> (marca como lidas)" },
    { m: "post", tag: "Chat", summary: "Envia mensagem (emite mensagem:nova)", body: { destinatarioId: "integer", conteudo: "string" } },
  ],
  "/api/realtime/poll": [{ m: "get", tag: "Tempo real", summary: "Polling (?after=cursor): vendedor:online, vendedor:status_changed, vendedor:venda_registrada, vendedor:checkin_cliente, vendedor:offline, alerta:novo, mensagem:nova" }],
  "/api/vendedor/me": [{ m: "get", tag: "Vendedor", summary: "Estado do vendedor logado, metas, check-in aberto" }],
  "/api/vendedor/status": [{ m: "post", tag: "Vendedor", summary: "Muda status (evento vendedor:status_changed)", body: { status: "online|em_atendimento|em_pausa|em_deslocamento" } }],
  "/api/vendedor/heartbeat": [{ m: "post", tag: "Vendedor", summary: "Heartbeat (30s). Sem heartbeat por 90s → offline" }],
  "/api/vendedor/vendas": [{ m: "post", tag: "Vendedor", summary: "Registra venda (evento vendedor:venda_registrada)", body: { clienteId: "integer", produto: "string", valor: "number" } }],
  "/api/vendedor/checkins": [
    { m: "post", tag: "Vendedor", summary: "Inicia atendimento (evento vendedor:checkin_cliente). Local fixo: Sede da empresa. Cadastra empresa/colaborador se novos", body: { clienteId: "integer", clienteNome: "string", emailEmpresa: "string", colaboradorId: "integer", colaboradorNome: "string", emailColaborador: "string", telefoneColaborador: "string", tipoContato: "email|carta|presencial|ligacao|whatsapp|whatsapp_ligacao", refazerDeId: "integer" } },
    { m: "patch", tag: "Vendedor", summary: "Finaliza atendimento (multipart/form-data): descricao, resultado (efetivo|refazer), motivo + refazerEm (obrigatórios se refazer), arquivos[] (histórico, até 5 x 10 MB). Hora de fim automática" },
  ],
  "/api/colaboradores": [
    { m: "get", tag: "Clientes", summary: "Colaboradores de uma empresa cliente (?clienteId=)" },
    { m: "post", tag: "Clientes", summary: "Cadastra colaborador", body: { clienteId: "integer", nome: "string", email: "string" } },
  ],
  "/api/vendedor/atendimentos": [{ m: "get", tag: "Vendedor", summary: "Atendimentos do próprio vendedor (?q&resultado=efetivo|refazer|pendente|andamento) com início/fim, resultado, motivo e anexos" }],
  "/api/atendimentos": [{ m: "get", tag: "Admin", summary: "Atendimentos da equipe (?q&vendedorId&tipo&resultado=efetivo|refazer|pendente|andamento) com início/fim, resultado, motivo e anexos; retorna resumo de efetividade" }],
  "/api/anexos/{id}": [{ m: "get", tag: "Admin", summary: "Download do histórico da conversa" }],
  "/api/empresas": [
    { m: "get", tag: "Super Admin", summary: "Lista empresas/equipes" },
    { m: "post", tag: "Super Admin", summary: "Cria empresa + admin", body: { nome: "string", adminNome: "string", adminEmail: "string", adminSenha: "string" } },
  ],
};

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [p, list] of Object.entries(ops)) {
    paths[p] = {};
    for (const o of list) {
      const params = p.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "integer" } }] : [];
      paths[p][o.m] = {
        tags: [o.tag],
        summary: o.summary,
        parameters: params,
        ...(o.body
          ? {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: Object.fromEntries(
                        Object.entries(o.body).map(([k, t]) => [
                          k,
                          t.includes("|") ? { type: "string", enum: t.split("|") } : { type: t },
                        ]),
                      ),
                    },
                  },
                },
              },
            }
          : {}),
        responses: { "200": { description: "OK" }, "400": { description: "Dados inválidos" }, "401": { description: "Não autenticado" }, "403": { description: "Sem permissão" }, "429": { description: "Rate limit" } },
        ...(o.auth === false ? {} : { security: [{ cookieAuth: [] }] }),
      };
    }
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Controle de Vendedores – API",
      version: "1.0.0",
      description:
        "API REST + stream SSE em tempo real. Autenticação: JWT (access 15 min) + refresh token (7 dias) em cookies httpOnly. Faça login em /api/auth/login antes de testar.",
    },
    components: { securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" } } },
    paths,
  };
}
