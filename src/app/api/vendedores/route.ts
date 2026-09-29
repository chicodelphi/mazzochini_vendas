import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, vendedores } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { HttpError, requireEmpresa, route } from "@/lib/http";
import { listarVendedores } from "@/lib/queries";

export const GET = route({ roles: ["admin"] }, async (_req, { session }) => {
  return { vendedores: await listarVendedores(requireEmpresa(session)) };
});

const schema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email().max(200),
  senha: z.string().min(6).max(100),
  telefone: z.string().max(30).optional().nullable(),
  regiaoId: z.number().int().optional().nullable(),
  metaMensal: z.number().min(0).max(100_000_000).default(0),
});

export const POST = route({ roles: ["admin"] }, async (req, { session }) => {
  const empresaId = requireEmpresa(session);
  const b = schema.parse(await req.json());
  const email = b.email.toLowerCase();
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dup) throw new HttpError(409, "E-mail já cadastrado");
  const [u] = await db
    .insert(users)
    .values({ empresaId, nome: b.nome, email, senhaHash: await hashPassword(b.senha), role: "vendedor" })
    .returning();
  const [v] = await db
    .insert(vendedores)
    .values({
      userId: u.id,
      empresaId,
      telefone: b.telefone ?? null,
      regiaoId: b.regiaoId ?? null,
      metaMensal: String(b.metaMensal),
    })
    .returning();
  return { id: v.id, userId: u.id };
});
