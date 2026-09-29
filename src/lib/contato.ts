// Tipos de contato e resultado do atendimento (compartilhado entre servidor e cliente)
export const TIPO_VALUES = ["email", "carta", "presencial", "ligacao", "whatsapp", "whatsapp_ligacao"] as const;
export type TipoContato = (typeof TIPO_VALUES)[number];

export const TIPOS_CONTATO: { v: TipoContato; label: string; icon: string }[] = [
  { v: "email", label: "E-mail", icon: "✉️" },
  { v: "carta", label: "Carta", icon: "📮" },
  { v: "presencial", label: "Presencial", icon: "🤝" },
  { v: "ligacao", label: "Ligação", icon: "📞" },
  { v: "whatsapp", label: "WhatsApp", icon: "💬" },
  { v: "whatsapp_ligacao", label: "WhatsApp/ligação", icon: "📲" },
];

export const tipoLabel = (v?: string | null) => TIPOS_CONTATO.find((t) => t.v === v)?.label ?? "—";
export const tipoIcon = (v?: string | null) => TIPOS_CONTATO.find((t) => t.v === v)?.icon ?? "•";

/** Resultado do contato: Efetivo ou Refazer (com motivo e data para refazer) */
export const RESULTADO_VALUES = ["efetivo", "refazer"] as const;
export type Resultado = (typeof RESULTADO_VALUES)[number];
export const resultadoLabel = (v?: string | null) => (v === "efetivo" ? "Efetivo" : v === "refazer" ? "Refazer" : "—");

export type Anexo = { id: number; checkinId: number; nome: string; mime: string; tamanho: number };

export type Atendimento = {
  id: number;
  vendedorId: number;
  vendedorNome?: string;
  clienteId: number | null;
  clienteNome: string;
  emailEmpresa: string | null;
  colaboradorId: number | null;
  colaboradorNome: string | null;
  emailColaborador: string | null;
  telefoneColaborador: string | null;
  tipoContato: string | null;
  descricao: string | null;
  resultado: string | null;
  motivo: string | null;
  refazerEm: string | null;
  refeito: boolean;
  refazerDeId: number | null;
  entrada: string;
  saida: string | null;
  anexos: Anexo[];
};

export const LOCAL_PADRAO = "Sede da empresa";
