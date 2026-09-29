import { eq } from "drizzle-orm";
import { db } from "@/db";
import { anexos } from "@/db/schema";
import { HttpError, route } from "@/lib/http";

/** Download do histórico da conversa (gestor da empresa ou vendedor autor). */
export const GET = route<{ id: string }>({ roles: ["admin", "vendedor"], limit: 120 }, async (_req, { session, params }) => {
  const [a] = await db.select().from(anexos).where(eq(anexos.id, Number(params.id))).limit(1);
  if (!a || a.empresaId !== session.empresaId) throw new HttpError(404, "Arquivo não encontrado");
  if (session.role === "vendedor" && a.vendedorId !== session.vendedorId) throw new HttpError(403, "Acesso negado");
  return new Response(new Uint8Array(a.dados), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.tamanho),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
