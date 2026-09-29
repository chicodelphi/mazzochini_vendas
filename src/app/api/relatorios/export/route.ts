import ExcelJS from "exceljs";
import { requireEmpresa, route } from "@/lib/http";
import { gerarRelatorio, parsePeriodo } from "@/lib/relatorio";

export const runtime = "nodejs";

/** Exportação Excel (.xlsx). O PDF é gerado no cliente (jsPDF) a partir do mesmo relatório. */
export const GET = route({ roles: ["admin"], limit: 20 }, async (req, { session }) => {
  const q = req.nextUrl.searchParams;
  const { ini, fim } = parsePeriodo(q.get("de"), q.get("ate"));
  const vid = q.get("vendedorId");
  const r = await gerarRelatorio(requireEmpresa(session), ini, fim, vid ? Number(vid) : undefined);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Desempenho");
  ws.columns = [
    { header: "Vendedor", key: "nome", width: 26 },
    { header: "Região", key: "regiao", width: 22 },
    { header: "Vendas (R$)", key: "vendas", width: 16 },
    { header: "Qtd. vendas", key: "qtdVendas", width: 12 },
    { header: "Ticket médio (R$)", key: "ticketMedio", width: 18 },
    { header: "Atendimentos", key: "atendimentos", width: 14 },
    { header: "Efetivos", key: "efetivos", width: 10 },
    { header: "Refazer", key: "refazer", width: 10 },
    { header: "Meta período (R$)", key: "meta", width: 18 },
    { header: "Atingimento (%)", key: "atingimento", width: 16 },
    { header: "Horas produtivas", key: "horasProdutivas", width: 16 },
    { header: "Horas ociosas", key: "horasOciosas", width: 14 },
    { header: "Horas em pausa", key: "horasPausa", width: 15 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  for (const l of r.linhas)
    ws.addRow({ ...l, regiao: l.regiao ?? "-", ticketMedio: +l.ticketMedio.toFixed(2), atingimento: +l.atingimento.toFixed(1) });

  const wd = wb.addWorksheet("Vendas por dia");
  wd.columns = [
    { header: "Dia", key: "dia", width: 14 },
    { header: "Total (R$)", key: "total", width: 16 },
    { header: "Qtd", key: "qtd", width: 8 },
  ];
  wd.getRow(1).font = { bold: true };
  r.porDia.forEach((d) => wd.addRow(d));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-vendas.xlsx"`,
    },
  });
});
