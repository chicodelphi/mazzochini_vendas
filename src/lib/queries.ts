import { and, desc, eq, getTableColumns, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, anexos, checkins, regioes, users, vendas, vendedores } from "@/db/schema";

export function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function inicioDoMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function listarVendedores(empresaId: number) {
  const rows = await db
    .select({
      id: vendedores.id,
      userId: vendedores.userId,
      nome: users.nome,
      email: users.email,
      ativo: users.ativo,
      telefone: vendedores.telefone,
      regiaoId: vendedores.regiaoId,
      regiao: regioes.nome,
      metaMensal: vendedores.metaMensal,
      status: vendedores.statusAtual,
      statusDesde: vendedores.statusDesde,
      ultimoHeartbeat: vendedores.ultimoHeartbeat,
      fotoAtualizadaEm: users.fotoAtualizadaEm,
    })
    .from(vendedores)
    .innerJoin(users, eq(users.id, vendedores.userId))
    .leftJoin(regioes, eq(regioes.id, vendedores.regiaoId))
    .where(eq(vendedores.empresaId, empresaId))
    .orderBy(users.nome);

  const mes = await db
    .select({
      vendedorId: vendas.vendedorId,
      total: sql<string>`coalesce(sum(${vendas.valor}),0)`,
      qtd: sql<number>`count(*)::int`,
    })
    .from(vendas)
    .innerJoin(vendedores, eq(vendedores.id, vendas.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), gte(vendas.data, inicioDoMes())))
    .groupBy(vendas.vendedorId);
  const hoje = await db
    .select({
      vendedorId: vendas.vendedorId,
      total: sql<string>`coalesce(sum(${vendas.valor}),0)`,
      qtd: sql<number>`count(*)::int`,
    })
    .from(vendas)
    .innerJoin(vendedores, eq(vendedores.id, vendas.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), gte(vendas.data, inicioDoDia())))
    .groupBy(vendas.vendedorId);
  const atend = await db
    .select({ vendedorId: checkins.vendedorId, qtd: sql<number>`count(*)::int` })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), gte(checkins.entrada, inicioDoDia())))
    .groupBy(checkins.vendedorId);

  // O que cada vendedor está fazendo agora: atendimento em aberto
  const abertos = await db
    .select({
      vendedorId: checkins.vendedorId,
      id: checkins.id,
      clienteNome: checkins.clienteNome,
      colaboradorNome: checkins.colaboradorNome,
      tipoContato: checkins.tipoContato,
      entrada: checkins.entrada,
    })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), isNull(checkins.saida)))
    .orderBy(desc(checkins.entrada));

  // Contatos marcados como "Refazer" que ainda não foram refeitos
  const pend = await db
    .select({
      vendedorId: checkins.vendedorId,
      qtd: sql<number>`count(*)::int`,
      atrasados: sql<number>`(count(*) filter (where ${checkins.refazerEm} < now()))::int`,
    })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), eq(checkins.resultado, "refazer"), eq(checkins.refeito, false)))
    .groupBy(checkins.vendedorId);

  const mMes = new Map(mes.map((m) => [m.vendedorId, m]));
  const mHoje = new Map(hoje.map((m) => [m.vendedorId, m]));
  const mAt = new Map(atend.map((m) => [m.vendedorId, m.qtd]));
  const mAb = new Map<number, (typeof abertos)[number]>();
  for (const a of abertos) if (!mAb.has(a.vendedorId)) mAb.set(a.vendedorId, a);
  const mPend = new Map(pend.map((p) => [p.vendedorId, p]));

  return rows.map(({ fotoAtualizadaEm, ...r }) => {
    const ab = mAb.get(r.id);
    return {
      ...r,
      fotoUrl: fotoAtualizadaEm ? `/api/usuarios/${r.userId}/foto?v=${fotoAtualizadaEm.getTime()}` : null,
      metaMensal: Number(r.metaMensal),
      vendasMes: Number(mMes.get(r.id)?.total ?? 0),
      vendasMesQtd: mMes.get(r.id)?.qtd ?? 0,
      vendasHoje: Number(mHoje.get(r.id)?.total ?? 0),
      vendasHojeQtd: mHoje.get(r.id)?.qtd ?? 0,
      atendimentosHoje: mAt.get(r.id) ?? 0,
      atendimentoAtual: ab
        ? {
            id: ab.id,
            clienteNome: ab.clienteNome,
            colaboradorNome: ab.colaboradorNome,
            tipoContato: ab.tipoContato,
            entrada: ab.entrada.toISOString(),
          }
        : null,
      refazerPendentes: mPend.get(r.id)?.qtd ?? 0,
      refazerAtrasados: mPend.get(r.id)?.atrasados ?? 0,
    };
  });
}

export async function alertasAbertos(empresaId: number, limit = 50) {
  return db
    .select({
      id: alertas.id,
      vendedorId: alertas.vendedorId,
      tipo: alertas.tipo,
      mensagem: alertas.mensagem,
      criadoEm: alertas.criadoEm,
    })
    .from(alertas)
    .where(and(eq(alertas.empresaId, empresaId), isNull(alertas.resolvidoEm)))
    .orderBy(desc(alertas.criadoEm))
    .limit(limit);
}

export async function listarAtendimentos(
  empresaId: number,
  opts: { vendedorId?: number; q?: string; tipo?: string; resultado?: string; limit?: number } = {},
) {
  const conds = [eq(vendedores.empresaId, empresaId)];
  if (opts.vendedorId) conds.push(eq(checkins.vendedorId, opts.vendedorId));
  if (opts.tipo) conds.push(eq(checkins.tipoContato, opts.tipo));
  switch (opts.resultado) {
    case "efetivo":
      conds.push(eq(checkins.resultado, "efetivo"));
      break;
    case "refazer":
      conds.push(eq(checkins.resultado, "refazer"));
      break;
    case "pendente": // refazer ainda não refeito
      conds.push(eq(checkins.resultado, "refazer"), eq(checkins.refeito, false));
      break;
    case "andamento":
      conds.push(isNull(checkins.saida));
      break;
  }
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(
      or(
        ilike(checkins.clienteNome, like),
        ilike(checkins.colaboradorNome, like),
        ilike(checkins.descricao, like),
        ilike(checkins.motivo, like),
        ilike(checkins.emailEmpresa, like),
        ilike(checkins.emailColaborador, like),
        ilike(checkins.telefoneColaborador, like),
      )!,
    );
  }
  const rows = await db
    .select({ ...getTableColumns(checkins), vendedorNome: users.nome })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .innerJoin(users, eq(users.id, vendedores.userId))
    .where(and(...conds))
    .orderBy(desc(checkins.entrada))
    .limit(opts.limit ?? 100);

  const ids = rows.map((r) => r.id);
  const files = ids.length
    ? await db
        .select({ id: anexos.id, checkinId: anexos.checkinId, nome: anexos.nome, mime: anexos.mime, tamanho: anexos.tamanho })
        .from(anexos)
        .where(inArray(anexos.checkinId, ids))
        .orderBy(anexos.id)
    : [];
  return rows.map((r) => ({ ...r, anexos: files.filter((f) => f.checkinId === r.id) }));
}

/** Contadores de efetividade dos contatos da empresa */
export async function resumoAtendimentos(empresaId: number) {
  const [r] = await db
    .select({
      efetivo: sql<number>`(count(*) filter (where ${checkins.resultado} = 'efetivo'))::int`,
      refazer: sql<number>`(count(*) filter (where ${checkins.resultado} = 'refazer'))::int`,
      pendente: sql<number>`(count(*) filter (where ${checkins.resultado} = 'refazer' and not ${checkins.refeito}))::int`,
      atrasado: sql<number>`(count(*) filter (where ${checkins.resultado} = 'refazer' and not ${checkins.refeito} and ${checkins.refazerEm} < now()))::int`,
      andamento: sql<number>`(count(*) filter (where ${checkins.saida} is null))::int`,
    })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .where(eq(vendedores.empresaId, empresaId));
  return r;
}
