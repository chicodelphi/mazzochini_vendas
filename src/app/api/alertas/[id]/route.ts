import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alertas } from "@/db/schema";
import { requireEmpresa, route } from "@/lib/http";

/** Marca o alerta como resolvido */
export const PATCH = route<{ id: string }>({ roles: ["admin"] }, async (_req, { session, params }) => {
  await db
    .update(alertas)
    .set({ resolvidoEm: new Date() })
    .where(and(eq(alertas.id, Number(params.id)), eq(alertas.empresaId, requireEmpresa(session))));
  return { ok: true };
});
