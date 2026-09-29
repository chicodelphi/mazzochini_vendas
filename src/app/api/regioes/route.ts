import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { regioes } from "@/db/schema";
import { requireEmpresa, route } from "@/lib/http";

export const GET = route({ roles: ["admin"] }, async (_req, { session }) => ({
  regioes: await db.select().from(regioes).where(eq(regioes.empresaId, requireEmpresa(session))).orderBy(regioes.nome),
}));

const schema = z.object({ nome: z.string().trim().min(2).max(100) });

export const POST = route({ roles: ["admin"] }, async (req, { session }) => {
  const b = schema.parse(await req.json());
  const [r] = await db.insert(regioes).values({ empresaId: requireEmpresa(session), nome: b.nome }).returning();
  return { regiao: r };
});
