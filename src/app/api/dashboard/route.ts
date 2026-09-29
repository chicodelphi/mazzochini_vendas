import { route, requireEmpresa } from "@/lib/http";
import { alertasAbertos, listarVendedores } from "@/lib/queries";

export const GET = route({ roles: ["admin"] }, async (_req, { session }) => {
  const empresaId = requireEmpresa(session);
  const [vendedores, alertas] = await Promise.all([listarVendedores(empresaId), alertasAbertos(empresaId)]);
  const porStatus: Record<string, number> = {
    offline: 0,
    online: 0,
    em_atendimento: 0,
    em_pausa: 0,
    em_deslocamento: 0,
  };
  for (const v of vendedores) if (v.ativo) porStatus[v.status] = (porStatus[v.status] ?? 0) + 1;
  const ativos = vendedores.filter((v) => v.ativo);
  return {
    vendedores,
    alertas,
    kpis: {
      totalVendedores: ativos.length,
      ativosAgora: ativos.length - porStatus.offline,
      porStatus,
      vendasHoje: ativos.reduce((s, v) => s + v.vendasHoje, 0),
      vendasHojeQtd: ativos.reduce((s, v) => s + v.vendasHojeQtd, 0),
      vendasMes: ativos.reduce((s, v) => s + v.vendasMes, 0),
      metaMes: ativos.reduce((s, v) => s + v.metaMensal, 0),
      atendimentosHoje: ativos.reduce((s, v) => s + v.atendimentosHoje, 0),
    },
  };
});
