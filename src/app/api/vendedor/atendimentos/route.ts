import { HttpError, route } from "@/lib/http";
import { listarAtendimentos } from "@/lib/queries";

/** Atendimentos feitos pelo próprio vendedor (?q=&resultado=efetivo|refazer|pendente|andamento&limit=) */
export const GET = route({ roles: ["vendedor"] }, async (req, { session }) => {
  if (!session.vendedorId || !session.empresaId) throw new HttpError(403, "Vendedor inválido");
  const p = req.nextUrl.searchParams;
  return {
    atendimentos: await listarAtendimentos(session.empresaId, {
      vendedorId: session.vendedorId,
      q: p.get("q")?.trim().slice(0, 100) || undefined,
      resultado: p.get("resultado") || undefined,
      limit: Math.min(Number(p.get("limit")) || 100, 200),
    }),
  };
});
