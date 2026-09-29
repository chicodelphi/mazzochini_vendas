import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes, colaboradores } from "@/db/schema";
import { HttpError, requireEmpresa, route } from "@/lib/http";

/** Colaboradores (contatos) de uma empresa cliente: ?clienteId=<id> */
export const GET = route({ roles: ["admin", "vendedor"] }, async (req, { session }) => {
  const empresaId = requireEmpresa(session);
  const clienteId = Number(req.nextUrl.searchParams.get("clienteId"));
  if (!clienteId) throw new HttpError(400, "Parâmetro 'clienteId' obrigatório");
  return {
    colaboradores: await db
      .select()
      .from(colaboradores)
      .where(and(eq(colaboradores.empresaId, empresaId), eq(colaboradores.clienteId, clienteId)))
      .orderBy(colaboradores.nome),
  };
});

const schema = z.object({
  clienteId: z.number().int(),
  nome: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(200).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
});

/** Cadastra um colaborador de uma empresa cliente */
export const POST = route({ roles: ["admin", "vendedor"] }, async (req, { session }) => {
  const empresaId = requireEmpresa(session);
  const b = schema.parse(await req.json());
  const [c] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, b.clienteId), eq(clientes.empresaId, empresaId)))
    .limit(1);
  if (!c) throw new HttpError(404, "Cliente não encontrado");
  const [row] = await db
    .insert(colaboradores)
    .values({ empresaId, clienteId: b.clienteId, nome: b.nome, email: b.email ?? null, telefone: b.telefone ?? null })
    .returning();
  return { colaborador: row };
});
