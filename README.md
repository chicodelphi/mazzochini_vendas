# 📍 Controle de Vendedores — monitoramento em tempo real

Sistema full-stack para o gestor acompanhar ao vivo o que cada vendedor está fazendo (status, atendimentos a clientes, vendas, pausas, metas), com app mobile para o vendedor.

## Arquitetura

```
 ┌──────────────────────┐   POST eventos (status, GPS, venda, check-in, heartbeat 30s)
 │  App do Vendedor     │ ───────────────────────────────┐
 │  (mobile, /vendedor) │ ◄── SSE: mensagens do gestor   │
 └──────────────────────┘                                ▼
                                        ┌────────────────────────────────────┐
 ┌──────────────────────┐   REST + SSE  │  Next.js (App Router, Node runtime) │
 │  Dashboard Admin     │ ◄───────────► │  ├─ /api/*   REST (Zod, RBAC, rate  │
 │  (desktop, /admin)   │  eventos ao   │  │            limit, JWT+refresh)   │
 │  mapa Leaflet + KPIs │  vivo         │  ├─ realtime.ts  barramento pub/sub │
 └──────────────────────┘               │  │   → /api/realtime/stream (SSE)   │
 ┌──────────────────────┐               │  └─ monitor.ts  (30s) heartbeat →   │
 │  Super Admin (/super)│ ◄───────────► │        offline + alertas automáticos│
 └──────────────────────┘               └───────────────┬────────────────────┘
                                                        ▼
                                              PostgreSQL (Drizzle ORM)
```

**Fluxo em tempo real:** vendedor envia evento (status, atendimento, venda, heartbeat) → API valida e persiste no PostgreSQL → `publish()` emite para todos os admins da empresa via SSE → dashboard atualiza mapa, lista e KPIs instantaneamente. Heartbeat a cada 30 s; sem heartbeat por 90 s o vendedor é marcado **offline** (`vendedor:offline`).

Eventos: `vendedor:online`, `vendedor:status_changed`, `vendedor:venda_registrada`, `vendedor:checkin_cliente`, `vendedor:checkout_cliente`, `vendedor:offline`, `alerta:novo`, `mensagem:nova`.

### Decisões de stack (adaptação)
| Pedido | Implementado | Motivo |
|---|---|---|
| Express/NestJS + Socket.IO | Next.js Route Handlers + **SSE** | servidor único e deploy simples; SSE é unidirecional (servidor→cliente) e o caminho de subida usa POST, o que cobre o fluxo descrito. Migrar para Socket.IO é trivial: troque `publish()`. |
| Redis (status ao vivo) | Status ao vivo em colunas do PostgreSQL + pub/sub em memória | suficiente p/ 500+ vendedores em 1 instância. Para várias réplicas, publique em Redis Pub/Sub dentro de `src/lib/realtime.ts` (container `redis` já está no compose). |
| JWT + Refresh | ✔ access token 15 min + refresh 7 dias (rotativo, hash no banco), cookies httpOnly | |
| Swagger | ✔ `/docs` (OpenAPI 3 em `/api/docs`) | |

## Módulos
- **Auth** (`src/app/api/auth`, `src/lib/auth.ts`): login/refresh/logout; vendedor tem entrada/saída registradas automaticamente.
- **Vendedores/regiões/metas** (`/api/vendedores`, `/api/regioes`, `/admin/vendedores`).
- **Real-time** (`src/lib/realtime.ts`, `src/lib/service.ts`, `src/lib/monitor.ts`).
- **Dashboard** (`/admin`): mapa, KPIs, lista com filtros, alertas, feed ao vivo.
- **Detalhe do vendedor** (`/admin/vendedores/[id]`): timeline, atendimentos, tempos produtivo/ocioso/pausa, chat.
- **Atendimentos** (`/admin/atendimentos`): histórico de contatos com busca/filtros, descritivo e download do histórico da conversa.
- **App do vendedor** (`/vendedor`): status, atendimento (empresa, e-mails, colaborador, tipo de contato, descritivo, upload do histórico), vendas, metas, chat.
- **Relatórios** (`/admin/relatorios`): período/vendedor, gráficos, exportação **Excel** (servidor) e **PDF** (cliente).
- **Super Admin** (`/super`): empresas/equipes (multi-tenant).

## Atendimentos: início/fim, Efetivo ou Refazer
- Hora de **início** (ao iniciar) e **fim** (ao finalizar) são registradas automaticamente e exibidas em todos os cartões.
- Ao finalizar, o vendedor classifica o contato como **Efetivo** ou **Refazer**. Em "Refazer" são obrigatórios o **motivo** (por que não foi efetivo) e **quando refazer**.
- Contatos "Refazer" aparecem no app do vendedor com o botão "Refazer agora" (pré-preenche o atendimento e marca o original como refeito) e no painel do gestor (pendentes/atrasados).
- O gestor vê **em tempo real o que cada vendedor está fazendo** (atendendo quem, tipo de contato, desde quando; pausa; deslocamento; disponível).
- **Apagar dados** (menu do gestor): apaga TUDO da empresa (vendedores e logins, clientes, colaboradores, regiões, atendimentos, anexos, vendas, alertas, mensagens) e reinicia os contadores de ID. Exige digitar `LIMPAR`. Só as contas de gestor permanecem, para manter o acesso. Irreversível.

## Alertas automáticos
- **Refazer atrasado**: contato marcado como "Refazer" cujo prazo venceu sem ser refeito.
- **Ocioso/parado**: status "online" (sem atendimento) por `ALERTA_PARADO_MIN` min (padrão 15).
- **Pausa longa**: pausa acima de `ALERTA_PAUSA_MIN` min (padrão 30).

## 🚀 Deploy na Vercel (recomendado)
Veja **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)** — passo a passo com banco Neon (Marketplace da Vercel),
variáveis de ambiente e um prompt pronto para assistentes de IA. Resumo: importar o repositório na Vercel →
Storage → Neon → definir `JWT_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` → Deploy.
Na Vercel o tempo real usa polling em `/api/realtime/poll` (tabela `eventos`) e o monitor de alertas roda sob demanda.

## Executando

### Docker (recomendado)
```bash
docker compose up --build
# http://localhost:3000
```
O container `app` cria as tabelas sozinho na primeira execução (`scripts/db-init.mjs` + `db/init.sql`).
Antes de publicar, edite no `docker-compose.yml`: `JWT_SECRET` (segredo longo e aleatório) e `COOKIE_SECURE: "true"` (atrás de HTTPS).

### Deploy em produção (checklist)
1. Suba o código (o `.gitignore` já exclui `node_modules`, `.next` e `.env`).
2. Banco PostgreSQL 16+ (o do compose ou gerenciado). Defina `DATABASE_URL`; o schema é criado no primeiro start.
3. Variáveis: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE=true`.
4. Coloque um proxy HTTPS (Caddy/Nginx/Traefik) na frente da porta 3000. O tempo real (SSE) exige desligar o buffering do proxy (`X-Accel-Buffering: no` já é enviado).
5. O tempo real agora usa a tabela `eventos` do PostgreSQL (funciona com várias réplicas e na Vercel). O limite de requisições continua em memória por instância.
6. Troque as senhas de demonstração (`admin`, `funcionario`) e substitua `public/logo.svg` e `public/sede.jpg` pelos arquivos oficiais.

### Local
```bash
cp .env.example .env
npm install
npx drizzle-kit push      # ou: psql -f db/init.sql
npm run dev
```

Na primeira tentativa de login com o banco vazio, dados de demonstração são criados:

| Perfil | E-mail | Senha |
|---|---|---|
| Gestor | admin@admin.com | admin |
| Funcionário (vendedor) | funcionario@funcionario.com (e vendedor2…5@demo.com) | funcionario |
| Super Admin | super@demo.com | funcionario |

**Para ver o tempo real:** abra `/admin` em uma aba e `/vendedor` (login de vendedor, de preferência em janela anônima) em outra; troque status, registre venda, faça check-in e envie mensagens.

## Segurança / LGPD
- Senhas com bcrypt; JWT em cookies httpOnly/SameSite=Lax (`COOKIE_SECURE=true` atrás de HTTPS); cabeçalhos de segurança (HSTS etc.) em `next.config.ts`.
- Validação de entrada com Zod, RBAC por rota, isolamento por empresa, rate limiting (login: 10/min).
- **HTTPS**: termine TLS em proxy reverso (Caddy/Nginx/Traefik) na frente do container `app`.
- **Localização**: o sistema não coleta GPS; o local dos vendedores é sempre exibido como "Sede da empresa" (foto em `public/sede.jpg`, substitua pela foto oficial).
- **Fotos dos funcionários**: salvas no PostgreSQL (512×512 JPEG, ~50 KB), rotas `/api/usuarios/[id]/foto`.
- **Anexos**: histórico das conversas (até 5 arquivos, 4 MB no total — limite da Vercel; imagens são comprimidas no navegador) é salvo no PostgreSQL e só é baixado por gestores da empresa ou pelo vendedor autor.
- Defina um `JWT_SECRET` forte em produção.

## Scripts SQL
`db/init.sql` cria todo o schema (gerado a partir de `src/db/schema.ts`).

## Estrutura
```
src/
  app/
    api/            REST + SSE (auth, vendedores, vendedor, dashboard, relatorios, mensagens, alertas, regioes, clientes, empresas, realtime, docs)
    login/ admin/ vendedor/ super/ docs/   telas
  components/       LiveMap (Leaflet), Chat
  db/               schema Drizzle + conexão
  lib/              auth, http (wrapper de rotas), realtime, service, monitor, relatorio, seed, ...
  instrumentation.ts  inicia o monitor de heartbeat/alertas
db/init.sql · Dockerfile · docker-compose.yml
```
