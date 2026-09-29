"use client";
import { useCallback, useEffect, useState } from "react";
import AtendimentoCard from "@/components/AtendimentoCard";
import { api, type VendedorLive } from "@/lib/client";
import { TIPOS_CONTATO, type Atendimento } from "@/lib/contato";
import { useRealtime } from "@/lib/useRealtime";

const sel = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400";

type Resumo = { efetivo: number; refazer: number; pendente: number; atrasado: number; andamento: number };

export default function AtendimentosPage() {
  const [list, setList] = useState<Atendimento[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [vs, setVs] = useState<VendedorLive[]>([]);
  const [q, setQ] = useState("");
  const [vid, setVid] = useState("");
  const [tipo, setTipo] = useState("");
  const [resultado, setResultado] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (vid) p.set("vendedorId", vid);
    if (tipo) p.set("tipo", tipo);
    if (resultado) p.set("resultado", resultado);
    const r = await api<{ atendimentos: Atendimento[]; resumo: Resumo }>(`/api/atendimentos?${p}`);
    setList(r.atendimentos);
    setResumo(r.resumo);
    setLoading(false);
  }, [q, vid, tipo, resultado]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api<{ vendedores: VendedorLive[] }>("/api/vendedores").then((r) => setVs(r.vendedores));
  }, []);

  useRealtime((ev) => {
    if (ev === "vendedor:checkin_cliente" || ev === "vendedor:checkout_cliente" || ev === "dados:limpos") load();
  });

  const finalizados = (resumo?.efetivo ?? 0) + (resumo?.refazer ?? 0);
  const taxa = finalizados ? Math.round(((resumo?.efetivo ?? 0) / finalizados) * 100) : 0;

  const card = (label: string, value: string | number, sub: string, key: string, tone: string) => (
    <button
      onClick={() => setResultado(resultado === key ? "" : key)}
      className={`rounded-2xl p-4 text-left shadow-sm ${resultado === key ? "ring-2 ring-slate-900" : ""} ${tone}`}
    >
      <p className="text-xs font-medium uppercase opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70">{sub}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Atendimentos</h1>
        <p className="text-sm text-slate-500">Contatos com clientes: início e fim, resultado (Efetivo ou Refazer), motivo e conversa anexada.</p>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {card("Efetivos", resumo.efetivo, `${taxa}% de efetividade`, "efetivo", "bg-emerald-50 text-emerald-900")}
          {card("Refazer", resumo.refazer, "total marcados", "refazer", "bg-amber-50 text-amber-900")}
          {card("Refazer pendentes", resumo.pendente, `${resumo.atrasado} com prazo vencido`, "pendente", resumo.atrasado ? "bg-red-50 text-red-900" : "bg-white")}
          {card("Em andamento", resumo.andamento, "atendimentos abertos agora", "andamento", "bg-blue-50 text-blue-900")}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por empresa, colaborador, e-mail, descrição ou motivo…"
          className={`${sel} min-w-[260px] flex-1`}
        />
        <select value={vid} onChange={(e) => setVid(e.target.value)} className={sel}>
          <option value="">Todos os vendedores</option>
          {vs.map((v) => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={sel}>
          <option value="">Todos os tipos de contato</option>
          {TIPOS_CONTATO.map((t) => (
            <option key={t.v} value={t.v}>{t.label}</option>
          ))}
        </select>
        <select value={resultado} onChange={(e) => setResultado(e.target.value)} className={sel}>
          <option value="">Todos os resultados</option>
          <option value="efetivo">Efetivos</option>
          <option value="refazer">Refazer (todos)</option>
          <option value="pendente">Refazer pendentes</option>
          <option value="andamento">Em andamento</option>
        </select>
      </div>

      {loading && <p className="text-slate-400">Carregando…</p>}
      <div className="grid gap-3 xl:grid-cols-2">
        {list.map((a) => (
          <AtendimentoCard key={a.id} a={a} showVendedor />
        ))}
      </div>
      {!loading && list.length === 0 && <p className="py-10 text-center text-slate-400">Nenhum atendimento encontrado.</p>}
    </div>
  );
}
