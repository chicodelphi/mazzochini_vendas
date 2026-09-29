import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { empresas, users, vendedores } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";

/** Super Admin: lista de empresas/equipes */
export const GET = route({ roles: ["super_admin"] }, async () => {
  const rows = await db
    .select({
      id: empresas.id,
      nome: empresas.nome,
      ativo: empresas.ativo,
      criadoEm: empresas.criadoEm,
      vendedores: sql<number>`(select count(*)::int from ${vendedores} where ${vendedores.empresaId} = ${empresas.id})`,
      vendasMes: sql<string>`(select coalesce(sum(v.valor),0) from vendas v join vendedores ve on ve.id = v.vendedor_id where ve.empresa_id = ${empresas.id} and v.data >= date_trunc('month', now()))`,
    })
    .from(empresas)
    .orderBy(empresas.id);
  return { empresas: rows.map((r) => ({ ...r, vendasMes: Number(r.vendasMes) })) };
});

const schema = z.object({
  nome: z.string().min(2).max(120),
  adminNome: z.string().min(2).max(120),
  adminEmail: z.string().email(),
  adminSenha: z.string().min(6).max(100),
});

/** Cria empresa + primeiro administrador */
export const POST = route({ roles: ["super_admin"] }, async (req) => {
  const b = schema.parse(await req.json());
  const email = b.adminEmail.toLowerCase();
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dup) throw new HttpError(409, "E-mail já cadastrado");
  const [e] = await db.insert(empresas).values({ nome: b.nome }).returning();
  await db.insert(users).values({
    empresaId: e.id,
    nome: b.adminNome,
    email,
    senhaHash: await hashPassword(b.adminSenha),
    role: "admin",
  });
  return { empresa: e };
});
