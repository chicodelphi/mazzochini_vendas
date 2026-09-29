import { tick } from "@/lib/monitor";
import { limparEventosAntigos } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Chamado pelo Vercel Cron (vercel.json). A Vercel envia "Authorization: Bearer $CRON_SECRET".
 * Faz a limpeza da fila de eventos e uma rodada do monitor.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  await tick();
  await limparEventosAntigos();
  return Response.json({ ok: true });
}
