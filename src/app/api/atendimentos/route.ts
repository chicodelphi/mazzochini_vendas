import { requireEmpresa, route } from "@/lib/http";
import { listarAtendimentos, resumoAtendimentos } from "@/lib/queries";

/**
 * Gestor: atendimentos de toda a equipe.
 * Filtros: ?q=&vendedorId=&tipo=&resultado=(efetivo|refazer|pendente|andamento)&limit=
 */
export const GET = route({ roles: ["admin"] }, async (req, { session }) => {
  const p = req.nextUrl.searchParams;
  const empresaId = requireEmpresa(session);
  const vid = Number(p.get("vendedorId"));
  const [atendimentos, resumo] = await Promise.all([
    listarAtendimentos(empresaId, {
      q: p.get("q")?.trim().slice(0, 100) || undefined,
      tipo: p.get("tipo") || undefined,
      resultado: p.get("resultado") || undefined,
      vendedorId: vid || undefined,
      limit: Math.min(Number(p.get("limit")) || 100, 300),
    }),
    resumoAtendimentos(empresaId),
  ]);
  return { atendimentos, resumo };
});
