import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  alertas,
  anexos,
  atividades,
  checkins,
  clientes,
  colaboradores,
  mensagens,
  refreshTokens,
  regioes,
  users,
  vendas,
  vendedores,
} from "@/db/schema";
import { requireEmpresa, route } from "@/lib/http";
import { publishAll } from "@/lib/realtime";

const schema = z.object({ confirmacao: z.literal("LIMPAR") });

const TABELAS = [
  "anexos", "checkins", "vendas", "atividades", "alertas", "mensagens",
  "colaboradores", "clientes", "regioes", "vendedores", "users", "refresh_tokens",
];

/**
 * APAGAR TUDO (somente gestor, confirmação digitada "LIMPAR"). Irreversível.
 * Apaga da empresa: vendedores (e seus logins), clientes, colaboradores, regiões,
 * atendimentos, anexos, vendas, atividades, alertas e mensagens.
 * Só permanecem as contas de gestor (senão ninguém conseguiria entrar de novo).
 */
export const POST = route({ roles: ["admin"], limit: 5 }, async (req, { session }) => {
  const empresaId = requireEmpresa(session);
  schema.parse(await req.json());

  const removidos = await db.transaction(async (tx) => {
    const vend = await tx
      .select({ id: vendedores.id, userId: vendedores.userId })
      .from(vendedores)
      .where(eq(vendedores.empresaId, empresaId));
    const vIds = vend.map((v) => v.id);
    const uIds = vend.map((v) => v.userId);
    const n = (r: unknown[]) => r.length;
    const out: Record<string, number> = {};

    out.anexos = n(await tx.delete(anexos).where(eq(anexos.empresaId, empresaId)).returning({ id: anexos.id }));
    out.atendimentos = vIds.length
      ? n(await tx.delete(checkins).where(inArray(checkins.vendedorId, vIds)).returning({ id: checkins.id }))
      : 0;
    out.vendas = vIds.length
      ? n(await tx.delete(vendas).where(inArray(vendas.vendedorId, vIds)).returning({ id: vendas.id }))
      : 0;
    out.atividades = vIds.length
      ? n(await tx.delete(atividades).where(inArray(atividades.vendedorId, vIds)).returning({ id: atividades.id }))
      : 0;
    out.alertas = n(await tx.delete(alertas).where(eq(alertas.empresaId, empresaId)).returning({ id: alertas.id }));
    out.mensagens = n(await tx.delete(mensagens).where(eq(mensagens.empresaId, empresaId)).returning({ id: mensagens.id }));
    out.colaboradores = n(
      await tx.delete(colaboradores).where(eq(colaboradores.empresaId, empresaId)).returning({ id: colaboradores.id }),
    );
    out.clientes = n(await tx.delete(clientes).where(eq(clientes.empresaId, empresaId)).returning({ id: clientes.id }));
    if (uIds.length) await tx.delete(refreshTokens).where(inArray(refreshTokens.userId, uIds));
    out.vendedores = vIds.length
      ? n(await tx.delete(vendedores).where(inArray(vendedores.id, vIds)).returning({ id: vendedores.id }))
      : 0;
    if (uIds.length) await tx.delete(users).where(inArray(users.id, uIds));
    out.regioes = n(await tx.delete(regioes).where(eq(regioes.empresaId, empresaId)).returning({ id: regioes.id }));

    // Zera os contadores de ID (próximo = maior existente + 1; tabela vazia volta ao 1)
    for (const t of TABELAS)
      await tx.execute(
        sql.raw(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`),
      );
    return out;
  });

  publishAll(empresaId, "dados:limpos", { escopo: "tudo" });
  return { ok: true, removidos };
});
