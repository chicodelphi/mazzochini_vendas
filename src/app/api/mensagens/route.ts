import { and, asc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mensagens, users } from "@/db/schema";
import { HttpError, requireEmpresa, route } from "@/lib/http";
import { publish } from "@/lib/realtime";

async function checarDestino(empresaId: number, userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.empresaId !== empresaId) throw new HttpError(404, "Usuário não encontrado");
  return u;
}

/** Conversa entre o usuário logado e `?com=<userId>` (marca recebidas como lidas) */
export const GET = route({ roles: ["admin", "vendedor"] }, async (req, { session }) => {
  const empresaId = requireEmpresa(session);
  const com = Number(req.nextUrl.searchParams.get("com"));
  if (!com) throw new HttpError(400, "Parâmetro 'com' obrigatório");
  await checarDestino(empresaId, com);
  const rows = await db
    .select()
    .from(mensagens)
    .where(
      or(
        and(eq(mensagens.remetenteId, session.uid), eq(mensagens.destinatarioId, com)),
        and(eq(mensagens.remetenteId, com), eq(mensagens.destinatarioId, session.uid)),
      ),
    )
    .orderBy(asc(mensagens.criadoEm))
    .limit(200);
  await db
    .update(mensagens)
    .set({ lida: true })
    .where(and(eq(mensagens.remetenteId, com), eq(mensagens.destinatarioId, session.uid), eq(mensagens.lida, false)));
  return { mensagens: rows };
});

const schema = z.object({ destinatarioId: z.number().int(), conteudo: z.string().min(1).max(2000) });

export const POST = route({ roles: ["admin", "vendedor"], limit: 60 }, async (req, { session }) => {
  const empresaId = requireEmpresa(session);
  const b = schema.parse(await req.json());
  const dest = await checarDestino(empresaId, b.destinatarioId);
  if (session.role === dest.role) throw new HttpError(400, "Mensagens só entre gestor e vendedor");
  const [m] = await db
    .insert(mensagens)
    .values({ empresaId, remetenteId: session.uid, destinatarioId: dest.id, conteudo: b.conteudo.trim() })
    .returning();
  publish(empresaId, "mensagem:nova", { mensagem: m, remetente: session.nome }, dest.id);
  return { mensagem: m };
});
