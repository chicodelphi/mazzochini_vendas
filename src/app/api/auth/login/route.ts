import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { buildSession, issueTokens, verifyPassword } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { ensureSeed } from "@/lib/seed";
import { entrar } from "@/lib/service";

const schema = z.object({ email: z.string().email().max(200), senha: z.string().min(1).max(200) });

export const POST = route({ public: true, limit: 10 }, async (req) => {
  await ensureSeed();
  const { email, senha } = schema.parse(await req.json());
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!u || !u.ativo || !(await verifyPassword(senha, u.senhaHash)))
    throw new HttpError(401, "E-mail ou senha inválidos");
  const session = await buildSession(u.id);
  if (!session) throw new HttpError(401, "Usuário inativo");
  await issueTokens(session);
  // Registro automático de entrada
  if (session.role === "vendedor" && session.vendedorId) await entrar(session.vendedorId);
  return { user: session };
});
