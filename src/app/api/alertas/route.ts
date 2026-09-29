import { requireEmpresa, route } from "@/lib/http";
import { alertasAbertos } from "@/lib/queries";

export const GET = route({ roles: ["admin"] }, async (_req, { session }) => ({
  alertas: await alertasAbertos(requireEmpresa(session), 100),
}));
