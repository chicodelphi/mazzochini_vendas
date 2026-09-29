"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
export function refreshSession() {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 500);
    });
  return refreshing;
}

type Init = Omit<RequestInit, "body"> & { json?: unknown };

/** fetch com JSON e renovação automática do access token (refresh token). */
export async function api<T = any>(url: string, init: Init = {}): Promise<T> {
  const doFetch = () =>
    fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  let res = await doFetch();
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    if (await refreshSession()) res = await doFetch();
    else {
      window.location.href = "/login";
      throw new ApiError("Sessão expirada", 401);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Erro na requisição", res.status);
  return data as T;
}

export const brl = (n: number) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtHora = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDataHora = (d: string | Date) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function fmtDuracao(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

export function desde(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  return fmtDuracao(s);
}

export type StatusKey = "offline" | "online" | "em_atendimento" | "em_pausa" | "em_deslocamento";

export const STATUS_META: Record<StatusKey, { label: string; color: string; cls: string }> = {
  offline: { label: "Offline", color: "#94a3b8", cls: "bg-slate-100 text-slate-600" },
  online: { label: "Online", color: "#84c11f", cls: "bg-emerald-100 text-emerald-700" },
  em_atendimento: { label: "Em atendimento", color: "#3b82f6", cls: "bg-blue-100 text-blue-700" },
  em_pausa: { label: "Em pausa", color: "#f59e0b", cls: "bg-amber-100 text-amber-700" },
  em_deslocamento: { label: "Em deslocamento", color: "#8b5cf6", cls: "bg-violet-100 text-violet-700" },
};

export type VendedorLive = {
  id: number;
  userId: number;
  nome: string;
  email: string;
  ativo: boolean;
  /** URL da foto do funcionário (null = sem foto) */
  fotoUrl: string | null;
  telefone: string | null;
  regiaoId: number | null;
  regiao: string | null;
  metaMensal: number;
  status: StatusKey;
  statusDesde: string | null;
  ultimoHeartbeat: string | null;
  vendasMes: number;
  vendasMesQtd: number;
  vendasHoje: number;
  vendasHojeQtd: number;
  atendimentosHoje: number;
  /** O que o vendedor está fazendo agora (atendimento em aberto) */
  atendimentoAtual: {
    id: number;
    clienteNome: string;
    colaboradorNome: string | null;
    tipoContato: string | null;
    entrada: string;
  } | null;
  /** Contatos marcados como "Refazer" ainda não refeitos */
  refazerPendentes: number;
  refazerAtrasados: number;
};

export type Alerta = { id: number; vendedorId: number; tipo: string; mensagem: string; criadoEm: string };

export type SessionUser = { uid: number; role: "super_admin" | "admin" | "vendedor"; nome: string; empresaId: number | null; vendedorId: number | null };

export const REALTIME_EVENTS = [
  "vendedor:online",
  "vendedor:status_changed",
  "vendedor:venda_registrada",
  "vendedor:checkin_cliente",
  "vendedor:checkout_cliente",
  "vendedor:offline",
  "vendedor:heartbeat",
  "alerta:novo",
  "mensagem:nova",
  "dados:limpos",
] as const;

export const ATIVIDADE_LABEL: Record<string, string> = {
  login: "Entrada no sistema",
  logout: "Saída do sistema",
  offline: "Ficou offline (sem heartbeat)",
  status: "Mudou status",
  venda: "Venda",
  checkin: "Check-in",
  checkout: "Check-out",
  
};

/** Envio de formulário multipart (upload) com renovação automática do token. */
export async function apiForm<T = any>(url: string, method: "POST" | "PATCH" | "PUT", form: FormData): Promise<T> {
  const doFetch = () => fetch(url, { method, body: form });
  let res = await doFetch();
  if (res.status === 401) {
    if (await refreshSession()) res = await doFetch();
    else {
      window.location.href = "/login";
      throw new ApiError("Sessão expirada", 401);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.detalhes?.[0] ?? data.error ?? "Erro na requisição", res.status);
  return data as T;
}
