import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession, type Role, type Session } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx<P> = { session: Session; params: P };
type Opts = { roles?: Role[]; limit?: number; public?: boolean };

/**
 * Wrapper padrão de rotas: rate limit, autenticação/RBAC, validação (Zod) e erros JSON.
 */
export function route<P = Record<string, string>>(
  opts: Opts,
  fn: (req: NextRequest, ctx: Ctx<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, rawCtx: { params: Promise<Record<string, string>> }) => {
    try {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      const session = opts.public ? null : await getSession();
      if (!opts.public && !session) throw new HttpError(401, "Não autenticado");
      if (session && opts.roles && !opts.roles.includes(session.role))
        throw new HttpError(403, "Acesso negado");

      const key = `${session ? "u" + session.uid : "ip" + ip}:${req.method}:${new URL(req.url).pathname.replace(/\d+/g, ":id")}`;
      const rl = rateLimit(key, opts.limit ?? 240);
      if (!rl.ok)
        return NextResponse.json(
          { error: "Muitas requisições. Tente novamente em instantes." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        );

      const params = (rawCtx?.params ? await rawCtx.params : {}) as P;
      const out = await fn(req, { session: session as Session, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: "Dados inválidos", detalhes: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          { status: 400 },
        );
      console.error("[api]", e);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
  };
}

export const num = (v: unknown) => Number(v ?? 0);

export function requireEmpresa(s: Session): number {
  if (s.empresaId == null) throw new HttpError(403, "Usuário sem empresa");
  return s.empresaId;
}
