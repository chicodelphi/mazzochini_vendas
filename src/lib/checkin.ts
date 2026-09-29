import { eq } from "drizzle-orm";
import { db } from "@/db";
import { atividades, checkins } from "@/db/schema";
import { resultadoLabel, type Resultado } from "@/lib/contato";
import { publish } from "@/lib/realtime";
import { checkinAberto, getVendedorFull } from "@/lib/service";

export { checkinAberto };

export type FechamentoDados = {
  descricao: string;
  resultado: Resultado;
  motivo?: string | null;
  refazerEm?: Date | null;
};

/** Fecha o atendimento aberto (hora de fim + resultado) e emite `vendedor:checkout_cliente`. */
export async function fecharCheckin(vendedorId: number, dados: FechamentoDados) {
  const c = await checkinAberto(vendedorId);
  if (!c) return null;
  const agora = new Date();
  const refazer = dados.resultado === "refazer";
  const upd = {
    saida: agora,
    descricao: dados.descricao,
    resultado: dados.resultado,
    motivo: refazer ? (dados.motivo ?? null) : null,
    refazerEm: refazer ? (dados.refazerEm ?? null) : null,
  };
  await db.update(checkins).set(upd).where(eq(checkins.id, c.id));
  const v = await getVendedorFull(vendedorId);
  await db.insert(atividades).values({
    vendedorId,
    tipo: "checkout",
    descricao: `Atendimento finalizado (${resultadoLabel(dados.resultado)}): ${c.clienteNome}`,
    timestamp: agora,
  });
  publish(v.empresaId, "vendedor:checkout_cliente", {
    vendedorId,
    nome: v.nome,
    cliente: c.clienteNome,
    tipo: c.tipoContato,
    checkinId: c.id,
    resultado: dados.resultado,
    motivo: upd.motivo,
    refazerEm: upd.refazerEm,
  });
  return { ...c, ...upd };
}
