import { after } from "next/server";
import { HttpError, route } from "@/lib/http";
import { tickSeDevido } from "@/lib/monitor";
import { registrarHeartbeat } from "@/lib/service";

/** Heartbeat a cada 30s – sem heartbeat por 90s o vendedor é marcado como offline. */
export const POST = route({ roles: ["vendedor"], limit: 600 }, async (_req, { session }) => {
  if (!session.vendedorId) throw new HttpError(403, "Vendedor inválido");
  after(() => tickSeDevido().catch((e) => console.error("[monitor]", e)));
  return registrarHeartbeat(session.vendedorId);
});
