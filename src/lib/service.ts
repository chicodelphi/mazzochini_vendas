import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, atividades, checkins, users, vendedores } from "@/db/schema";
import { publish } from "@/lib/realtime";
import { HttpError } from "@/lib/http";

export const STATUS = ["offline", "online", "em_atendimento", "em_pausa", "em_deslocamento"] as const;
export type Status = (typeof STATUS)[number];

export const HEARTBEAT_TIMEOUT_MS = 90_000; // 3 heartbeats perdidos (30s cada)
export const ALERTA_PARADO_MIN = Number(process.env.ALERTA_PARADO_MIN ?? 15);
export const ALERTA_PAUSA_MIN = Number(process.env.ALERTA_PAUSA_MIN ?? 30);

export async function getVendedorFull(vendedorId: number) {
  const [v] = await db
    .select({
      id: vendedores.id,
      userId: vendedores.userId,
      empresaId: vendedores.empresaId,
      regiaoId: vendedores.regiaoId,
      nome: users.nome,
      statusAtual: vendedores.statusAtual,
    })
    .from(vendedores)
    .innerJoin(users, eq(users.id, vendedores.userId))
    .where(eq(vendedores.id, vendedorId))
    .limit(1);
  if (!v) throw new HttpError(404, "Vendedor não encontrado");
  return v;
}

export async function checkinAberto(vendedorId: number) {
  const [c] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.vendedorId, vendedorId), isNull(checkins.saida)))
    .orderBy(desc(checkins.entrada))
    .limit(1);
  return c ?? null;
}

export async function criarAlerta(empresaId: number, vendedorId: number, tipo: string, mensagem: string) {
  const [open] = await db
    .select({ id: alertas.id })
    .from(alertas)
    .where(and(eq(alertas.vendedorId, vendedorId), eq(alertas.tipo, tipo), isNull(alertas.resolvidoEm)))
    .limit(1);
  if (open) return null;
  const [a] = await db.insert(alertas).values({ empresaId, vendedorId, tipo, mensagem }).returning();
  publish(empresaId, "alerta:novo", { alerta: a });
  return a;
}

export async function resolverAlertas(vendedorId: number, tipo: string) {
  await db
    .update(alertas)
    .set({ resolvidoEm: new Date() })
    .where(and(eq(alertas.vendedorId, vendedorId), eq(alertas.tipo, tipo), isNull(alertas.resolvidoEm)));
}

/**
 * Muda o status do vendedor, persiste a atividade e emite o evento em tempo real.
 * tipo: login | logout | offline | status  (descricao sempre guarda o código do novo status)
 */
export async function mudarStatus(
  vendedorId: number,
  novo: Status,
  tipo: "login" | "logout" | "offline" | "status",
) {
  const v = await getVendedorFull(vendedorId);
  const anterior = v.statusAtual as Status;
  const agora = new Date();

  await db
    .update(vendedores)
    .set({
      statusAtual: novo,
      statusDesde: agora,
      ultimoHeartbeat: novo === "offline" ? null : agora,
    })
    .where(eq(vendedores.id, vendedorId));
  await db.insert(atividades).values({ vendedorId, tipo, descricao: novo, timestamp: agora });

  await resolverAlertas(vendedorId, "parado");
  if (novo !== "em_pausa") await resolverAlertas(vendedorId, "pausa_longa");

  const base = { vendedorId, nome: v.nome, status: novo, anterior };
  if (novo === "offline") publish(v.empresaId, "vendedor:offline", { ...base, motivo: tipo });
  else if (anterior === "offline") publish(v.empresaId, "vendedor:online", base);
  else publish(v.empresaId, "vendedor:status_changed", base);
  return base;
}

/** Entrada do vendedor: volta "em atendimento" se havia um atendimento aberto, senão "online". */
export async function entrar(vendedorId: number) {
  const aberto = await checkinAberto(vendedorId);
  return mudarStatus(vendedorId, aberto ? "em_atendimento" : "online", "login");
}

export async function registrarHeartbeat(vendedorId: number) {
  const v = await getVendedorFull(vendedorId);
  if (v.statusAtual === "offline") return entrar(vendedorId);
  await db.update(vendedores).set({ ultimoHeartbeat: new Date() }).where(eq(vendedores.id, vendedorId));
  publish(v.empresaId, "vendedor:heartbeat", { vendedorId });
  return { vendedorId, status: v.statusAtual };
}

// ---------- Métricas de tempo (produtivo / ocioso / pausa) ----------

export type Tempos = {
  em_atendimento: number;
  em_deslocamento: number;
  em_pausa: number;
  online: number;
  offline: number;
};
const zero = (): Tempos => ({ em_atendimento: 0, em_deslocamento: 0, em_pausa: 0, online: 0, offline: 0 });

/** Calcula segundos em cada status para cada vendedor no intervalo [de, ate]. */
export async function calcularTempos(ids: number[], de: Date, ate: Date) {
  const out = new Map<number, Tempos>();
  ids.forEach((i) => out.set(i, zero()));
  if (!ids.length) return out;

  const eventos = await db
    .select({ vendedorId: atividades.vendedorId, status: atividades.descricao, ts: atividades.timestamp })
    .from(atividades)
    .where(
      and(
        inArray(atividades.vendedorId, ids),
        inArray(atividades.tipo, ["login", "logout", "offline", "status"]),
        gte(atividades.timestamp, de),
        lte(atividades.timestamp, ate),
      ),
    )
    .orderBy(atividades.timestamp);

  const antes = await db.execute(sql`
    SELECT DISTINCT ON (vendedor_id) vendedor_id AS "vendedorId", descricao AS status
    FROM atividades
    WHERE vendedor_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      AND tipo IN ('login','logout','offline','status') AND timestamp < ${de.toISOString()}
    ORDER BY vendedor_id, timestamp DESC`);

  const estado = new Map<number, { status: Status; desde: number }>();
  for (const r of antes.rows as { vendedorId: number; status: string }[])
    estado.set(r.vendedorId, { status: r.status as Status, desde: de.getTime() });

  const fecha = (id: number, ate_ms: number) => {
    const e = estado.get(id);
    if (!e) return;
    const t = out.get(id)!;
    const dur = Math.max(0, (ate_ms - e.desde) / 1000);
    if (e.status in t) t[e.status] += dur;
  };
  for (const ev of eventos) {
    fecha(ev.vendedorId, ev.ts.getTime());
    estado.set(ev.vendedorId, { status: (ev.status ?? "offline") as Status, desde: ev.ts.getTime() });
  }
  const fim = Math.min(ate.getTime(), Date.now());
  for (const id of ids) fecha(id, fim);
  return out;
}
