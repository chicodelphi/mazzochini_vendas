import { z } from "zod";
import { checkinAberto } from "@/lib/checkin";
import { HttpError, route } from "@/lib/http";
import { mudarStatus } from "@/lib/service";

// "em_atendimento" só é definido ao iniciar um atendimento (/api/vendedor/checkins)
const schema = z.object({ status: z.enum(["online", "em_pausa", "em_deslocamento"]) });

export const POST = route({ roles: ["vendedor"] }, async (req, { session }) => {
  if (!session.vendedorId) throw new HttpError(403, "Vendedor inválido");
  const b = schema.parse(await req.json());
  if (await checkinAberto(session.vendedorId))
    throw new HttpError(409, "Finalize o atendimento em andamento (descritivo + histórico) antes de mudar o status");
  return mudarStatus(session.vendedorId, b.status, "status");
});
