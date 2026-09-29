FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# o build não acessa o banco; valor apenas para satisfazer a validação de env
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# cria o schema se o banco estiver vazio (db/init.sql) e sobe o servidor
CMD ["sh", "-c", "node scripts/db-init.mjs && npm run start"]
