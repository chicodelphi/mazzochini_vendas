"use client";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "@/lib/client";

type Handler = (event: string, data: any) => void;

// Tempo real por short-polling em /api/realtime/poll (compatível com Vercel/serverless).
// Um único laço de polling é compartilhado por todos os componentes da página.
const POLL_MS = 3_000; // aba visível
const POLL_OCULTA_MS = 15_000; // aba em segundo plano

const listeners = new Set<Handler>();
const statusListeners = new Set<(c: boolean) => void>();
let connected = false;
let running = false;
let cursor: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let falhas = 0;

function setConnected(c: boolean) {
  if (connected === c) return;
  connected = c;
  statusListeners.forEach((f) => f(c));
}

async function pollOnce() {
  const url = cursor === null ? "/api/realtime/poll" : `/api/realtime/poll?after=${cursor}`;
  let res = await fetch(url, { cache: "no-store" });
  if (res.status === 401 && (await refreshSession())) res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`poll ${res.status}`);
  const data = (await res.json()) as { cursor: number; eventos: { id: number; evento: string; dados: unknown }[] };
  const primeira = cursor === null;
  cursor = data.cursor;
  setConnected(true);
  if (primeira) listeners.forEach((h) => h("connected", {}));
  for (const e of data.eventos ?? []) listeners.forEach((h) => h(e.evento, e.dados));
}

let emAndamento = false;

async function rodada() {
  if (emAndamento) return;
  emAndamento = true;
  try {
    await pollOnce();
    falhas = 0;
  } catch {
    falhas = Math.min(falhas + 1, 4);
    setConnected(false);
  } finally {
    emAndamento = false;
  }
}

function agendar(espera?: number) {
  if (!running) return;
  clearTimeout(timer);
  const base = typeof document !== "undefined" && document.hidden ? POLL_OCULTA_MS : POLL_MS;
  const t = espera ?? (falhas ? Math.min(30_000, base * 2 ** falhas) : base);
  timer = setTimeout(async () => {
    await rodada();
    agendar();
  }, t);
}

// ao voltar para a aba, busca imediatamente
function onVisible() {
  if (running && !document.hidden) agendar(50);
}

function start() {
  if (running || listeners.size === 0) return;
  running = true;
  cursor = null;
  document.addEventListener("visibilitychange", onVisible);
  agendar(0);
}

function stop() {
  running = false;
  clearTimeout(timer);
  document.removeEventListener("visibilitychange", onVisible);
  setConnected(false);
}

export function useRealtime(handler: Handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const [online, setOnline] = useState(connected);

  useEffect(() => {
    const h: Handler = (e, d) => ref.current(e, d);
    listeners.add(h);
    statusListeners.add(setOnline);
    start();
    return () => {
      listeners.delete(h);
      statusListeners.delete(setOnline);
      if (listeners.size === 0) stop();
    };
  }, []);

  return online;
}
