import { requireEmpresa, route } from "@/lib/http";
import { gerarRelatorio, parsePeriodo } from "@/lib/relatorio";

export const GET = route({ roles: ["admin"], limit: 60 }, async (req, { session }) => {
  const q = req.nextUrl.searchParams;
  const { ini, fim } = parsePeriodo(q.get("de"), q.get("ate"));
  const vid = q.get("vendedorId");
  return gerarRelatorio(requireEmpresa(session), ini, fim, vid ? Number(vid) : undefined);
});
