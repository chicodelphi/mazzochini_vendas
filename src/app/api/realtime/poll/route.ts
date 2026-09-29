import { after } from "next/server";
import { HttpError, route } from "@/lib/http";
import { tickSeDevido } from "@/lib/monitor";
import { buscarEventos, ultimoEventoId } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Tempo real por short-polling (compatível com Vercel/serverless).
 * GET /api/realtime/poll            → { cursor }            (primeira chamada)
 * GET /api/realtime/poll?after=123  → { cursor, eventos[] } (eventos novos)
 * Admins recebem todos os eventos da empresa; vendedores, os destinados a eles.
 */
export const GET = route({ roles: ["admin", "vendedor"], limit: 120 }, async (req, { session }) => {
  if (session.empresaId == null) throw new HttpError(403, "Usuário sem empresa");
  // aproveita a requisição para rodar o monitor de heartbeat/alertas (no máx. 1x/25 s no sistema)
  after(() => tickSeDevido().catch((e) => console.error("[monitor]", e)));

  const raw = req.nextUrl.searchParams.get("after");
  if (raw === null || raw === "") return { cursor: await ultimoEventoId(), eventos: [] };
  const after_ = Math.max(0, Number(raw) || 0);
  const rows = await buscarEventos({ empresaId: session.empresaId, userId: session.uid, role: session.role, after: after_ });
  return {
    cursor: rows.length ? rows[rows.length - 1].id : after_,
    eventos: rows.map((r) => ({ id: r.id, evento: r.evento, dados: r.dados })),
  };
});
