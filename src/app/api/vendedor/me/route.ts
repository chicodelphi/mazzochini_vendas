import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, mensagens, users, vendas } from "@/db/schema";
import { checkinAberto } from "@/lib/checkin";
import { HttpError, route } from "@/lib/http";
import { listarVendedores } from "@/lib/queries";

export const GET = route({ roles: ["vendedor"] }, async (_req, { session }) => {
  if (!session.vendedorId || !session.empresaId) throw new HttpError(403, "Vendedor inválido");
  const v = (await listarVendedores(session.empresaId)).find((x) => x.id === session.vendedorId);
  if (!v) throw new HttpError(404, "Vendedor não encontrado");

  const [checkin, ultimasVendas, naoLidas, admin, refazerPendentes] = await Promise.all([
    checkinAberto(v.id),
    db.select().from(vendas).where(eq(vendas.vendedorId, v.id)).orderBy(desc(vendas.data)).limit(10),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(mensagens)
      .where(and(eq(mensagens.destinatarioId, session.uid), eq(mensagens.lida, false))),
    db
      .select({ id: users.id, nome: users.nome })
      .from(users)
      .where(and(eq(users.empresaId, session.empresaId), eq(users.role, "admin"), eq(users.ativo, true)))
      .orderBy(users.id)
      .limit(1),
    // contatos marcados como "Refazer" que ainda precisam ser refeitos
    db
      .select({
        id: checkins.id,
        clienteId: checkins.clienteId,
        clienteNome: checkins.clienteNome,
        emailEmpresa: checkins.emailEmpresa,
        colaboradorId: checkins.colaboradorId,
        colaboradorNome: checkins.colaboradorNome,
        emailColaborador: checkins.emailColaborador,
        telefoneColaborador: checkins.telefoneColaborador,
        tipoContato: checkins.tipoContato,
        motivo: checkins.motivo,
        refazerEm: checkins.refazerEm,
      })
      .from(checkins)
      .where(and(eq(checkins.vendedorId, v.id), eq(checkins.resultado, "refazer"), eq(checkins.refeito, false)))
      .orderBy(asc(checkins.refazerEm))
      .limit(20),
  ]);

  return {
    vendedor: v,
    checkinAberto: checkin,
    ultimasVendas,
    mensagensNaoLidas: naoLidas[0]?.n ?? 0,
    admin: admin[0] ?? null,
    refazerPendentes,
  };
});
