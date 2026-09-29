import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clientes } from "@/db/schema";
import { requireEmpresa, route } from "@/lib/http";

export const GET = route({ roles: ["admin", "vendedor"] }, async (_req, { session }) => ({
  clientes: await db.select().from(clientes).where(eq(clientes.empresaId, requireEmpresa(session))).orderBy(clientes.nome),
}));

const schema = z.object({
  nome: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(200).optional().nullable(),
  endereco: z.string().max(250).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
});

export const POST = route({ roles: ["admin", "vendedor"] }, async (req, { session }) => {
  const b = schema.parse(await req.json());
  const [c] = await db
    .insert(clientes)
    .values({
      empresaId: requireEmpresa(session),
      nome: b.nome,
      email: b.email ?? null,
      endereco: b.endereco ?? null,
      telefone: b.telefone ?? null,
    })
    .returning();
  return { cliente: c };
});
