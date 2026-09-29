"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type SessionUser } from "@/lib/client";
import Logo from "@/components/Logo";

const DEMO = [
  { label: "Gestor", email: "admin@admin.com", senha: "admin" },
  { label: "Funcionário", email: "funcionario@funcionario.com", senha: "funcionario" },
];

const field =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-[15px] outline-none focus:border-indigo-400";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const { user } = await api<{ user: SessionUser }>("/api/auth/login", { method: "POST", json: { email, senha } });
      router.replace(user.role === "admin" ? "/admin" : user.role === "vendedor" ? "/vendedor" : "/super");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao entrar");
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-100 p-4">
      {/* luzes de fundo com as cores da marca */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-indigo-400/30 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-52 -right-40 h-[560px] w-[560px] rounded-full bg-slate-400/25 blur-[130px]" />

      <div className="animate-rise glass relative w-full max-w-[420px] rounded-3xl border border-white/70 p-8 shadow-2xl sm:p-10">
        <div className="mb-8 text-center">
          <Logo className="mx-auto h-16" />
          <h1 className="mt-7 text-[28px] font-semibold leading-tight">Bem-vindo de volta</h1>
          <p className="mt-1.5 text-[15px] text-slate-500">Entre para acompanhar sua equipe em tempo real.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            E-mail
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="voce@empresa.com" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Senha
            <input type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={field} placeholder="••••••••" />
          </label>
          {erro && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</p>}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="mt-8">
          <p className="mb-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Acesso de demonstração</p>
          <div className="grid grid-cols-2 gap-2.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setSenha(d.senha);
                }}
                className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-left hover:border-indigo-400 hover:bg-white"
              >
                <span className="block text-sm font-semibold">{d.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{d.email}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-7 text-center text-xs text-slate-400">
          Mazzochini Materiais Laboratoriais · <a href="/docs" className="underline hover:text-slate-600">API</a>
        </p>
      </div>
    </main>
  );
}
