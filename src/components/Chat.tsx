"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtHora } from "@/lib/client";
import { useRealtime } from "@/lib/useRealtime";

type Msg = { id: number; remetenteId: number; destinatarioId: number; conteudo: string; criadoEm: string };

export default function Chat({ meId, withUserId, title, className = "" }: { meId: number; withUserId: number; title: string; className?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<{ mensagens: Msg[] }>(`/api/mensagens?com=${withUserId}`);
    setMsgs(r.mensagens);
  }, [withUserId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useRealtime((ev, d) => {
    if (ev !== "mensagem:nova") return;
    const m: Msg = d.mensagem;
    const mine = m.remetenteId === withUserId && m.destinatarioId === meId;
    const echo = m.remetenteId === meId && m.destinatarioId === withUserId;
    if (!mine && !echo) return;
    setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
    if (mine) api(`/api/mensagens?com=${withUserId}`).catch(() => {});
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = text.trim();
    if (!conteudo) return;
    setSending(true);
    try {
      const r = await api<{ mensagem: Msg }>("/api/mensagens", { method: "POST", json: { destinatarioId: withUserId, conteudo } });
      setMsgs((cur) => (cur.some((x) => x.id === r.mensagem.id) ? cur : [...cur, r.mensagem]));
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">💬 {title}</div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
        {msgs.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nenhuma mensagem ainda.</p>}
        {msgs.map((m) => {
          const mine = m.remetenteId === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-indigo-600 text-white" : "bg-white text-slate-800 shadow-sm"}`}>
                <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-indigo-200" : "text-slate-400"}`}>{fmtHora(m.criadoEm)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Digite uma mensagem..."
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <button disabled={sending || !text.trim()} className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-50">
          Enviar
        </button>
      </form>
    </div>
  );
}
