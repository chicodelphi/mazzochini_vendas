import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { regioes, vendedores } from "@/db/schema";
import { requireEmpresa, route } from "@/lib/http";

export const DELETE = route<{ id: string }>({ roles: ["admin"] }, async (_req, { session, params }) => {
  const empresaId = requireEmpresa(session);
  const id = Number(params.id);
  await db.update(vendedores).set({ regiaoId: null }).where(and(eq(vendedores.regiaoId, id), eq(vendedores.empresaId, empresaId)));
  await db.delete(regioes).where(and(eq(regioes.id, id), eq(regioes.empresaId, empresaId)));
  return { ok: true };
});
