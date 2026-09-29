import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { refreshTokens, users, vendedores } from "@/db/schema";

export type Role = "super_admin" | "admin" | "vendedor";

export type Session = {
  uid: number;
  role: Role;
  empresaId: number | null;
  nome: string;
  vendedorId: number | null;
};

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 7 * 24 * 3600;

const DEV_SECRET = "dev-only-secret-change-me-in-production-please";
if (!process.env.JWT_SECRET && process.env.VERCEL_ENV === "production")
  console.error("[auth] JWT_SECRET não definido em produção! Defina-o nas variáveis de ambiente da Vercel.");
const secret = new TextEncoder().encode(process.env.JWT_SECRET || DEV_SECRET);

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function signAccessToken(s: Session) {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      uid: payload.uid as number,
      role: payload.role as Role,
      empresaId: (payload.empresaId as number | null) ?? null,
      nome: payload.nome as string,
      vendedorId: (payload.vendedorId as number | null) ?? null,
    };
  } catch {
    return null;
  }
}

const cookieBase = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  // Na Vercel (sempre HTTPS) o cookie é Secure por padrão; COOKIE_SECURE=false desliga
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.VERCEL === "1",
  path: "/",
});

export async function buildSession(userId: number): Promise<Session | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.ativo) return null;
  let vendedorId: number | null = null;
  if (u.role === "vendedor") {
    const [v] = await db
      .select({ id: vendedores.id })
      .from(vendedores)
      .where(eq(vendedores.userId, u.id))
      .limit(1);
    vendedorId = v?.id ?? null;
  }
  return {
    uid: u.id,
    role: u.role as Role,
    empresaId: u.empresaId,
    nome: u.nome,
    vendedorId,
  };
}

/** Emite access token (15 min) + refresh token (7 dias) e grava nos cookies httpOnly. */
export async function issueTokens(session: Session) {
  const access = await signAccessToken(session);
  const refresh = randomBytes(48).toString("hex");
  await db.insert(refreshTokens).values({
    userId: session.uid,
    tokenHash: sha256(refresh),
    expiraEm: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
  });
  const jar = await cookies();
  jar.set("access_token", access, { ...cookieBase(), maxAge: ACCESS_TTL_SEC });
  jar.set("refresh_token", refresh, { ...cookieBase(), maxAge: REFRESH_TTL_SEC });
}

/** Rotaciona refresh token. Retorna a sessão renovada ou null. */
export async function rotateRefresh(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get("refresh_token")?.value;
  if (!token) return null;
  const hash = sha256(token);
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, hash), eq(refreshTokens.revogado, false)))
    .limit(1);
  if (!row || row.expiraEm < new Date()) return null;
  await db.update(refreshTokens).set({ revogado: true }).where(eq(refreshTokens.id, row.id));
  const session = await buildSession(row.userId);
  if (!session) return null;
  await issueTokens(session);
  return session;
}

export async function revokeRefreshAndClear() {
  const jar = await cookies();
  const token = jar.get("refresh_token")?.value;
  if (token) {
    await db
      .update(refreshTokens)
      .set({ revogado: true })
      .where(eq(refreshTokens.tokenHash, sha256(token)));
  }
  jar.delete("access_token");
  jar.delete("refresh_token");
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get("access_token")?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}
