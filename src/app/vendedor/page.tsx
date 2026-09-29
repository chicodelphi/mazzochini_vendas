"use client";
import { useCallback, useEffect, useState } from "react";
import Chat from "@/components/Chat";
import AtendimentoCard from "@/components/AtendimentoCard";
import Logo from "@/components/Logo";
import { api, apiForm, brl, desde, fmtDataHora, fmtHora, STATUS_META, type StatusKey, type VendedorLive } from "@/lib/client";
import { LOCAL_PADRAO, TIPOS_CONTATO, tipoLabel, type Atendimento } from "@/lib/contato";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";
import { comprimirImagem } from "@/lib/imagem";
import Avatar from "@/components/Avatar";

type Pendente = {
  id: number; clienteId: number | null; clienteNome: string; emailEmpresa: string | null;
  colaboradorId: number | null; colaboradorNome: string | null; emailColaborador: string | null; telefoneColaborador: string | null;
  tipoContato: string | null; motivo: string | null; refazerEm: string | null;
};
type Me = {
  vendedor: VendedorLive;
  checkinAberto: {
    id: number; clienteNome: string; emailEmpresa: string | null; colaboradorNome: string | null;
    emailColaborador: string | null; telefoneColaborador: string | null; tipoContato: string | null; entrada: string;
  } | null;
  ultimasVendas: { id: number; cliente: string; produto: string; valor: string; data: string }[];
  mensagensNaoLidas: number;
  admin: { id: number; nome: string } | null;
  refazerPendentes: Pendente[];
};
type Cliente = { id: number; nome: string; email: string | null };
type Colab = { id: number; nome: string; email: string | null; telefone: string | null };
type Tab = "inicio" | "atend" | "venda" | "chat";

const inp = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-indigo-400";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const tile =
  "flex flex-col items-start gap-3 rounded-2xl bg-white p-4 text-left text-[15px] font-semibold text-slate-900 shadow-sm active:scale-[0.97] disabled:opacity-40";
const tileIcon = "grid h-11 w-11 place-items-center rounded-full text-xl";
const EMPTY_FORM = { empresa: "", emailEmpresa: "", colabId: "", colabNome: "", colabEmail: "", colabTel: "", tipo: "" };
const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const amanha9h = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
};
const ACCEPT = ".txt,.pdf,.png,.jpg,.jpeg,.webp,.zip,.doc,.docx,.xls,.xlsx,.csv,.eml,.msg,.html,.json";

export default function VendedorApp() {
  const { user, logout } = useAuth(["vendedor"]);
  const [me, setMe] = useState<Me | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [meus, setMeus] = useState<Atendimento[]>([]);
  const [filtroAt, setFiltroAt] = useState<"todos" | "efetivo" | "refazer" | "andamento">("todos");
  const [buscaAt, setBuscaAt] = useState("");
  const [tab, setTab] = useState<Tab>("inicio");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [, setTick] = useState(0);

  // iniciar atendimento
  const [startOpen, setStartOpen] = useState(false);
  const [f, setF] = useState(EMPTY_FORM);
  const [colabs, setColabs] = useState<Colab[]>([]);
  // finalizar atendimento
  const [endOpen, setEndOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [resultado, setResultado] = useState<"" | "efetivo" | "refazer">("");
  const [motivo, setMotivo] = useState("");
  const [refazerEm, setRefazerEm] = useState("");
  const [refazerDe, setRefazerDe] = useState<number | null>(null);
  // venda
  const [venda, setVenda] = useState({ clienteId: "", produto: "", valor: "" });

  const load = useCallback(async () => {
    const [m, c, at] = await Promise.all([
      api<Me>("/api/vendedor/me"),
      api<{ clientes: Cliente[] }>("/api/clientes"),
      api<{ atendimentos: Atendimento[] }>("/api/vendedor/atendimentos?limit=100"),
    ]);
    setMe(m);
    setMeus(at.atendimentos);
    setNaoLidas(m.mensagensNaoLidas);
    setClientes(c.clientes);
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Heartbeat a cada 30s + relógio de UI
  useEffect(() => {
    if (!me) return;
    const hb = setInterval(() => api("/api/vendedor/heartbeat", { method: "POST" }).catch(() => {}), 30_000);
    const tk = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      clearInterval(hb);
      clearInterval(tk);
    };
  }, [me?.vendedor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtime((ev, d) => {
    if (ev === "mensagem:nova" && d.mensagem.destinatarioId === user?.uid && tab !== "chat") setNaoLidas((n) => n + 1);
    if (ev === "dados:limpos") {
      // conta apagada pelo gestor: encerra a sessão
      api("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => (window.location.href = "/login"));
    }
  });

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 4000);
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (ok) flash(ok);
    } catch (e) {
      flash(e instanceof Error ? `⚠️ ${e.message}` : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: StatusKey) => run(() => api("/api/vendedor/status", { method: "POST", json: { status } }));

  // ---- iniciar atendimento
  const matched = clientes.find((c) => c.nome.toLowerCase() === f.empresa.trim().toLowerCase());

  async function onEmpresa(value: string) {
    const c = clientes.find((x) => x.nome.toLowerCase() === value.trim().toLowerCase());
    setF((cur) => ({
      ...cur,
      empresa: value,
      emailEmpresa: c?.email ?? (c ? cur.emailEmpresa : cur.emailEmpresa),
      colabId: c ? "" : "novo",
      colabNome: "",
      colabEmail: "",
      colabTel: "",
    }));
    if (c) {
      const r = await api<{ colaboradores: Colab[] }>(`/api/colaboradores?clienteId=${c.id}`).catch(() => ({ colaboradores: [] }));
      setColabs(r.colaboradores);
    } else setColabs([]);
  }

  function onColab(id: string) {
    const c = colabs.find((x) => String(x.id) === id);
    setF((cur) => ({ ...cur, colabId: id, colabEmail: c?.email ?? "", colabTel: c?.telefone ?? "", colabNome: "" }));
  }

  const novoColab = f.colabId === "novo" || (!matched && !!f.empresa.trim());

  const iniciar = () =>
    run(async () => {
      const nome = f.empresa.trim();
      if (!nome) throw new Error("Informe o nome da empresa");
      if (!f.emailEmpresa.trim()) throw new Error("Informe o e-mail da empresa");
      if (!f.colabId && !novoColab) throw new Error("Selecione o colaborador ou cadastre um novo");
      if (novoColab && !f.colabNome.trim()) throw new Error("Informe o nome do colaborador");
      if (!f.colabEmail.trim()) throw new Error("Informe o e-mail do colaborador");
      if (!f.tipo) throw new Error("Selecione o tipo de contato");
      await api("/api/vendedor/checkins", {
        method: "POST",
        json: {
          clienteId: matched?.id ?? null,
          clienteNome: nome,
          emailEmpresa: f.emailEmpresa.trim(),
          emailColaborador: f.colabEmail.trim(),
          telefoneColaborador: f.colabTel.trim() || null,
          tipoContato: f.tipo,
          refazerDeId: refazerDe,
          ...(novoColab ? { colaboradorNome: f.colabNome.trim() } : { colaboradorId: Number(f.colabId) }),
        },
      });
      setStartOpen(false);
      setRefazerDe(null);
      setF(EMPTY_FORM);
      setColabs([]);
    }, "Atendimento iniciado ✔");

  // ---- finalizar atendimento
  const concluir = () =>
    run(async () => {
      if (descricao.trim().length < 5) throw new Error("Descreva como foi o atendimento");
      if (files.length === 0) throw new Error("Anexe o histórico da conversa");
      if (!resultado) throw new Error("Informe se o contato foi Efetivo ou Refazer");
      if (resultado === "refazer") {
        if (motivo.trim().length < 5) throw new Error("Explique por que o contato não foi efetivo");
        if (!refazerEm || Number.isNaN(new Date(refazerEm).getTime())) throw new Error("Informe quando refazer o contato");
      }
      const fd = new FormData();
      fd.append("descricao", descricao.trim());
      fd.append("resultado", resultado);
      if (resultado === "refazer") {
        fd.append("motivo", motivo.trim());
        fd.append("refazerEm", new Date(refazerEm).toISOString());
      }
      // comprime imagens (prints/fotos) e respeita o limite de 4 MB por envio (Vercel)
      const prontos = await Promise.all(files.map((x) => comprimirImagem(x)));
      const total = prontos.reduce((a, x) => a + x.size, 0);
      if (total > 4 * 1024 * 1024)
        throw new Error(`Os arquivos somam ${(total / 1048576).toFixed(1)} MB — o limite é 4 MB por atendimento`);
      prontos.forEach((x) => fd.append("arquivos", x));
      await apiForm("/api/vendedor/checkins", "PATCH", fd);
      setEndOpen(false);
      setDescricao("");
      setFiles([]);
      setResultado("");
      setMotivo("");
      setRefazerEm("");
    }, "Atendimento finalizado ✔");

  async function refazerContato(p: Pendente) {
    let cs: Colab[] = [];
    if (p.clienteId) {
      const r = await api<{ colaboradores: Colab[] }>(`/api/colaboradores?clienteId=${p.clienteId}`).catch(() => ({ colaboradores: [] as Colab[] }));
      cs = r.colaboradores;
    }
    setColabs(cs);
    setF({
      empresa: p.clienteNome,
      emailEmpresa: p.emailEmpresa ?? "",
      colabId: p.colaboradorId ? String(p.colaboradorId) : "",
      colabNome: "",
      colabEmail: p.emailColaborador ?? "",
      colabTel: p.telefoneColaborador ?? "",
      tipo: p.tipoContato ?? "",
    });
    setRefazerDe(p.id);
    setStartOpen(true);
  }

  const fecharStart = () => {
    setStartOpen(false);
    if (refazerDe) {
      setRefazerDe(null);
      setF(EMPTY_FORM);
      setColabs([]);
    }
  };

  const registrarVenda = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/vendedor/vendas", {
        method: "POST",
        json: { clienteId: Number(venda.clienteId), produto: venda.produto, valor: Number(venda.valor.replace(",", ".")) },
      });
      setVenda({ clienteId: "", produto: "", valor: "" });
    }, "Venda registrada 🎉");
  };

  if (!user || !me) return <div className="grid min-h-screen place-items-center text-slate-400">Carregando…</div>;
  const v = me.vendedor;
  const st = STATUS_META[v.status];
  const pct = v.metaMensal ? Math.min(100, (v.vendasMes / v.metaMensal) * 100) : 0;
  const aberto = me.checkinAberto;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      <header className="glass sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 px-5 py-3">
        <div className="min-w-0">
          <Logo className="h-7" />
          <p className="mt-1 flex items-center gap-2 truncate text-[13px] text-slate-500">
            <Avatar nome={v.nome} fotoUrl={v.fotoUrl} cor={st.color} className="h-6 w-6 text-[11px]" />
            <span className="truncate">Olá, <b className="font-semibold text-slate-800">{v.nome}</b></span>
          </p>
        </div>
        <button onClick={logout} className="rounded-full bg-slate-900/5 px-4 py-1.5 text-sm font-medium text-slate-700">Sair</button>
      </header>

      {msg && <div className="fixed left-1/2 top-16 z-[60] w-[92%] max-w-sm -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-center text-sm text-white shadow-lg">{msg}</div>}

      <main className="flex-1 space-y-4 p-4 pb-24">
        {tab === "inicio" && (
          <>
            {/* Foto da sede — local fixo */}
            <section className="relative h-40 overflow-hidden rounded-3xl bg-slate-900 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/sede.jpg" alt="Sede da empresa" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
              <span className="glass absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold text-slate-800">📍 {LOCAL_PADRAO}</span>
              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>● {st.label}</span>
                <span className="text-xs text-white/80">há {desde(v.statusDesde)}</span>
              </div>
            </section>

            {aberto && (
              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">🤝 Atendimento em andamento</p>
                <p className="mt-1"><b>{aberto.clienteNome}</b> · desde {fmtHora(aberto.entrada)}</p>
                <p className="text-blue-800/80">Com {aberto.colaboradorNome} · {tipoLabel(aberto.tipoContato)}{aberto.telefoneColaborador ? ` · 📞 ${aberto.telefoneColaborador}` : ""}</p>
              </section>
            )}

            <section className="grid grid-cols-2 gap-3">
              <button disabled={busy || !!aberto} onClick={() => setStartOpen(true)} className={tile}>
                <span className={`${tileIcon} bg-blue-100`}>🤝</span>Iniciar Atendimento
              </button>
              <button disabled={busy || !!aberto || v.status === "em_deslocamento"} onClick={() => setStatus("em_deslocamento")} className={tile}>
                <span className={`${tileIcon} bg-violet-100`}>🚗</span>Em Deslocamento
              </button>
              <button disabled={busy || !!aberto} onClick={() => setStatus(v.status === "em_pausa" ? "online" : "em_pausa")} className={tile}>
                <span className={`${tileIcon} bg-amber-100`}>{v.status === "em_pausa" ? "▶️" : "☕"}</span>{v.status === "em_pausa" ? "Retomar" : "Pausa"}
              </button>
              <button
                disabled={busy || (!aberto && v.status === "online")}
                onClick={() => (aberto ? setEndOpen(true) : setStatus("online"))}
                className={`${tile} !bg-slate-900 !text-white`}
              >
                <span className={`${tileIcon} bg-indigo-400`}>✅</span>Finalizar
              </button>
            </section>

            {me.refazerPendentes.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-900">🔁 Contatos a refazer ({me.refazerPendentes.length})</h3>
                <ul className="mt-2 space-y-2">
                  {me.refazerPendentes.map((p) => {
                    const atrasado = !!p.refazerEm && new Date(p.refazerEm).getTime() < Date.now();
                    return (
                      <li key={p.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{p.clienteNome}</p>
                            <p className="text-xs text-slate-500">{p.colaboradorNome} · {tipoLabel(p.tipoContato)}{p.telefoneColaborador ? ` · 📞 ${p.telefoneColaborador}` : ""}</p>
                          </div>
                          {atrasado && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Atrasado</span>}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600">“{p.motivo}”</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-800">Refazer em {p.refazerEm ? fmtDataHora(p.refazerEm) : "—"}</span>
                          <button
                            disabled={busy || !!aberto}
                            onClick={() => refazerContato(p)}
                            className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            Refazer agora
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">🎯 Minha meta do mês</h3>
              <p className="mt-1 text-2xl font-bold">{pct.toFixed(0)}%</p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{brl(v.vendasMes)} de {brl(v.metaMensal)} · faltam {brl(Math.max(0, v.metaMensal - v.vendasMes))}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-base font-bold">{brl(v.vendasHoje)}</p>hoje</div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-base font-bold">{v.vendasHojeQtd}</p>vendas hoje</div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-base font-bold">{v.atendimentosHoje}</p>atendimentos</div>
              </div>
            </section>
          </>
        )}

        {tab === "atend" && (
          <>
            <div>
              <h2 className="text-xl font-semibold">Meus atendimentos</h2>
              <p className="text-xs text-slate-500">Todos os contatos que você fez, com horário, resultado e conversa anexada.</p>
            </div>
            <input
              value={buscaAt}
              onChange={(e) => setBuscaAt(e.target.value)}
              placeholder="Buscar por empresa, colaborador ou telefone…"
              className={inp}
            />
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["todos", "Todos", meus.length],
                  ["efetivo", "✅ Efetivos", meus.filter((a) => a.resultado === "efetivo").length],
                  ["refazer", "🔁 Refazer", meus.filter((a) => a.resultado === "refazer").length],
                  ["andamento", "Em andamento", meus.filter((a) => !a.saida).length],
                ] as const
              ).map(([k, l, n]) => (
                <button
                  key={k}
                  onClick={() => setFiltroAt(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${filtroAt === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm"}`}
                >
                  {l} · {n}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {meus
                .filter((a) => (filtroAt === "todos" ? true : filtroAt === "andamento" ? !a.saida : a.resultado === filtroAt))
                .filter((a) => {
                  const q = buscaAt.trim().toLowerCase();
                  return !q || [a.clienteNome, a.colaboradorNome, a.telefoneColaborador, a.emailColaborador, a.descricao, a.motivo].some((x) => x?.toLowerCase().includes(q));
                })
                .map((a) => (
                  <AtendimentoCard key={a.id} a={a} />
                ))}
              {meus.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Você ainda não fez nenhum atendimento.</p>}
            </div>
          </>
        )}

        {tab === "venda" && (
          <>
            <form onSubmit={registrarVenda} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="font-semibold">💰 Registrar venda</h3>
              <select required className={inp} value={venda.clienteId} onChange={(e) => setVenda({ ...venda, clienteId: e.target.value })}>
                <option value="">Cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <input required className={inp} placeholder="Produto / serviço" value={venda.produto} onChange={(e) => setVenda({ ...venda, produto: e.target.value })} />
              <input required inputMode="decimal" className={inp} placeholder="Valor (R$)" value={venda.valor} onChange={(e) => setVenda({ ...venda, valor: e.target.value })} />
              <button disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-50">Registrar venda</button>
            </form>
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Minhas últimas vendas</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {me.ultimasVendas.map((s) => (
                  <li key={s.id} className="flex justify-between py-2">
                    <span>{s.cliente}<br /><span className="text-xs text-slate-400">{s.produto} · {fmtDataHora(s.data)}</span></span>
                    <b>{brl(Number(s.valor))}</b>
                  </li>
                ))}
                {me.ultimasVendas.length === 0 && <li className="py-2 text-slate-400">Nenhuma venda ainda.</li>}
              </ul>
            </section>
          </>
        )}

        {tab === "chat" && me.admin && <Chat meId={user.uid} withUserId={me.admin.id} title={`Gestor · ${me.admin.nome}`} className="h-[70vh]" />}
        {tab === "chat" && !me.admin && <p className="text-center text-slate-400">Nenhum gestor disponível.</p>}
      </main>

      {/* ---------- Iniciar atendimento ---------- */}
      {startOpen && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/50" onClick={fecharStart}>
          <div className="mx-auto max-h-[92vh] w-full max-w-md space-y-3.5 overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{refazerDe ? "Refazer contato" : "Iniciar atendimento"}</h3>
            <p className="-mt-2 text-xs text-slate-500">📍 Local: {LOCAL_PADRAO} · Início: agora ({fmtHora(new Date())})</p>

            <div>
              <label className={lbl}>Empresa</label>
              <input list="lista-empresas" className={inp} placeholder="Nome da empresa" value={f.empresa} onChange={(e) => onEmpresa(e.target.value)} />
              <datalist id="lista-empresas">
                {clientes.map((c) => <option key={c.id} value={c.nome} />)}
              </datalist>
              {f.empresa.trim() && !matched && <p className="mt-1 text-xs text-indigo-700">Nova empresa — será cadastrada automaticamente.</p>}
            </div>

            <div>
              <label className={lbl}>E-mail da empresa</label>
              <input type="email" inputMode="email" className={inp} placeholder="contato@empresa.com.br" value={f.emailEmpresa} onChange={(e) => setF({ ...f, emailEmpresa: e.target.value })} />
            </div>

            <div className="space-y-2.5 rounded-2xl bg-slate-50 p-3">
              <label className={lbl}>Com quem falou (colaborador)</label>
              {matched && (
                <select className={inp} value={f.colabId} onChange={(e) => onColab(e.target.value)}>
                  <option value="">Selecione…</option>
                  {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  <option value="novo">＋ Cadastrar novo colaborador</option>
                </select>
              )}
              {novoColab && (
                <input className={inp} placeholder="Nome do colaborador" value={f.colabNome} onChange={(e) => setF({ ...f, colabNome: e.target.value })} />
              )}
              {(f.colabId || novoColab) && (
                <>
                  <input type="email" inputMode="email" className={inp} placeholder="E-mail do colaborador" value={f.colabEmail} onChange={(e) => setF({ ...f, colabEmail: e.target.value })} />
                  <input type="tel" inputMode="tel" maxLength={30} className={inp} placeholder="Telefone do colaborador (opcional)" value={f.colabTel} onChange={(e) => setF({ ...f, colabTel: e.target.value })} />
                </>
              )}
            </div>

            <div>
              <label className={lbl}>Tipo de contato</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_CONTATO.map((t, i) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setF({ ...f, tipo: t.v })}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium ${f.tipo === t.v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    <span className="text-xs opacity-60">{i + 1})</span>
                    <span>{t.icon}</span>
                    <span className="leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button disabled={busy} onClick={iniciar} className="w-full rounded-xl bg-slate-900 py-3.5 font-semibold text-white disabled:opacity-50">
              Iniciar atendimento
            </button>
          </div>
        </div>
      )}

      {/* ---------- Finalizar atendimento ---------- */}
      {endOpen && aberto && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/50" onClick={() => setEndOpen(false)}>
          <div className="mx-auto max-h-[92vh] w-full max-w-md space-y-3.5 overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Finalizar atendimento</h3>
            <p className="-mt-2 text-xs text-slate-500">{aberto.clienteNome} · {aberto.colaboradorNome} · {tipoLabel(aberto.tipoContato)} · Início {fmtHora(aberto.entrada)} · Fim {fmtHora(new Date())}</p>

            <div>
              <label className={lbl}>Como foi o atendimento?</label>
              <textarea
                rows={5}
                maxLength={5000}
                className={inp}
                placeholder="Descreva o que foi conversado, próximos passos, objeções, prazos…"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div>
              <label className={lbl}>Histórico da conversa (upload)</label>
              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-600 hover:border-indigo-400">
                <span className="text-2xl">📎</span>
                <span className="font-medium">Toque para anexar arquivos</span>
                <span className="text-xs text-slate-400">Prints, PDF, .txt do WhatsApp, e-mail (.eml)… até 5 arquivos, 4 MB no total (imagens são comprimidas)</span>
                <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {files.map((x, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5">
                      <span className="truncate">{x.name}</span>
                      <button type="button" className="ml-2 text-xs text-red-600" onClick={() => setFiles(files.filter((_, j) => j !== i))}>remover</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className={lbl}>Resultado do contato</label>
              <div className="grid grid-cols-2 gap-2">
                {([["efetivo", "✅", "Efetivo"], ["refazer", "🔁", "Refazer"]] as const).map(([k, i, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setResultado(k);
                      if (k === "refazer" && !refazerEm) setRefazerEm(toLocalInput(amanha9h()));
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${
                      resultado === k
                        ? k === "efetivo"
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <span>{i}</span>
                    {l}
                  </button>
                ))}
              </div>
              {resultado === "refazer" && (
                <div className="mt-3 space-y-2.5 rounded-2xl bg-amber-50 p-3">
                  <div>
                    <label className={lbl}>Por que não foi efetivo?</label>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      className={inp}
                      placeholder="Ex.: decisor ausente, sem retorno, faltou proposta…"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Quando refazer?</label>
                    <input
                      type="datetime-local"
                      className={inp}
                      min={toLocalInput(new Date())}
                      value={refazerEm}
                      onChange={(e) => setRefazerEm(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <button disabled={busy} onClick={concluir} className="w-full rounded-xl bg-slate-900 py-3.5 font-semibold text-white disabled:opacity-50">
              {busy ? "Enviando…" : "Salvar e finalizar"}
            </button>
          </div>
        </div>
      )}

      <nav className="glass fixed bottom-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-slate-200/80 pb-[env(safe-area-inset-bottom)]">
        {([["inicio", "🏠", "Início"], ["atend", "📋", "Atendimentos"], ["venda", "💰", "Vendas"], ["chat", "💬", "Chat"]] as const).map(([k, i, l]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              if (k === "chat") setNaoLidas(0);
            }}
            className={`relative py-3 text-xs ${tab === k ? "font-semibold text-slate-900" : "text-slate-500"}`}
          >
            <span className="block text-xl">{i}</span>
            {l}
            {k === "chat" && naoLidas > 0 && <span className="absolute right-1/4 top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{naoLidas}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
