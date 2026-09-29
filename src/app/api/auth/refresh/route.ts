import { rotateRefresh } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";

export const POST = route({ public: true, limit: 60 }, async () => {
  const session = await rotateRefresh();
  if (!session) throw new HttpError(401, "Sessão expirada");
  return { user: session };
});
