import { revokeRefreshAndClear } from "@/lib/auth";
import { route } from "@/lib/http";
import { mudarStatus } from "@/lib/service";

export const POST = route({}, async (_req, { session }) => {
  // Registro automático de saída (ignora se o vendedor já foi apagado)
  if (session.role === "vendedor" && session.vendedorId)
    await mudarStatus(session.vendedorId, "offline", "logout").catch(() => {});
  await revokeRefreshAndClear();
  return { ok: true };
});
