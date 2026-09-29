"use client";
import { fmtDataHora, fmtDuracao, fmtHora } from "@/lib/client";
import { LOCAL_PADRAO, tipoIcon, tipoLabel, type Atendimento } from "@/lib/contato";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function AtendimentoCard({ a, showVendedor = false }: { a: Atendimento; showVendedor?: boolean }) {
  const ini = new Date(a.entrada);
  const fim = a.saida ? new Date(a.saida) : null;
  const dur = fim ? fmtDuracao((fim.getTime() - ini.getTime()) / 1000) : null;
  const refazer = a.resultado === "refazer";
  const atrasado = refazer && !a.refeito && !!a.refazerEm && new Date(a.refazerEm).getTime() < Date.now();

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{a.clienteNome}</h3>
          <p className="text-xs text-slate-500">
            {showVendedor && a.vendedorNome && <b className="font-semibold text-slate-700">{a.vendedorNome} · </b>}
            {fmtDataHora(a.entrada)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {tipoIcon(a.tipoContato)} {tipoLabel(a.tipoContato)}
          </span>
          {!a.saida && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">Em andamento</span>}
          {a.resultado === "efetivo" && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">✅ Efetivo</span>
          )}
          {refazer && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">🔁 Refazer</span>}
        </div>
      </div>

      {/* Hora de início e fim */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-100 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Início</p>
          <p className="text-sm font-semibold">{fmtHora(ini)}</p>
        </div>
        <div className="rounded-xl bg-slate-100 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fim</p>
          <p className="text-sm font-semibold">{fim ? fmtHora(fim) : "—"}</p>
        </div>
        <div className="rounded-xl bg-slate-100 px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Duração</p>
          <p className="text-sm font-semibold">{dur ?? "em andamento"}</p>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Falou com</dt>
          <dd className="font-medium">{a.colaboradorNome ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Local</dt>
          <dd>📍 {LOCAL_PADRAO}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">E-mail do colaborador</dt>
          <dd className="truncate">{a.emailColaborador ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Telefone do colaborador</dt>
          <dd className="truncate">
            {a.telefoneColaborador ? (
              <a href={`tel:${a.telefoneColaborador.replace(/[^\d+]/g, "")}`} className="text-indigo-700 hover:underline">
                📞 {a.telefoneColaborador}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">E-mail da empresa</dt>
          <dd className="truncate">{a.emailEmpresa ?? "—"}</dd>
        </div>
      </dl>

      {a.descricao && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-700">{a.descricao}</p>
      )}

      {refazer && (
        <div className={`mt-3 rounded-xl border px-3.5 py-3 text-sm ${atrasado ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Por que não foi efetivo</p>
            {a.refeito ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Refeito ✔</span>
            ) : atrasado ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Atrasado</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Pendente</span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-slate-800">{a.motivo}</p>
          {a.refazerEm && (
            <p className="mt-2 text-xs text-slate-600">
              🔁 Refazer em <b>{fmtDataHora(a.refazerEm)}</b>
            </p>
          )}
        </div>
      )}

      {a.refazerDeId && <p className="mt-2 text-xs text-slate-500">↩ Este contato refez o atendimento #{a.refazerDeId}.</p>}

      {a.anexos.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Histórico da conversa</p>
          <div className="flex flex-wrap gap-2">
            {a.anexos.map((f) => (
              <a
                key={f.id}
                href={`/api/anexos/${f.id}`}
                download
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
              >
                <span>📎</span>
                <span className="truncate">{f.nome}</span>
                <span className="shrink-0 text-slate-400">{kb(f.tamanho)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
