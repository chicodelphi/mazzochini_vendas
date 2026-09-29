"use client";
import { useCallback, useEffect, useState } from "react";
import { api, brl, fmtDataHora } from "@/lib/client";
import { useAuth } from "@/lib/useAuth";
import Logo from "@/components/Logo";

type Empresa = { id: number; nome: string; ativo: boolean; criadoEm: string; vendedores: number; vendasMes: number };
const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

export default function SuperAdmin() {
  const { user, logout } = useAuth(["super_admin"]);
  const [list, setList] = useState<Empresa[]>([]);
  const [f, setF] = useState({ nome: "", adminNome: "", adminEmail: "", adminSenha: "" });
  const [erro, setErro] = useState("");

  const load = useCallback(async () => setList((await api<{ empresas: Empresa[] }>("/api/empresas")).empresas), []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      await api("/api/empresas", { method: "POST", json: f });
      setF({ nome: "", adminNome: "", adminEmail: "", adminSenha: "" });
      load();
    } catch (er) {
      setErro(er instanceof Error ? er.message : "Erro");
    }
  }

  if (!user) return <div className="grid min-h-screen place-items-center text-slate-400">Carregando…</div>;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <Logo className="mb-3 h-10" />
          <h1 className="text-2xl font-bold">Super Admin · Empresas e equipes</h1>
          <p className="text-sm text-slate-500">Gerencie múltiplas empresas (multi-tenant)</p>
        </div>
        <button onClick={logout} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Sair</button>
      </header>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Empresa</th><th className="p-3">Vendedores</th><th className="p-3">Vendas no mês</th><th className="p-3">Criada em</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((e) => (
              <tr key={e.id}>
                <td className="p-3 font-medium">{e.nome}</td>
                <td className="p-3">{e.vendedores}</td>
                <td className="p-3">{brl(e.vendasMes)}</td>
                <td className="p-3">{fmtDataHora(e.criadoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={criar} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">➕ Nova empresa + administrador</h2>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inp} placeholder="Nome da empresa" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <input className={inp} placeholder="Nome do administrador" required value={f.adminNome} onChange={(e) => setF({ ...f, adminNome: e.target.value })} />
          <input className={inp} type="email" placeholder="E-mail do administrador" required value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} />
          <input className={inp} type="password" minLength={6} placeholder="Senha (mín. 6)" required value={f.adminSenha} onChange={(e) => setF({ ...f, adminSenha: e.target.value })} />
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Criar empresa</button>
      </form>
    </div>
  );
}
