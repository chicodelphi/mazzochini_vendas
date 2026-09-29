"use client";
import { desde, fmtHora, type VendedorLive } from "@/lib/client";
import { tipoLabel } from "@/lib/contato";

type V = Pick<VendedorLive, "status" | "statusDesde" | "ultimoHeartbeat" | "atendimentoAtual">;

/** Linha de texto: o que o vendedor está fazendo agora (visível ao gestor). */
export default function AtividadeAtual({ v, className = "" }: { v: V; className?: string }) {
  const a = v.atendimentoAtual;
  let node: React.ReactNode;
  if (v.status === "offline") {
    node = (
      <>
        ⚫ Offline · visto às {fmtHora(v.ultimoHeartbeat)}
        {a && (
          <>
            {" "}· <b>atendimento em aberto:</b> {a.clienteNome}
          </>
        )}
      </>
    );
  } else if (a) {
    node = (
      <>
        🤝 Atendendo <b>{a.clienteNome}</b>
        {a.colaboradorNome ? <> com {a.colaboradorNome}</> : null} · {tipoLabel(a.tipoContato)} · início às {fmtHora(a.entrada)} · há{" "}
        {desde(a.entrada)}
      </>
    );
  } else if (v.status === "em_pausa") {
    node = <>☕ Em pausa há {desde(v.statusDesde)}</>;
  } else if (v.status === "em_deslocamento") {
    node = <>🚗 Em deslocamento há {desde(v.statusDesde)}</>;
  } else {
    node = <>🟢 Disponível, sem atividade há {desde(v.statusDesde)}</>;
  }
  return <p className={className}>{node}</p>;
}
