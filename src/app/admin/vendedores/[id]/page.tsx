"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import AtendimentoCard from "@/components/AtendimentoCard";
import AtividadeAtual from "@/components/AtividadeAtual";
import Chat from "@/components/Chat";
import {
  api, ATIVIDADE_LABEL, brl, desde, fmtDataHora, fmtDuracao, fmtHora, STATUS_META,
  type SessionUser, type StatusKey, type VendedorLive,
} from "@/lib/client";
import { LOCAL_PADRAO, type Atendimento } from "@/lib/contato";
import { useRealtime } from "@/lib/useRealtime";

type Atividade = { id: number; tipo: string; descricao: string | null; timestamp: string };
type Detalhe = {
  vendedor: VendedorLive;
  timeline: Atividade[];
  vendas: { id: number; cliente: string; produto: string; valor: string; data: string }[];
  atendimentos: Atendimento[];
  tempos: Record<StatusKey, number>;
};

const today = () => new Date().toISOString().slice(0, 10);

function textoAtividade(a: Atividade) {
  if (a.tipo === "status") return `Status: ${STATUS_META[a.descricao as StatusKey]?.label ?? a.descricao}`;
  if (["login", "logout", "offline"].includes(a.tipo)) return ATIVIDADE_LABEL[a.tipo];
  return a.descricao ?? ATIVIDADE_LABEL[a.tipo] ?? a.tipo;
}
const ICON: Record<string, string> = { login: "🔑", logout: "🚪", offline: "📵", status: "🔄", venda: "💰", checkin: "📌", checkout: "🏁" };

export default function VendedorDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detalhe | null>(null);
  const [dia, setDia] = useState(today());
  const [me, setMe] = useState<SessionUser | null>(null);
  const [erro, setErro] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api<Detalhe>(`/api/vendedores/${id}?data=${dia}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }, [id, dia]);

  useEffect(() => {
    load();
    api<{ user: SessionUser }>("/api/auth/me").then((r) => setMe(r.user));
  }, [load]);

  useRealtime((ev, d) => {
    if (!data || d?.vendedorId !== Number(id)) return;
    if (ev === "vendedor:heartbeat" || ev === "mensagem:nova") return;
    if (ev === "vendedor:online" || ev === "vendedor:status_changed" || ev === "vendedor:offline")
      setData((cur) => cur && { ...cur, vendedor: { ...cur.vendedor, status: d.status, statusDesde: d.ts } });
    if (ev.startsWith("vendedor:")) load();
  });

  if (erro) return <p className="rounded-lg bg-red-50 p-4 text-red-700">{erro}</p>;
  if (!data) return <p className="text-slate-400">Carregando…</p>;
  const { vendedor: v, tempos } = data;
  const produtivo = (tempos?.em_atendimento ?? 0) + (tempos?.em_deslocamento ?? 0);
  const ocioso = tempos?.online ?? 0;
  const pausa = tempos?.em_pausa ?? 0;
  const pct = v.metaMensal ? Math.min(100, (v.vendasMes / v.metaMensal) * 100) : 0;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-indigo-600 hover:underline">← Visão geral</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{v.nome}</h1>
          <p className="text-sm text-slate-500">{v.regiao ?? "Sem região"} · {v.email} {v.telefone && `· ${v.telefone}`}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_META[v.status].cls}`}>
            {STATUS_META[v.status].label} {v.status !== "offline" && `· há ${desde(v.statusDesde)}`}
          </span>
          <input type="date" value={dia} max={today()} onChange={(e) => setDia(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" />
        </div>
      </div>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Fazendo agora</p>
        <AtividadeAtual v={v} className="mt-1 text-[15px] text-slate-800" />
        {v.refazerPendentes > 0 && (
          <p className="mt-1.5 text-xs text-amber-700">🔁 {v.refazerPendentes} contato(s) a refazer{v.refazerAtrasados ? ` · ${v.refazerAtrasados} com prazo vencido` : ""}</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Tempo produtivo" value={fmtDuracao(produtivo)} sub="atendimento + deslocamento" />
        <Stat label="Tempo ocioso" value={fmtDuracao(ocioso)} sub="online sem atividade" />
        <Stat label="Tempo em pausa" value={fmtDuracao(pausa)} />
        <Stat label="Vendas hoje" value={brl(v.vendasHoje)} sub={`${v.vendasHojeQtd} vendas · ${v.atendimentosHoje} atend.`} />
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">Meta mensal</p>
          <p className="mt-1 text-xl font-bold">{pct.toFixed(0)}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-400" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-slate-400">{brl(v.vendasMes)} / {brl(v.metaMensal)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="relative h-[360px] overflow-hidden rounded-3xl bg-slate-900 shadow-sm lg:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sede.jpg" alt="Sede da empresa" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
          <span className="glass absolute left-5 top-5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-slate-800">📍 {LOCAL_PADRAO}</span>
          <div className="absolute bottom-5 left-6 flex items-center gap-3">
            <Avatar nome={v.nome} fotoUrl={v.fotoUrl} cor={STATUS_META[v.status].color} className="h-11 w-11 text-lg" />
            <div className="text-white">
              <p className="text-lg font-semibold leading-tight">{v.nome}</p>
              <p className="text-sm text-white/75">{STATUS_META[v.status].label}</p>
            </div>
          </div>
        </div>
        {me && <Chat meId={me.uid} withUserId={v.userId} title={`Chat com ${v.nome}`} className="h-[360px]" />}
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">📌 Atendimentos com clientes</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {data.atendimentos.map((a) => (
            <AtendimentoCard key={a.id} a={a} />
          ))}
        </div>
        {data.atendimentos.length === 0 && <p className="py-4 text-sm text-slate-400">Nenhum atendimento registrado.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">🕒 Timeline de atividades</h2>
          <ol className="relative max-h-[420px] space-y-3 overflow-y-auto border-l-2 border-slate-200 pl-5">
            {data.timeline.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-white text-sm ring-2 ring-slate-200">{ICON[a.tipo] ?? "•"}</span>
                <p className="text-sm font-medium">{textoAtividade(a)}</p>
                <p className="text-xs text-slate-400">{fmtHora(a.timestamp)} · 📍 {LOCAL_PADRAO}</p>
              </li>
            ))}
            {data.timeline.length === 0 && <li className="text-sm text-slate-400">Sem atividades neste dia.</li>}
          </ol>
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">💰 Últimas vendas</h2>
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto text-sm">
            {data.vendas.map((s) => (
              <li key={s.id} className="flex justify-between py-2">
                <span>{s.cliente} <span className="text-xs text-slate-400">· {s.produto} · {fmtDataHora(s.data)}</span></span>
                <b>{brl(Number(s.valor))}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
