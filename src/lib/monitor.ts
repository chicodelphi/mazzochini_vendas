import { and, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, checkins, users, vendedores } from "@/db/schema";
import { limparEventosAntigos } from "@/lib/realtime";
import {
  ALERTA_PARADO_MIN,
  ALERTA_PAUSA_MIN,
  HEARTBEAT_TIMEOUT_MS,
  criarAlerta,
  mudarStatus,
  resolverAlertas,
} from "@/lib/service";

/**
 * Monitor de heartbeat e alertas automáticos:
 *  - vendedor sem heartbeat há > 90s → marcado OFFLINE + evento `vendedor:offline`
 *  - online (ocioso, sem atendimento) há X minutos → alerta "parado"
 *  - pausa acima do limite → alerta "pausa_longa"
 */
export async function tick() {
  const agora = Date.now();

  const mortos = await db
    .select({ id: vendedores.id })
    .from(vendedores)
    .where(
      and(
        ne(vendedores.statusAtual, "offline"),
        lt(vendedores.ultimoHeartbeat, new Date(agora - HEARTBEAT_TIMEOUT_MS)),
      ),
    );
  for (const m of mortos) await mudarStatus(m.id, "offline", "offline");

  const ativos = await db
    .select({
      id: vendedores.id,
      empresaId: vendedores.empresaId,
      nome: users.nome,
      status: vendedores.statusAtual,
      statusDesde: vendedores.statusDesde,
    })
    .from(vendedores)
    .innerJoin(users, eq(users.id, vendedores.userId))
    .where(and(ne(vendedores.statusAtual, "offline"), isNotNull(vendedores.statusDesde)));

  for (const v of ativos) {
    if (!v.statusDesde) continue;
    const min = Math.floor((agora - v.statusDesde.getTime()) / 60_000);
    if (v.status === "online" && min >= ALERTA_PARADO_MIN)
      await criarAlerta(v.empresaId, v.id, "parado", `${v.nome} está ocioso (sem atividade) há ${min} min`);
    if (v.status === "em_pausa" && min >= ALERTA_PAUSA_MIN)
      await criarAlerta(v.empresaId, v.id, "pausa_longa", `${v.nome} está em pausa há ${min} min`);
  }

  // Contatos marcados como "Refazer" cujo prazo venceu sem serem refeitos
  const atrasados = await db
    .select({
      vendedorId: checkins.vendedorId,
      empresaId: vendedores.empresaId,
      nome: users.nome,
      qtd: sql<number>`count(*)::int`,
    })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .innerJoin(users, eq(users.id, vendedores.userId))
    .where(and(eq(checkins.resultado, "refazer"), eq(checkins.refeito, false), lt(checkins.refazerEm, new Date())))
    .groupBy(checkins.vendedorId, vendedores.empresaId, users.nome);
  const comAtraso = new Set(atrasados.map((a) => a.vendedorId));
  for (const a of atrasados)
    await criarAlerta(a.empresaId, a.vendedorId, "refazer_atrasado", `${a.nome} tem ${a.qtd} contato(s) para refazer com o prazo vencido`);
  const abertos = await db
    .select({ vendedorId: alertas.vendedorId })
    .from(alertas)
    .where(and(eq(alertas.tipo, "refazer_atrasado"), isNull(alertas.resolvidoEm)));
  for (const a of abertos) if (!comAtraso.has(a.vendedorId)) await resolverAlertas(a.vendedorId, "refazer_atrasado");
}

/**
 * Executa o monitor no máximo 1x a cada `intervaloSeg` em TODO o sistema (trava atômica no banco).
 * Na Vercel não existe processo contínuo, então isto é chamado "de carona" pelas requisições
 * de polling/heartbeat (via `after()`), e também pelo Cron diário (/api/cron/monitor).
 */
export async function tickSeDevido(intervaloSeg = 25) {
  const r = await db.execute(sql`
    INSERT INTO sistema_kv (chave, atualizado_em) VALUES ('monitor', now())
    ON CONFLICT (chave) DO UPDATE SET atualizado_em = now()
    WHERE sistema_kv.atualizado_em < now() - make_interval(secs => ${intervaloSeg})
    RETURNING chave`);
  if (!r.rows.length) return false;
  await tick();
  // limpeza ocasional da fila de eventos (~1 a cada 20 execuções)
  if (Math.random() < 0.05) await limparEventosAntigos();
  return true;
}

const g = globalThis as typeof globalThis & { __monitor?: NodeJS.Timeout };

/** Somente fora da Vercel (Docker/servidor próprio): loop contínuo a cada 30 s. */
export function startMonitor() {
  if (g.__monitor) return;
  g.__monitor = setInterval(() => {
    tickSeDevido().catch((e) => console.error("[monitor]", e));
  }, 30_000);
  console.log("[monitor] heartbeat/alertas iniciado");
}
