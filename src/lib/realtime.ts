// Barramento de eventos em tempo real — versão compatível com serverless (Vercel).
//
// Antes: pub/sub em memória + SSE. Na Vercel cada requisição pode cair numa instância
// diferente, então a memória não é compartilhada. Agora cada evento é gravado na tabela
// `eventos` e os navegadores consultam /api/realtime/poll (short-polling, ~3 s).
import { waitUntil } from "@vercel/functions";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventos } from "@/db/schema";

export type RealtimeEvent =
  | "vendedor:online"
  | "vendedor:status_changed"
  | "vendedor:venda_registrada"
  | "vendedor:checkin_cliente"
  | "vendedor:checkout_cliente"
  | "vendedor:offline"
  | "vendedor:heartbeat"
  | "alerta:novo"
  | "mensagem:nova"
  | "dados:limpos";

export const REALTIME_EVENTS: RealtimeEvent[] = [
  "vendedor:online",
  "vendedor:status_changed",
  "vendedor:venda_registrada",
  "vendedor:checkin_cliente",
  "vendedor:checkout_cliente",
  "vendedor:offline",
  "vendedor:heartbeat",
  "alerta:novo",
  "mensagem:nova",
  "dados:limpos",
];

function gravar(empresaId: number, event: RealtimeEvent, data: Record<string, unknown>, escopo: "admin" | "todos", toUserId?: number) {
  const p = db
    .insert(eventos)
    .values({
      empresaId,
      evento: event,
      dados: { ...data, ts: new Date().toISOString() },
      escopo,
      paraUserId: toUserId ?? null,
    })
    .then(() => undefined)
    .catch((e) => console.error("[realtime] falha ao gravar evento", event, e));
  // garante que a gravação termine mesmo após a resposta HTTP ser enviada
  waitUntil(p);
  return p;
}

/**
 * Publica evento.
 * - Admins da empresa recebem todos os eventos.
 * - `toUserId` (ex.: mensagem) entrega também ao usuário-alvo.
 */
export function publish(empresaId: number, event: RealtimeEvent, data: Record<string, unknown>, toUserId?: number) {
  return gravar(empresaId, event, data, "admin", toUserId);
}

/** Publica para TODOS os conectados da empresa (gestores e vendedores). */
export function publishAll(empresaId: number, event: RealtimeEvent, data: Record<string, unknown>) {
  return gravar(empresaId, event, data, "todos");
}

/** Último id de evento (cursor inicial do cliente). */
export async function ultimoEventoId() {
  const [r] = await db.select({ id: sql<number>`coalesce(max(${eventos.id}), 0)::bigint` }).from(eventos);
  return Number(r?.id ?? 0);
}

/** Eventos após `after` visíveis para o usuário. */
export async function buscarEventos(opts: { empresaId: number; userId: number; role: string; after: number; limit?: number }) {
  const visivel =
    opts.role === "admin"
      ? or(eq(eventos.escopo, "admin"), eq(eventos.escopo, "todos"), eq(eventos.paraUserId, opts.userId))
      : or(eq(eventos.escopo, "todos"), eq(eventos.paraUserId, opts.userId));
  return db
    .select({ id: eventos.id, evento: eventos.evento, dados: eventos.dados })
    .from(eventos)
    .where(and(eq(eventos.empresaId, opts.empresaId), gt(eventos.id, opts.after), visivel))
    .orderBy(eventos.id)
    .limit(opts.limit ?? 200);
}

/** Remove eventos antigos (chamado pelo monitor). */
export async function limparEventosAntigos(horas = 24) {
  await db.delete(eventos).where(lt(eventos.criadoEm, new Date(Date.now() - horas * 3600_000)));
}
