import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, vendas, vendedores } from "@/db/schema";
import { listarVendedores } from "@/lib/queries";
import { calcularTempos } from "@/lib/service";

export type LinhaRelatorio = {
  vendedorId: number;
  nome: string;
  regiao: string | null;
  vendas: number;
  qtdVendas: number;
  ticketMedio: number;
  atendimentos: number;
  efetivos: number;
  refazer: number;
  meta: number;
  atingimento: number;
  horasProdutivas: number;
  horasOciosas: number;
  horasPausa: number;
  horasOnline: number;
};

export function parsePeriodo(de?: string | null, ate?: string | null) {
  const fim = ate ? new Date(`${ate}T23:59:59.999`) : new Date();
  const ini = de ? new Date(`${de}T00:00:00`) : new Date(fim.getFullYear(), fim.getMonth(), 1);
  return { ini, fim };
}

export async function gerarRelatorio(empresaId: number, ini: Date, fim: Date, vendedorId?: number) {
  const todos = (await listarVendedores(empresaId)).filter((v) => !vendedorId || v.id === vendedorId);
  const ids = todos.map((v) => v.id);

  const vRows = await db
    .select({
      vendedorId: vendas.vendedorId,
      total: sql<string>`coalesce(sum(${vendas.valor}),0)`,
      qtd: sql<number>`count(*)::int`,
    })
    .from(vendas)
    .innerJoin(vendedores, eq(vendedores.id, vendas.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), gte(vendas.data, ini), lte(vendas.data, fim)))
    .groupBy(vendas.vendedorId);
  const cRows = await db
    .select({
      vendedorId: checkins.vendedorId,
      qtd: sql<number>`count(*)::int`,
      efetivos: sql<number>`(count(*) filter (where ${checkins.resultado} = 'efetivo'))::int`,
      refazer: sql<number>`(count(*) filter (where ${checkins.resultado} = 'refazer'))::int`,
    })
    .from(checkins)
    .innerJoin(vendedores, eq(vendedores.id, checkins.vendedorId))
    .where(and(eq(vendedores.empresaId, empresaId), gte(checkins.entrada, ini), lte(checkins.entrada, fim)))
    .groupBy(checkins.vendedorId);
  const porDia = await db.execute(sql`
    SELECT to_char(v.data, 'YYYY-MM-DD') AS dia, sum(v.valor)::float AS total, count(*)::int AS qtd
    FROM vendas v JOIN vendedores ve ON ve.id = v.vendedor_id
    WHERE ve.empresa_id = ${empresaId} AND v.data >= ${ini.toISOString()} AND v.data <= ${fim.toISOString()}
    ${vendedorId ? sql`AND v.vendedor_id = ${vendedorId}` : sql``}
    GROUP BY 1 ORDER BY 1`);

  const tempos = await calcularTempos(ids, ini, fim);
  const mv = new Map(vRows.map((r) => [r.vendedorId, r]));
  const mc = new Map(cRows.map((r) => [r.vendedorId, r]));
  const dias = Math.max(1, (fim.getTime() - ini.getTime()) / 86_400_000);
  const h = (s: number) => Math.round((s / 3600) * 100) / 100;

  const linhas: LinhaRelatorio[] = todos.map((v) => {
    const t = tempos.get(v.id)!;
    const total = Number(mv.get(v.id)?.total ?? 0);
    const qtd = mv.get(v.id)?.qtd ?? 0;
    const meta = Math.round(v.metaMensal * (dias / 30) * 100) / 100;
    return {
      vendedorId: v.id,
      nome: v.nome,
      regiao: v.regiao,
      vendas: total,
      qtdVendas: qtd,
      ticketMedio: qtd ? total / qtd : 0,
      atendimentos: mc.get(v.id)?.qtd ?? 0,
      efetivos: mc.get(v.id)?.efetivos ?? 0,
      refazer: mc.get(v.id)?.refazer ?? 0,
      meta,
      atingimento: meta ? (total / meta) * 100 : 0,
      horasProdutivas: h(t.em_atendimento + t.em_deslocamento),
      horasOciosas: h(t.online),
      horasPausa: h(t.em_pausa),
      horasOnline: h(t.online + t.em_atendimento + t.em_deslocamento + t.em_pausa),
    };
  });

  const soma = (k: keyof LinhaRelatorio) => linhas.reduce((s, l) => s + Number(l[k]), 0);
  return {
    periodo: { de: ini.toISOString(), ate: fim.toISOString() },
    resumo: {
      vendas: soma("vendas"),
      qtdVendas: soma("qtdVendas"),
      atendimentos: soma("atendimentos"),
      efetivos: soma("efetivos"),
      refazer: soma("refazer"),
      meta: soma("meta"),
      horasProdutivas: soma("horasProdutivas"),
      horasOciosas: soma("horasOciosas"),
      horasPausa: soma("horasPausa"),
    },
    linhas,
    porDia: porDia.rows as { dia: string; total: number; qtd: number }[],
  };
}
