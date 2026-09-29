"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type SessionUser } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<{ user: SessionUser }>("/api/auth/me")
      .then(({ user }) =>
        router.replace(user.role === "admin" ? "/admin" : user.role === "vendedor" ? "/vendedor" : "/super"),
      )
      .catch(() => router.replace("/login"));
  }, [router]);
  return <div className="grid min-h-screen place-items-center text-slate-400">Carregando…</div>;
}
