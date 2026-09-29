"use client";
import { useCallback, useEffect, useState } from "react";
import { api, brl, fmtDuracao, type VendedorLive } from "@/lib/client";

type Linha = {
  vendedorId: number; nome: string; regiao: string | null; vendas: number; qtdVendas: number; ticketMedio: number;
  atendimentos: number; efetivos: number; refazer: number; meta: number; atingimento: number; horasProdutivas: number; horasOciosas: number; horasPausa: number; horasOnline: number;
};
type Relatorio = {
  periodo: { de: string; ate: string };
  resumo: { vendas: number; qtdVendas: number; atendimentos: number; efetivos: number; refazer: number; meta: number; horasProdutivas: number; horasOciosas: number; horasPausa: number };
  linhas: Linha[];
  porDia: { dia: string; total: number; qtd: number }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const h = (n: number) => fmtDuracao(n * 3600);

export default function RelatoriosPage() {
  const hoje = new Date();
  const [de, setDe] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [ate, setAte] = useState(iso(hoje));
  const [vid, setVid] = useState("");
  const [vs, setVs] = useState<VendedorLive[]>([]);
  const [r, setR] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(false);

  const qs = `de=${de}&ate=${ate}${vid ? `&vendedorId=${vid}` : ""}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setR(await api<Relatorio>(`/api/relatorios?${qs}`));
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    api<{ vendedores: VendedorLive[] }>("/api/vendedores").then((x) => setVs(x.vendedores));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function excel() {
    await api("/api/auth/me"); // garante token válido
    window.location.href = `/api/relatorios/export?${qs}`;
  }

  async function pdf() {
    if (!r) return;
    const [{ jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Relatório de Vendedores", 14, 16);
    doc.setFontSize(10);
    doc.text(`Período: ${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}`, 14, 23);
    doc.text(
      `Vendas: ${brl(r.resumo.vendas)}  |  Qtd: ${r.resumo.qtdVendas}  |  Atendimentos: ${r.resumo.atendimentos}  |  Meta período: ${brl(r.resumo.meta)}`,
      14, 29,
    );
    autoTable.default(doc, {
      startY: 34,
      head: [["Vendedor", "Região", "Vendas", "Qtd", "Ticket médio", "Atend.", "Efet.", "Refazer", "Meta", "Ating.", "Produtivo", "Ocioso", "Pausa"]],
      body: r.linhas.map((l) => [
        l.nome, l.regiao ?? "-", brl(l.vendas), l.qtdVendas, brl(l.ticketMedio), l.atendimentos, l.efetivos, l.refazer, brl(l.meta),
        `${l.atingimento.toFixed(0)}%`, h(l.horasProdutivas), h(l.horasOciosas), h(l.horasPausa),
      ]),
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 },
    });
    doc.save("relatorio-vendas.pdf");
  }

  const max = Math.max(1, ...(r?.porDia.map((d) => d.total) ?? [1]));
  const totalHoras = (r?.resumo.horasProdutivas ?? 0) + (r?.resumo.horasOciosas ?? 0) + (r?.resumo.horasPausa ?? 0) || 1;
  const atingGeral = r?.resumo.meta ? (r.resumo.vendas / r.resumo.meta) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatórios e exportação</h1>
          <p className="text-sm text-slate-500">Vendas, tempo produtivo/ocioso e metas</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">Vendedor
            <select value={vid} onChange={(e) => setVid(e.target.value)} className="mt-0.5 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
              <option value="">Todos</option>
              {vs.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
          <button onClick={excel} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">⬇ Excel</button>
          <button onClick={pdf} disabled={!r} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">⬇ PDF</button>
        </div>
      </div>

      {loading && !r && <p className="text-slate-400">Carregando…</p>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card label="Vendas no período" value={brl(r.resumo.vendas)} sub={`${r.resumo.qtdVendas} vendas`} />
            <Card label="Ticket médio" value={brl(r.resumo.qtdVendas ? r.resumo.vendas / r.resumo.qtdVendas : 0)} />
            <Card label="Atendimentos" value={String(r.resumo.atendimentos)} sub={`${r.resumo.efetivos} efetivos · ${r.resumo.refazer} a refazer`} />
            <Card label="Atingimento de meta" value={`${atingGeral.toFixed(0)}%`} sub={`meta: ${brl(r.resumo.meta)}`} />
            <Card label="Tempo produtivo" value={h(r.resumo.horasProdutivas)} sub={`${((r.resumo.horasProdutivas / totalHoras) * 100).toFixed(0)}% do tempo logado`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">Vendas por dia</h2>
              <div className="flex h-44 items-end gap-1">
                {r.porDia.map((d) => (
                  <div key={d.dia} className="group relative flex min-w-[6px] flex-1 flex-col justify-end" title={`${d.dia}: ${brl(d.total)} (${d.qtd})`}>
                    <div className="rounded-t bg-indigo-500 transition group-hover:bg-indigo-700" style={{ height: `${(d.total / max) * 100}%` }} />
                  </div>
                ))}
                {r.porDia.length === 0 && <p className="m-auto text-sm text-slate-400">Sem vendas no período.</p>}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>{r.porDia[0]?.dia.split("-").reverse().join("/")}</span>
                <span>{r.porDia.at(-1)?.dia.split("-").reverse().join("/")}</span>
              </div>
            </section>
            <section className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Distribuição do tempo</h2>
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-blue-500" style={{ width: `${(r.resumo.horasProdutivas / totalHoras) * 100}%` }} />
                <div className="bg-emerald-400" style={{ width: `${(r.resumo.horasOciosas / totalHoras) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(r.resumo.horasPausa / totalHoras) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex justify-between"><span>🔵 Produtivo</span><b>{h(r.resumo.horasProdutivas)}</b></li>
                <li className="flex justify-between"><span>🟢 Ocioso</span><b>{h(r.resumo.horasOciosas)}</b></li>
                <li className="flex justify-between"><span>🟠 Pausa</span><b>{h(r.resumo.horasPausa)}</b></li>
              </ul>
            </section>
          </div>

          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Vendedor</th><th className="p-3">Vendas</th><th className="p-3">Qtd</th><th className="p-3">Ticket</th>
                  <th className="p-3">Atend.</th><th className="p-3">Efetivos</th><th className="p-3">Refazer</th><th className="p-3">Meta (período)</th><th className="p-3">Atingimento</th>
                  <th className="p-3">Produtivo</th><th className="p-3">Ocioso</th><th className="p-3">Pausa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.linhas.map((l) => (
                  <tr key={l.vendedorId}>
                    <td className="p-3 font-medium">{l.nome}<p className="text-xs font-normal text-slate-400">{l.regiao ?? "—"}</p></td>
                    <td className="p-3">{brl(l.vendas)}</td>
                    <td className="p-3">{l.qtdVendas}</td>
                    <td className="p-3">{brl(l.ticketMedio)}</td>
                    <td className="p-3">{l.atendimentos}</td>
                    <td className="p-3 text-emerald-700">{l.efetivos}</td>
                    <td className="p-3 text-amber-700">{l.refazer}</td>
                    <td className="p-3">{brl(l.meta)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full ${l.atingimento >= 100 ? "bg-emerald-500" : l.atingimento >= 60 ? "bg-indigo-500" : "bg-red-400"}`} style={{ width: `${Math.min(100, l.atingimento)}%` }} />
                        </div>
                        {l.atingimento.toFixed(0)}%
                      </div>
                    </td>
                    <td className="p-3">{h(l.horasProdutivas)}</td>
                    <td className="p-3">{h(l.horasOciosas)}</td>
                    <td className="p-3">{h(l.horasPausa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
