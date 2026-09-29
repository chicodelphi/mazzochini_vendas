"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { api, apiForm, brl, STATUS_META, type VendedorLive } from "@/lib/client";
import { prepararFotoPerfil } from "@/lib/imagem";

/** Envia a foto já recortada/comprimida (512×512 JPEG) para o PostgreSQL. */
async function enviarFoto(userId: number, file: File) {
  const fd = new FormData();
  fd.append("foto", await prepararFotoPerfil(file));
  return apiForm<{ fotoUrl: string }>(`/api/usuarios/${userId}/foto`, "PUT", fd);
}

type Regiao = { id: number; nome: string };
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

export default function VendedoresPage() {
  const [vs, setVs] = useState<VendedorLive[]>([]);
  const [regs, setRegs] = useState<Regiao[]>([]);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", telefone: "", regiaoId: "", metaMensal: "10000" });
  const [reg, setReg] = useState({ nome: "" });
  const [edit, setEdit] = useState<VendedorLive | null>(null);
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [editFoto, setEditFoto] = useState<File | null>(null);
  // pré-visualização local das fotos escolhidas
  const novaFotoUrl = useMemo(() => (novaFoto ? URL.createObjectURL(novaFoto) : null), [novaFoto]);
  const editFotoUrl = useMemo(() => (editFoto ? URL.createObjectURL(editFoto) : null), [editFoto]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      api<{ vendedores: VendedorLive[] }>("/api/vendedores"),
      api<{ regioes: Regiao[] }>("/api/regioes"),
    ]);
    setVs(a.vendedores);
    setRegs(b.regioes);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setErro("");
    try {
      await fn();
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  };

  const criar = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      const r = await api<{ id: number; userId: number }>("/api/vendedores", {
        method: "POST",
        json: { ...novo, telefone: novo.telefone || null, regiaoId: novo.regiaoId ? Number(novo.regiaoId) : null, metaMensal: Number(novo.metaMensal) },
      });
      if (novaFoto) await enviarFoto(r.userId, novaFoto);
      setNovo({ nome: "", email: "", senha: "", telefone: "", regiaoId: "", metaMensal: "10000" });
      setNovaFoto(null);
    });
  };

  const criarRegiao = (e: React.FormEvent) => {
    e.preventDefault();
    wrap(async () => {
      await api("/api/regioes", {
        method: "POST",
        json: { nome: reg.nome },
      });
      setReg({ nome: "" });
    });
  };

  const salvarEdicao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    wrap(async () => {
      await api(`/api/vendedores/${edit.id}`, {
        method: "PATCH",
        json: { nome: edit.nome, telefone: edit.telefone, regiaoId: edit.regiaoId, metaMensal: edit.metaMensal },
      });
      if (editFoto) await enviarFoto(edit.userId, editFoto);
      setEdit(null);
      setEditFoto(null);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vendedores, metas e regiões</h1>
        <p className="text-sm text-slate-500">Cadastre e gerencie sua equipe</p>
      </div>
      {erro && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Vendedor</th><th className="p-3">Região</th><th className="p-3">Status</th>
              <th className="p-3">Meta mensal</th><th className="p-3">Vendas mês</th><th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vs.map((v) => (
              <tr key={v.id} className={v.ativo ? "" : "opacity-50"}>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar nome={v.nome} fotoUrl={v.fotoUrl} cor={STATUS_META[v.status].color} className="h-9 w-9 text-sm" />
                    <div>
                      <Link href={`/admin/vendedores/${v.id}`} className="font-semibold text-indigo-600 hover:underline">{v.nome}</Link>
                      <p className="text-xs text-slate-500">{v.email}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3">{v.regiao ?? "—"}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[v.status].cls}`}>{STATUS_META[v.status].label}</span></td>
                <td className="p-3">{brl(v.metaMensal)}</td>
                <td className="p-3">
                  {brl(v.vendasMes)}
                  <span className="ml-1 text-xs text-slate-400">({v.metaMensal ? ((v.vendasMes / v.metaMensal) * 100).toFixed(0) : 0}%)</span>
                </td>
                <td className="space-x-2 whitespace-nowrap p-3 text-right">
                  <button onClick={() => setEdit(v)} className="text-indigo-600 hover:underline">Editar</button>
                  <button onClick={() => wrap(() => api(`/api/vendedores/${v.id}`, v.ativo ? { method: "DELETE" } : { method: "PATCH", json: { ativo: true } }))} className="text-slate-500 hover:underline">
                    {v.ativo ? "Desativar" : "Reativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={criar} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">➕ Novo vendedor</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Nome" required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <input className={input} placeholder="E-mail" type="email" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            <input className={input} placeholder="Senha (mín. 6)" type="password" minLength={6} required value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
            <input className={input} placeholder="Telefone" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            <select className={input} value={novo.regiaoId} onChange={(e) => setNovo({ ...novo, regiaoId: e.target.value })}>
              <option value="">Sem região</option>
              {regs.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            <input className={input} placeholder="Meta mensal (R$)" type="number" min={0} value={novo.metaMensal} onChange={(e) => setNovo({ ...novo, metaMensal: e.target.value })} />
            <label className="flex items-center gap-3 text-xs text-slate-500 sm:col-span-2">
              <Avatar nome={novo.nome || "?"} fotoUrl={novaFotoUrl} className="h-10 w-10 text-sm" />
              <span className="flex-1">Foto do funcionário (opcional)
                <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-xs" onChange={(e) => setNovaFoto(e.target.files?.[0] ?? null)} />
              </span>
            </label>
          </div>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Cadastrar</button>
        </form>

        <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">🌎 Regiões de atuação</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {regs.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>{r.nome}</span>
                <button onClick={() => wrap(() => api(`/api/regioes/${r.id}`, { method: "DELETE" }))} className="text-xs text-red-600 hover:underline">Remover</button>
              </li>
            ))}
            {regs.length === 0 && <li className="py-2 text-slate-400">Nenhuma região.</li>}
          </ul>
          <form onSubmit={criarRegiao} className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
            <input className={`${input} col-span-2`} placeholder="Nome da região" required value={reg.nome} onChange={(e) => setReg({ ...reg, nome: e.target.value })} />
            <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Adicionar</button>
          </form>
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4" onClick={() => { setEdit(null); setEditFoto(null); }}>
          <form onSubmit={salvarEdicao} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <h2 className="font-semibold">Editar {edit.nome}</h2>
            <div className="flex items-center gap-3">
              <Avatar
                nome={edit.nome}
                fotoUrl={editFotoUrl ?? edit.fotoUrl}
                cor={STATUS_META[edit.status].color}
                className="h-16 w-16 text-xl"
              />
              <div className="space-y-1 text-xs">
                <label className="block cursor-pointer font-medium text-indigo-600 hover:underline">
                  {edit.fotoUrl || editFoto ? "Trocar foto" : "Adicionar foto"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setEditFoto(e.target.files?.[0] ?? null)} />
                </label>
                {edit.fotoUrl && !editFoto && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() =>
                      wrap(async () => {
                        await api(`/api/usuarios/${edit.userId}/foto`, { method: "DELETE" });
                        setEdit({ ...edit, fotoUrl: null });
                      })
                    }
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>
            <input className={input} value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} required />
            <input className={input} placeholder="Telefone" value={edit.telefone ?? ""} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} />
            <select className={input} value={edit.regiaoId ?? ""} onChange={(e) => setEdit({ ...edit, regiaoId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sem região</option>
              {regs.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            <label className="block text-xs text-slate-500">Meta mensal (R$)
              <input className={input} type="number" min={0} value={edit.metaMensal} onChange={(e) => setEdit({ ...edit, metaMensal: Number(e.target.value) })} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEdit(null); setEditFoto(null); }} className="rounded-lg px-4 py-2 text-sm text-slate-600">Cancelar</button>
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
