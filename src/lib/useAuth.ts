"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, refreshSession, type SessionUser } from "@/lib/client";

/** Guarda de rota no cliente + renovação proativa do token (a cada 10 min). */
export function useAuth(roles: SessionUser["role"][]) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ user: SessionUser }>("/api/auth/me")
      .then(({ user }) => {
        if (!alive) return;
        if (!roles.includes(user.role)) router.replace("/");
        else setUser(user);
      })
      .catch(() => router.replace("/login"));
    const t = setInterval(() => refreshSession(), 10 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  return { user, logout };
}
