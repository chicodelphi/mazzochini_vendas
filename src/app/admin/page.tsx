"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import {
  api, brl, desde, fmtHora, STATUS_META,
  type Alerta, type StatusKey, type VendedorLive,
} from "@/lib/client";
import { LOCAL_PADRAO, tipoLabel } from "@/lib/contato";
import AtividadeAtual from "@/components/AtividadeAtual";
import { useRealtime } from "@/lib/useRealtime";

type Feed = { id: number; icon: string; text: string; ts: string };
const FILTROS: (StatusKey | "todos")[] = ["todos", "online", "em_atendimento", "em_deslocamento", "em_pausa", "offline"];
const ALERTA_ICON: Record<string, string> = { parado: "🛑", pausa_longa: "☕", refazer_atrasado: "🔁" };

export default function AdminDashboard() {
  const [vs, setVs] = useState<VendedorLive[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [filtro, setFiltro] = useState<StatusKey | "todos">("todos");
  const [focus, setFocus] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const feedId = useRef(0);

  const load = useCallback(async () => {
    const d = await api<{ vendedores: VendedorLive[]; alertas: Alerta[] }>("/api/dashboard");
    setVs(d.vendedores);
    setAlertas(d.alertas);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const push = (icon: string, text: string) =>
    setFeed((f) => [{ id: ++feedId.current, icon, text, ts: new Date().toISOString() }, ...f].slice(0, 40));

  const upd = (id: number, fn: (v: VendedorLive) => Partial<VendedorLive>) =>
    setVs((cur) => cur.map((v) => (v.id === id ? { ...v, ...fn(v) } : v)));

  const connected = useRealtime((ev, d) => {
    switch (ev) {
      case "vendedor:online":
      case "vendedor:status_changed":
      case "vendedor:offline": {
        const st = d.status as StatusKey;
        upd(d.vendedorId, () => ({ status: st, statusDesde: d.ts }));
        push(st === "offline" ? "⚫" : st === "online" ? "🟢" : st === "em_pausa" ? "🟠" : st === "em_atendimento" ? "🔵" : "🟣", `${d.nome}: ${STATUS_META[st].label}`);
        break;
      }
      case "vendedor:heartbeat":
        upd(d.vendedorId, () => ({ ultimoHeartbeat: d.ts }));
        break;
      case "vendedor:venda_registrada":
        upd(d.vendedorId, (v) => ({
          vendasHoje: v.vendasHoje + d.venda.valor,
          vendasHojeQtd: v.vendasHojeQtd + 1,
          vendasMes: v.vendasMes + d.venda.valor,
          vendasMesQtd: v.vendasMesQtd + 1,
        }));
        push("💰", `${d.nome} vendeu ${brl(d.venda.valor)} (${d.venda.produto}) para ${d.venda.cliente}`);
        break;
      case "vendedor:checkin_cliente":
        upd(d.vendedorId, (v) => ({
          atendimentosHoje: v.atendimentosHoje + 1,
          refazerPendentes: Math.max(0, v.refazerPendentes - (d.checkin.refazerDeId ? 1 : 0)),
          atendimentoAtual: {
            id: d.checkin.id,
            clienteNome: d.checkin.clienteNome,
            colaboradorNome: d.checkin.colaboradorNome,
            tipoContato: d.checkin.tipoContato,
            entrada: d.checkin.entrada,
          },
        }));
        push("📌", `${d.nome} iniciou atendimento em ${d.cliente} (${tipoLabel(d.tipo)})`);
        break;
      case "vendedor:checkout_cliente":
        upd(d.vendedorId, (v) => ({
          atendimentoAtual: null,
          refazerPendentes: v.refazerPendentes + (d.resultado === "refazer" ? 1 : 0),
        }));
        push(
          d.resultado === "refazer" ? "🔁" : "🏁",
          `${d.nome} finalizou o atendimento em ${d.cliente} — ${d.resultado === "refazer" ? `REFAZER (${d.motivo})` : "efetivo"}`,
        );
        break;
      case "dados:limpos":
        load();
        setFeed([]);
        break;
      case "alerta:novo":
        setAlertas((a) => [d.alerta, ...a]);
        push("🚨", d.alerta.mensagem);
        break;
    }
  });

  const ativos = useMemo(() => vs.filter((v) => v.ativo), [vs]);
  const k = useMemo(() => {
    const por: Record<string, number> = { offline: 0, online: 0, em_atendimento: 0, em_pausa: 0, em_deslocamento: 0 };
    ativos.forEach((v) => (por[v.status] += 1));
    return {
      por,
      ativosAgora: ativos.length - por.offline,
      vendasHoje: ativos.reduce((s, v) => s + v.vendasHoje, 0),
      vendasHojeQtd: ativos.reduce((s, v) => s + v.vendasHojeQtd, 0),
      vendasMes: ativos.reduce((s, v) => s + v.vendasMes, 0),
      meta: ativos.reduce((s, v) => s + v.metaMensal, 0),
      atend: ativos.reduce((s, v) => s + v.atendimentosHoje, 0),
      refazer: ativos.reduce((s, v) => s + v.refazerPendentes, 0),
    };
  }, [ativos]);

  const lista = ativos
    .filter((v) => filtro === "todos" || v.status === filtro)
    .sort((a, b) => (a.status === "offline" ? 1 : 0) - (b.status === "offline" ? 1 : 0) || a.nome.localeCompare(b.nome));

  const nomeDe = (id: number) => vs.find((v) => v.id === id)?.nome ?? `#${id}`;
  const resolver = async (id: number) => {
    await api(`/api/alertas/${id}`, { method: "PATCH" });
    setAlertas((a) => a.filter((x) => x.id !== id));
  };
  const pct = k.meta ? Math.min(100, (k.vendasMes / k.meta) * 100) : 0;
  const chips = [...ativos].sort((a, b) => (a.status === "offline" ? 1 : 0) - (b.status === "offline" ? 1 : 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-semibold">Visão geral</h1>
          <p className="text-sm text-slate-500">Acompanhe sua equipe ao vivo</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${connected ? "bg-indigo-100 text-indigo-700" : "bg-red-100 text-red-700"}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-indigo-500" : "bg-red-500"}`} />
          {connected ? "Tempo real conectado" : "Reconectando…"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Vendedores ativos" value={`${k.ativosAgora}/${ativos.length}`} sub="conectados agora" />
        <Kpi label="Em atendimento" value={String(k.por.em_atendimento)} sub={`${k.por.em_deslocamento} em deslocamento`} />
        <Kpi label="Em pausa" value={String(k.por.em_pausa)} sub={`${k.por.online} livres`} />
        <Kpi label="Vendas hoje" value={brl(k.vendasHoje)} sub={`${k.vendasHojeQtd} vendas`} />
        <Kpi label="Atendimentos hoje" value={String(k.atend)} sub="contatos com clientes" />
        <Kpi label="A refazer" value={String(k.refazer)} sub="contatos pendentes" />
        <div className="col-span-2 rounded-xl bg-white p-4 shadow-sm lg:col-span-4 xl:col-span-1">
          <p className="text-xs font-medium uppercase text-slate-500">Meta do mês</p>
          <p className="mt-1 text-xl font-bold">{pct.toFixed(0)}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-400">{brl(k.vendasMes)} / {brl(k.meta)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Foto da sede no centro da tela — local fixo de todos os vendedores */}
        <div className="relative h-[440px] overflow-hidden rounded-3xl bg-slate-900 shadow-sm lg:col-span-2 lg:h-[580px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sede.jpg" alt="Sede da empresa" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/10 to-slate-950/20" />
          <div className="glass absolute left-5 top-5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-slate-800">
            📍 {LOCAL_PADRAO}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-6">
            <p className="text-2xl font-semibold tracking-tight text-white">Mazzochini Materiais Laboratoriais</p>
            <p className="mt-1 text-sm text-white/70">
              {k.ativosAgora} de {ativos.length} vendedores conectados · {k.por.em_atendimento} em atendimento
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setFocus(v.id)}
                  className={`glass flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3.5 text-xs shadow-sm ${v.status === "offline" ? "opacity-55" : ""} ${focus === v.id ? "ring-2 ring-indigo-400" : ""}`}
                >
                  <Avatar nome={v.nome} fotoUrl={v.fotoUrl} cor={STATUS_META[v.status].color} className="h-6 w-6 text-[11px]" />
                  <span className="text-left leading-tight">
                    <b className="block font-semibold text-slate-900">{v.nome.split(" ")[0]}</b>
                    <span className="text-[10px] text-slate-500">{STATUS_META[v.status].label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex h-[580px] flex-col overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <p className="mb-2 text-sm font-semibold">Vendedores ({lista.length})</p>
            <div className="flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`rounded-full px-2.5 py-1 text-xs ${filtro === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {f === "todos" ? "Todos" : STATUS_META[f].label}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {lista.map((v) => (
              <li key={v.id} className={`cursor-pointer p-3.5 hover:bg-slate-50 ${focus === v.id ? "bg-indigo-50" : ""}`} onClick={() => setFocus(v.id)}>
                <div className="flex items-center justify-between gap-2">
                  <Avatar nome={v.nome} fotoUrl={v.fotoUrl} cor={STATUS_META[v.status].color} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{v.nome}</p>
                    <p className="truncate text-xs text-slate-500">{v.regiao ?? "Sem região"} · 📍 {LOCAL_PADRAO}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[v.status].cls}`}>
                    {STATUS_META[v.status].label}
                  </span>
                </div>
                <AtividadeAtual v={v} className="mt-1.5 text-xs text-slate-600" />
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                  <span>{brl(v.vendasHoje)} hoje · {v.atendimentosHoje} atend.</span>
                  <Link href={`/admin/vendedores/${v.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-indigo-600 hover:underline">
                    Detalhes →
                  </Link>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-indigo-400" style={{ width: `${v.metaMensal ? Math.min(100, (v.vendasMes / v.metaMensal) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
            {lista.length === 0 && <li className="p-6 text-center text-sm text-slate-400">Nenhum vendedor neste filtro.</li>}
          </ul>
        </div>
      </div>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">👀 O que cada vendedor está fazendo agora</h2>
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {chips.map((v) => (
            <Link key={v.id} href={`/admin/vendedores/${v.id}`} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 hover:border-indigo-400">
              <Avatar nome={v.nome} fotoUrl={v.fotoUrl} cor={STATUS_META[v.status].color} className="h-9 w-9 text-sm" />
              <span className="min-w-0">
                <b className="block truncate text-sm">{v.nome}</b>
                <AtividadeAtual v={v} className="text-xs text-slate-600" />
                {v.refazerPendentes > 0 && (
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${v.refazerAtrasados ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    🔁 {v.refazerPendentes} a refazer{v.refazerAtrasados ? ` · ${v.refazerAtrasados} atrasado(s)` : ""}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">🚨 Alertas automáticos ({alertas.length})</h2>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {alertas.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm">
                <span className="text-lg">{ALERTA_ICON[a.tipo] ?? "⚠️"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-red-900">{a.mensagem}</p>
                  <p className="text-xs text-red-700/70">{nomeDe(a.vendedorId)} · {fmtHora(a.criadoEm)}</p>
                </div>
                <button onClick={() => resolver(a.id)} className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100">
                  Resolver
                </button>
              </li>
            ))}
            {alertas.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Tudo certo — nenhum alerta aberto.</li>}
          </ul>
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">⚡ Atividade ao vivo</h2>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
            {feed.map((f) => (
              <li key={f.id} className="flex gap-2 rounded-lg px-2 py-1.5 odd:bg-slate-50">
                <span>{f.icon}</span>
                <span className="flex-1">{f.text}</span>
                <span className="text-xs text-slate-400">{fmtHora(f.ts)}</span>
              </li>
            ))}
            {feed.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Aguardando eventos dos vendedores…</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
