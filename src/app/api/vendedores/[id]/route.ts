import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { atividades, users, vendas, vendedores } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { HttpError, requireEmpresa, route } from "@/lib/http";
import { inicioDoDia, listarAtendimentos, listarVendedores } from "@/lib/queries";
import { calcularTempos } from "@/lib/service";

async function carregar(id: number, empresaId: number) {
  const v = (await listarVendedores(empresaId)).find((x) => x.id === id);
  if (!v) throw new HttpError(404, "Vendedor não encontrado");
  return v;
}

export const GET = route<{ id: string }>({ roles: ["admin"] }, async (req, { session, params }) => {
  const empresaId = requireEmpresa(session);
  const id = Number(params.id);
  const vendedor = await carregar(id, empresaId);
  const dia = req.nextUrl.searchParams.get("data"); // yyyy-mm-dd
  const ini = dia ? new Date(`${dia}T00:00:00`) : inicioDoDia();
  const fim = new Date(ini.getTime() + 24 * 3600_000);

  const [timeline, vendasRows, atendimentos, tempos] = await Promise.all([
    db
      .select()
      .from(atividades)
      .where(and(eq(atividades.vendedorId, id), gte(atividades.timestamp, ini)))
      .orderBy(desc(atividades.timestamp))
      .limit(300),
    db.select().from(vendas).where(eq(vendas.vendedorId, id)).orderBy(desc(vendas.data)).limit(30),
    listarAtendimentos(empresaId, { vendedorId: id, limit: 30 }),
    calcularTempos([id], ini, fim),
  ]);

  return {
    vendedor,
    timeline: timeline.filter((a) => a.timestamp < fim),
    vendas: vendasRows,
    atendimentos,
    tempos: tempos.get(id),
  };
});

const patch = z.object({
  nome: z.string().min(2).max(120).optional(),
  telefone: z.string().max(30).nullable().optional(),
  regiaoId: z.number().int().nullable().optional(),
  metaMensal: z.number().min(0).max(100_000_000).optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(6).max(100).optional(),
});

export const PATCH = route<{ id: string }>({ roles: ["admin"] }, async (req, { session, params }) => {
  const empresaId = requireEmpresa(session);
  const id = Number(params.id);
  const v = await carregar(id, empresaId);
  const b = patch.parse(await req.json());
  const uUpd: Partial<typeof users.$inferInsert> = {};
  if (b.nome) uUpd.nome = b.nome;
  if (b.ativo !== undefined) uUpd.ativo = b.ativo;
  if (b.senha) uUpd.senhaHash = await hashPassword(b.senha);
  if (Object.keys(uUpd).length) await db.update(users).set(uUpd).where(eq(users.id, v.userId));
  const vUpd: Partial<typeof vendedores.$inferInsert> = {};
  if (b.telefone !== undefined) vUpd.telefone = b.telefone;
  if (b.regiaoId !== undefined) vUpd.regiaoId = b.regiaoId;
  if (b.metaMensal !== undefined) vUpd.metaMensal = String(b.metaMensal);
  if (Object.keys(vUpd).length) await db.update(vendedores).set(vUpd).where(eq(vendedores.id, id));
  return { ok: true };
});

export const DELETE = route<{ id: string }>({ roles: ["admin"] }, async (_req, { session, params }) => {
  const empresaId = requireEmpresa(session);
  const v = await carregar(Number(params.id), empresaId);
  await db.update(users).set({ ativo: false }).where(eq(users.id, v.userId));
  return { ok: true };
});
