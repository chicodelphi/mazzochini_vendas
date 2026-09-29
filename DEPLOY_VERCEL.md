# Deploy na Vercel + banco PostgreSQL (Neon) — Guia passo a passo

Sistema: **Controle de Vendedores — Mazzochini** (Next.js 16 + PostgreSQL + Drizzle).

---

## 1. O que foi ajustado para rodar na Vercel

A Vercel roda o back-end como **funções serverless**: não existe um servidor ligado o tempo todo e cada
requisição pode cair numa instância diferente. O projeto original foi feito para Docker (servidor único),
então estas partes precisaram mudar:

| Problema no original | Por que quebra na Vercel | Ajuste feito |
|---|---|---|
| Tempo real por **SSE + pub/sub em memória** (`realtime.ts`) | A memória não é compartilhada entre instâncias; o gestor não recebia os eventos do vendedor | Eventos gravados na tabela **`eventos`** do PostgreSQL; navegador consulta **`/api/realtime/poll`** a cada 3 s (15 s com a aba em segundo plano). O hook `useRealtime` manteve a mesma interface, as telas não mudaram |
| **Monitor** de heartbeat/alertas com `setInterval` (`instrumentation.ts`) | Não há processo contínuo | `tickSeDevido()` roda "de carona" nas requisições de polling/heartbeat (via `after()`), no máx. 1x a cada 25 s no sistema todo (trava atômica na tabela `sistema_kv`). Cron diário em `vercel.json` faz limpeza. Em Docker o loop continua funcionando |
| Upload de anexos de **até 5 × 10 MB** | A Vercel limita o corpo da requisição a **4,5 MB** | Limite de **4 MB somando os arquivos** + **compressão automática de imagens no navegador** (`src/lib/imagem.ts`) |
| Pool de conexões `pg` padrão | Serverless abre muitas conexões | Pool pequeno (5) + `attachDatabasePool` (`@vercel/functions`) + conexão *pooled* do Neon |
| Schema criado só no start do container | Não há "start" na Vercel | Script **`vercel-build`** roda `db-init` (schema + migrações idempotentes) antes do `next build` |
| Contas demo `admin/admin` criadas no 1º login | Inseguro em produção | Se `ADMIN_EMAIL` + `ADMIN_PASSWORD` estiverem definidos, cria só a empresa e o gestor |
| Cookie `Secure` dependia de variável | — | Na Vercel (HTTPS) já é `Secure` por padrão |
| `public/sede.jpg` inexistente (imagem quebrada) e logo provisório | — | Foto da fachada e logo oficial copiados para `public/` |

**Novo — fotos dos funcionários:** colunas `foto`, `foto_mime`, `foto_atualizada_em` em `users`.
A imagem é recortada em quadrado 512×512 e comprimida (~50 KB) no navegador e salva no **próprio
PostgreSQL**. Rotas: `GET/PUT/DELETE /api/usuarios/[id]/foto`. Aparece no cadastro de vendedores
(novo/editar), no dashboard, no detalhe do vendedor e no app do vendedor.

Arquivos novos: `vercel.json`, `DEPLOY_VERCEL.md`, `db/migrations/001_vercel.sql`, `src/lib/imagem.ts`,
`src/components/Avatar.tsx`, `src/app/api/realtime/poll/route.ts`, `src/app/api/cron/monitor/route.ts`,
`src/app/api/usuarios/[id]/foto/route.ts`, `public/logo.jpg`, `public/sede.jpg`.

---

## 2. Qual banco usar

A Vercel não tem mais um "Vercel Postgres" próprio: o Postgres é oferecido pelo **Marketplace da Vercel**,
e o recomendado é o **Neon** (Postgres serverless). A integração cria o banco e injeta as variáveis de
ambiente no projeto automaticamente — o banco fica gerenciado e cobrado dentro da conta Vercel.

O plano gratuito do Neon (≈ 0,5 GB) é suficiente para este sistema: nomes, atendimentos, vendas e fotos
de ~50 KB (1.000 fotos ≈ 50 MB). Os anexos de atendimento são o que mais ocupa espaço — acompanhe o uso
no painel do Neon. *(Confira os limites atuais no site da Vercel/Neon, pois mudam com o tempo.)*

---

## 3. Passo a passo

### 3.1 Subir o código para o GitHub
```bash
cd real-time-salesperson-management-system
git init
git add .
git commit -m "Sistema Mazzochini pronto para Vercel"
# crie um repositório PRIVADO no GitHub e:
git remote add origin https://github.com/SEU_USUARIO/mazzochini-vendedores.git
git branch -M main
git push -u origin main
```
> O `.gitignore` já exclui `node_modules`, `.next`, `.env` e `.vercel`. **Nunca** suba o arquivo `.env`.

### 3.2 Criar o projeto na Vercel
1. Acesse **vercel.com → Add New… → Project** e importe o repositório.
2. Framework: **Next.js** (detectado sozinho). Não altere Build/Output — o `vercel-build` do
   `package.json` é usado automaticamente.
3. **Ainda não clique em Deploy** (ou deixe falhar; tudo bem — faremos o redeploy depois).

### 3.3 Criar o banco (Neon) pela Vercel
1. No projeto: aba **Storage → Create Database → Neon (Serverless Postgres)** → *Continue*.
2. Região: **São Paulo (aws-sa-east-1)** — combina com a região das funções em `vercel.json` (`gru1`).
3. Plano: **Free**. Nome: `mazzochini-db`.
4. Em *Connect Project*, marque os ambientes **Production, Preview e Development**.
5. Pronto: a Vercel cria as variáveis `DATABASE_URL` (conexão com pool), `DATABASE_URL_UNPOOLED`
   (conexão direta, usada para criar as tabelas) e as `POSTGRES_*`. O código já lê essas variáveis.

### 3.4 Variáveis de ambiente
**Settings → Environment Variables** (marque *Production* e *Preview*):

| Variável | Valor | Obrigatória |
|---|---|---|
| `JWT_SECRET` | texto aleatório longo (ver comando abaixo) | **Sim** |
| `CRON_SECRET` | outro texto aleatório | Sim |
| `ADMIN_EMAIL` | e-mail do gestor, ex.: `gestor@mazzochini.com.br` | Recomendado |
| `ADMIN_PASSWORD` | senha forte do gestor | Recomendado |
| `ADMIN_NOME` | nome do gestor | Opcional |
| `EMPRESA_NOME` | `Mazzochini Materiais Laboratoriais` | Opcional |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | conta super admin | Opcional |
| `ALERTA_PARADO_MIN` / `ALERTA_PAUSA_MIN` | `15` / `30` | Opcional |

Gerar segredos (no terminal):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
> Sem `ADMIN_EMAIL`/`ADMIN_PASSWORD` o sistema cria os **dados de demonstração**
> (`admin@admin.com` / `admin`). Use isso só para testar.

### 3.5 Deploy
**Deployments → ⋯ → Redeploy** (ou faça um novo `git push`). No log do build deve aparecer:
```
[db-init] schema base criado
[db-init] migração aplicada: 001_vercel.sql
```
Nos próximos deploys aparece `schema base já existe` — as migrações são idempotentes (podem rodar sempre).

### 3.6 Testar
1. `https://SEU-PROJETO.vercel.app/api/health` → `{"ok":true}`
2. Acesse `/login` e entre com o `ADMIN_EMAIL`/`ADMIN_PASSWORD` (a conta é criada no 1º login).
3. **Vendedores** → cadastre um funcionário com **foto**.
4. Abra `/vendedor` em outra janela (anônima) com o login do vendedor, troque o status e veja o painel
   do gestor atualizar em ~3 s.

### 3.7 Domínio próprio (opcional)
**Settings → Domains** → ex.: `vendas.mazzochini.com.br` e crie o CNAME indicado pela Vercel no seu DNS.

---

## 4. Desenvolvimento local

Opção A — usar o mesmo banco do Neon (branch de desenvolvimento):
```bash
npm i -g vercel
vercel link            # vincula a pasta ao projeto
vercel env pull .env.local
npm install
npm run db:init
npm run dev
```
Opção B — Postgres local via Docker: `docker compose up --build` (continua funcionando).

---

## 5. PROMPT pronto para uso com um assistente de IA

Copie e cole o texto abaixo em um assistente (Claude, v0, Cursor etc.) se quiser ajuda guiada
na integração ou para dar manutenção futura:

```text
Você é um engenheiro sênior de DevOps/Full-stack. Preciso publicar na Vercel um sistema
Next.js 16 (App Router, route handlers em runtime Node) com PostgreSQL via Drizzle ORM (driver `pg`).
O projeto JÁ está adaptado para serverless:
- conexão em src/db/index.ts lê DATABASE_URL (ou POSTGRES_URL), pool max 5 e attachDatabasePool;
- script "vercel-build" = "node scripts/db-init.mjs && next build": cria o schema (db/init.sql) se o banco
  estiver vazio e aplica db/migrations/*.sql (idempotentes), usando DATABASE_URL_UNPOOLED quando existir;
- tempo real por short-polling em /api/realtime/poll (tabela `eventos`), sem SSE/WebSocket;
- monitor de alertas roda via after() nas requisições + cron diário em vercel.json (/api/cron/monitor,
  protegido por CRON_SECRET);
- fotos dos funcionários salvas em bytea na tabela users (512x512 JPEG gerado no navegador);
- anexos limitados a 4 MB por requisição (limite de 4,5 MB da Vercel).

Tarefa: me guie, passo a passo e em português, para:
1) subir o código para um repositório privado no GitHub;
2) importar o projeto na Vercel;
3) criar um banco Neon pelo Marketplace da Vercel (Storage → Neon), região São Paulo (aws-sa-east-1),
   conectado aos ambientes Production/Preview/Development, e confirmar que DATABASE_URL e
   DATABASE_URL_UNPOOLED foram criadas;
4) cadastrar as variáveis JWT_SECRET, CRON_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOME,
   EMPRESA_NOME (gerar os segredos com crypto.randomBytes);
5) fazer o deploy e validar no log "[db-init] schema base criado" e em /api/health;
6) testar login do gestor, cadastro de vendedor com foto e atualização em tempo real;
7) configurar domínio próprio e rodar localmente com `vercel env pull`.
Para cada passo diga onde clicar, o que conferir e como resolver erros comuns
(ex.: "DATABASE_URL não definida", timeout de conexão, 413 Payload Too Large, 401 no cron).
```

---

## 6. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Build: `[db-init] DATABASE_URL não definida — pulando` | O banco não foi conectado ao ambiente (Preview/Production). Refaça o passo 3.3 e redeploy |
| Erro 500 e log `[db] DATABASE_URL não definida` | Idem acima |
| Login funciona mas "desloga" sozinho | `JWT_SECRET` ausente ou diferente entre deploys — defina e redeploy |
| `413` ao finalizar atendimento | Arquivos passam de 4 MB somados — enviar menos/menores (imagens já são comprimidas) |
| Painel demora alguns segundos para atualizar | Normal: polling de 3 s (15 s com a aba em segundo plano) |
| Vendedor não fica "offline" na hora | O monitor roda quando alguém está usando o sistema (polling/heartbeat); com o gestor aberto, detecta em até ~2 min |
| Primeira requisição lenta pela manhã | O Neon "hiberna" o banco sem uso (plano Free) e acorda em ~1 s |

## 7. Evoluções recomendadas (quando crescer)
- **Anexos grandes (> 4 MB):** migrar anexos para **Vercel Blob** com *client upload* (sem limite de 4,5 MB),
  guardando só a URL no PostgreSQL.
- **Rate limit distribuído:** hoje é em memória por instância (proteção parcial). Para reforçar o login,
  usar **Upstash Redis** (Marketplace) ou o **Vercel Firewall**.
- **Tempo real instantâneo:** trocar o polling por um serviço de push (Ably/Pusher/Supabase Realtime)
  dentro de `src/lib/realtime.ts`, sem mudar as telas.
