"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";

const LABEL: Record<string, string> = {
  vendedores: "vendedores (com login)",
  clientes: "empresas clientes",
  colaboradores: "colaboradores",
  regioes: "regiões",
  atendimentos: "atendimentos",
  anexos: "arquivos anexados",
  vendas: "vendas",
  atividades: "registros de atividade",
  alertas: "alertas",
  mensagens: "mensagens do chat",
};
const ORDEM = Object.keys(LABEL);

/** Botão "Apagar dados" (gestor): apaga TUDO da empresa, com confirmação digitada. */
export default function LimparDados({ className = "", label = "🗑 Apagar dados" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [res, setRes] = useState<Record<string, number> | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTexto("");
    setErro("");
    if (res) window.location.href = "/admin";
    setRes(null);
  };

  async function limpar() {
    setBusy(true);
    setErro("");
    try {
      const r = await api<{ removidos: Record<string, number> }>("/api/admin/limpar", {
        method: "POST",
        json: { confirmacao: "LIMPAR" },
      });
      setRes(r.removidos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao apagar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/50 p-4" onClick={close}>
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {res ? (
                <>
                  <p className="text-3xl">✅</p>
                  <h2 className="mt-2 text-xl font-semibold">Tudo apagado</h2>
                  <p className="mt-1 text-sm text-slate-500">O sistema foi zerado. Só a sua conta de gestor foi mantida.</p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {ORDEM.filter((k) => k in res).map((k) => (
                      <li key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="capitalize">{LABEL[k]}</span>
                        <b>{res[k]}</b>
                      </li>
                    ))}
                  </ul>
                  <button onClick={close} className="mt-5 w-full rounded-xl bg-slate-900 py-3 font-semibold text-white">
                    Fechar
                  </button>
                </>
              ) : (
                <>
                  <p className="text-3xl">🗑️</p>
                  <h2 className="mt-2 text-xl font-semibold">Apagar TODOS os dados</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Esta ação é <b className="text-red-600">irreversível</b> e não tem backup.
                  </p>
                  <ul className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-900">
                    <li>• Vendedores e seus logins</li>
                    <li>• Empresas clientes e colaboradores</li>
                    <li>• Atendimentos e histórico de conversas anexado</li>
                    <li>• Vendas, atividades, alertas e mensagens do chat</li>
                    <li>• Regiões</li>
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">Somente as contas de gestor são mantidas, para você continuar acessando.</p>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Digite LIMPAR para confirmar
                    <input
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      autoComplete="off"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base normal-case tracking-normal outline-none focus:border-red-400"
                    />
                  </label>
                  {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
                  <div className="mt-5 flex gap-2">
                    <button onClick={close} className="flex-1 rounded-xl bg-slate-100 py-3 font-medium text-slate-700">
                      Cancelar
                    </button>
                    <button
                      onClick={limpar}
                      disabled={busy || texto.trim().toUpperCase() !== "LIMPAR"}
                      className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white disabled:opacity-40"
                    >
                      {busy ? "Apagando…" : "Apagar tudo"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
