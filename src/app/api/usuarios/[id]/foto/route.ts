import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Session } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";

// Fotos ficam no próprio PostgreSQL (bytea). O navegador já envia 512×512 JPEG (~50 KB).
const MAX_FOTO = 1024 * 1024; // 1 MB (folga)
const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

async function alvo(id: number, session: Session, escrita: boolean) {
  const [u] = await db
    .select({ id: users.id, empresaId: users.empresaId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!u) throw new HttpError(404, "Usuário não encontrado");
  const proprio = u.id === session.uid;
  const mesmaEmpresa = u.empresaId != null && u.empresaId === session.empresaId;
  if (session.role === "super_admin" || proprio) return u;
  if (escrita ? session.role === "admin" && mesmaEmpresa : mesmaEmpresa) return u;
  throw new HttpError(403, "Acesso negado");
}

/** Foto do funcionário (qualquer usuário logado da mesma empresa). */
export const GET = route<{ id: string }>({ limit: 600 }, async (_req, { session, params }) => {
  const u = await alvo(Number(params.id), session, false);
  const [f] = await db
    .select({ foto: users.foto, mime: users.fotoMime })
    .from(users)
    .where(eq(users.id, u.id))
    .limit(1);
  if (!f?.foto) throw new HttpError(404, "Sem foto");
  return new Response(new Uint8Array(f.foto), {
    headers: {
      "Content-Type": f.mime ?? "image/jpeg",
      "Content-Length": String(f.foto.length),
      // a URL leva ?v=<timestamp>, então pode ficar em cache no navegador
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** Envia/troca a foto (multipart: campo `foto`). Gestor da empresa ou o próprio usuário. */
export const PUT = route<{ id: string }>({ limit: 30 }, async (req, { session, params }) => {
  const u = await alvo(Number(params.id), session, true);
  const form = await req.formData();
  const f = form.get("foto");
  if (!f || typeof f === "string") throw new HttpError(400, "Envie a imagem no campo 'foto'");
  if (!MIME_OK.has(f.type)) throw new HttpError(400, "Formato não suportado (use JPG, PNG ou WebP)");
  if (f.size > MAX_FOTO) throw new HttpError(413, "Imagem muito grande (máx. 1 MB)");
  const agora = new Date();
  await db
    .update(users)
    .set({ foto: Buffer.from(await f.arrayBuffer()), fotoMime: f.type, fotoAtualizadaEm: agora })
    .where(eq(users.id, u.id));
  return { ok: true, fotoUrl: `/api/usuarios/${u.id}/foto?v=${agora.getTime()}` };
});

/** Remove a foto. */
export const DELETE = route<{ id: string }>({ limit: 30 }, async (_req, { session, params }) => {
  const u = await alvo(Number(params.id), session, true);
  await db.update(users).set({ foto: null, fotoMime: null, fotoAtualizadaEm: null }).where(eq(users.id, u.id));
  return { ok: true };
});
