import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { atividades, clientes, vendas } from "@/db/schema";
import { HttpError, route } from "@/lib/http";
import { publish } from "@/lib/realtime";
import { getVendedorFull } from "@/lib/service";

const schema = z.object({
  clienteId: z.number().int(),
  produto: z.string().trim().min(2).max(150),
  valor: z.number().positive().max(100_000_000),
});

/** Evento `vendedor:venda_registrada` */
export const POST = route({ roles: ["vendedor"] }, async (req, { session }) => {
  if (!session.vendedorId || !session.empresaId) throw new HttpError(403, "Vendedor inválido");
  const b = schema.parse(await req.json());
  const [c] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, b.clienteId), eq(clientes.empresaId, session.empresaId)))
    .limit(1);
  if (!c) throw new HttpError(404, "Cliente não encontrado");

  const v = await getVendedorFull(session.vendedorId);
  const [venda] = await db
    .insert(vendas)
    .values({ vendedorId: v.id, clienteId: c.id, cliente: c.nome, produto: b.produto, valor: b.valor.toFixed(2) })
    .returning();
  await db.insert(atividades).values({
    vendedorId: v.id,
    tipo: "venda",
    descricao: `Venda de ${b.produto} para ${c.nome} – R$ ${b.valor.toFixed(2)}`,
  });
  publish(v.empresaId, "vendedor:venda_registrada", {
    vendedorId: v.id,
    nome: v.nome,
    venda: { ...venda, valor: Number(venda.valor) },
  });
  return { venda };
});
