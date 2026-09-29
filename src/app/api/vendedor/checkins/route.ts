import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { anexos, atividades, checkins, clientes, colaboradores } from "@/db/schema";
import { checkinAberto, fecharCheckin } from "@/lib/checkin";
import { RESULTADO_VALUES, TIPO_VALUES, tipoLabel } from "@/lib/contato";
import { HttpError, route } from "@/lib/http";
import { publish } from "@/lib/realtime";
import { getVendedorFull, mudarStatus } from "@/lib/service";

const schema = z.object({
  clienteId: z.number().int().optional().nullable(),
  clienteNome: z.string().trim().min(2).max(150).optional(),
  emailEmpresa: z.string().trim().email("E-mail da empresa inválido").max(200),
  colaboradorId: z.number().int().optional().nullable(),
  colaboradorNome: z.string().trim().min(2).max(150).optional(),
  emailColaborador: z.string().trim().email("E-mail do colaborador inválido").max(200),
  /** Telefone da pessoa contatada (opcional): dígitos, espaços, +, -, ( ) */
  telefoneColaborador: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-.\s]*$/, "Telefone inválido (use apenas números, +, -, parênteses)")
    .refine((v) => v === "" || v.replace(/\D/g, "").length >= 8, "Telefone inválido (mínimo 8 dígitos)")
    .optional()
    .nullable(),
  tipoContato: z.enum(TIPO_VALUES),
  /** Quando este atendimento refaz um contato anteriormente marcado como "Refazer" */
  refazerDeId: z.number().int().optional().nullable(),
});

/**
 * Inicia um atendimento (hora de início = agora; local sempre "Sede da empresa") → status "Em atendimento".
 * Cadastra a empresa e/ou o colaborador automaticamente se forem novos.
 * Evento `vendedor:checkin_cliente`.
 */
export const POST = route({ roles: ["vendedor"] }, async (req, { session }) => {
  if (!session.vendedorId || !session.empresaId) throw new HttpError(403, "Vendedor inválido");
  const empresaId = session.empresaId;
  const b = schema.parse(await req.json());
  if (await checkinAberto(session.vendedorId)) throw new HttpError(409, "Já existe um atendimento em aberto");

  // --- contato a refazer (origem)
  let original: typeof checkins.$inferSelect | undefined;
  if (b.refazerDeId) {
    [original] = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.id, b.refazerDeId),
          eq(checkins.vendedorId, session.vendedorId),
          eq(checkins.resultado, "refazer"),
          eq(checkins.refeito, false),
        ),
      )
      .limit(1);
    if (!original) throw new HttpError(404, "Contato a refazer não encontrado (ou já refeito)");
  }

  // --- empresa cliente
  let cliente: typeof clientes.$inferSelect | undefined;
  if (b.clienteId) {
    [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, b.clienteId), eq(clientes.empresaId, empresaId)))
      .limit(1);
    if (!cliente) throw new HttpError(404, "Cliente não encontrado");
  } else {
    if (!b.clienteNome) throw new HttpError(400, "Informe o nome da empresa");
    [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.empresaId, empresaId), sql`lower(${clientes.nome}) = ${b.clienteNome.toLowerCase()}`))
      .limit(1);
    if (!cliente)
      [cliente] = await db.insert(clientes).values({ empresaId, nome: b.clienteNome, email: b.emailEmpresa }).returning();
  }
  if (cliente.email !== b.emailEmpresa)
    await db.update(clientes).set({ email: b.emailEmpresa }).where(eq(clientes.id, cliente.id));

  const telefone = b.telefoneColaborador?.trim() || null;

  // --- colaborador (contato)
  let colab: typeof colaboradores.$inferSelect | undefined;
  if (b.colaboradorId) {
    [colab] = await db
      .select()
      .from(colaboradores)
      .where(
        and(
          eq(colaboradores.id, b.colaboradorId),
          eq(colaboradores.empresaId, empresaId),
          eq(colaboradores.clienteId, cliente.id),
        ),
      )
      .limit(1);
    if (!colab) throw new HttpError(404, "Colaborador não encontrado");
    if (colab.email !== b.emailColaborador || (telefone && colab.telefone !== telefone))
      await db
        .update(colaboradores)
        .set({ email: b.emailColaborador, ...(telefone ? { telefone } : {}) })
        .where(eq(colaboradores.id, colab.id));
    colab = { ...colab, email: b.emailColaborador, telefone: telefone ?? colab.telefone };
  } else {
    if (!b.colaboradorNome) throw new HttpError(400, "Informe o colaborador com quem falou");
    [colab] = await db
      .select()
      .from(colaboradores)
      .where(
        and(
          eq(colaboradores.clienteId, cliente.id),
          sql`lower(${colaboradores.nome}) = ${b.colaboradorNome.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (!colab)
      [colab] = await db
        .insert(colaboradores)
        .values({ empresaId, clienteId: cliente.id, nome: b.colaboradorNome, email: b.emailColaborador, telefone })
        .returning();
  }

  const v = await getVendedorFull(session.vendedorId);
  const [c] = await db
    .insert(checkins)
    .values({
      vendedorId: v.id,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      emailEmpresa: b.emailEmpresa,
      colaboradorId: colab.id,
      colaboradorNome: colab.nome,
      emailColaborador: b.emailColaborador,
      telefoneColaborador: telefone ?? colab.telefone ?? null,
      tipoContato: b.tipoContato,
      refazerDeId: original?.id ?? null,
    })
    .returning();
  if (original) await db.update(checkins).set({ refeito: true }).where(eq(checkins.id, original.id));
  await db.insert(atividades).values({
    vendedorId: v.id,
    tipo: "checkin",
    descricao: `${original ? "Refazendo contato: " : "Início de atendimento: "}${tipoLabel(b.tipoContato)} com ${colab.nome} – ${cliente.nome}`,
  });
  if (v.statusAtual !== "em_atendimento") await mudarStatus(v.id, "em_atendimento", "status");
  publish(empresaId, "vendedor:checkin_cliente", {
    vendedorId: v.id,
    nome: v.nome,
    cliente: cliente.nome,
    tipo: b.tipoContato,
    checkin: c,
  });
  return { checkin: c };
});

// A Vercel limita o corpo de cada requisição a 4,5 MB → no máx. 4 MB somando todos os arquivos.
// (imagens são comprimidas no navegador antes do envio – ver src/lib/imagem.ts)
const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_FILES = 5;
const EXT_OK = new Set([
  "txt", "pdf", "png", "jpg", "jpeg", "webp", "zip", "doc", "docx", "xls", "xlsx", "csv", "eml", "msg", "html", "json",
]);

/**
 * Finaliza o atendimento (multipart/form-data):
 *  - `descricao`: como foi o atendimento
 *  - `resultado`: "efetivo" | "refazer"
 *  - `motivo` + `refazerEm` (ISO): obrigatórios quando resultado = "refazer"
 *  - `arquivos`: histórico da conversa (1 a 5 arquivos, até 4 MB no total)
 * A hora de fim é registrada automaticamente.
 */
export const PATCH = route({ roles: ["vendedor"], limit: 30 }, async (req, { session }) => {
  if (!session.vendedorId || !session.empresaId) throw new HttpError(403, "Vendedor inválido");
  const form = await req.formData();

  const descricao = String(form.get("descricao") ?? "").trim();
  if (descricao.length < 5) throw new HttpError(400, "Descreva como foi o atendimento (mínimo 5 caracteres)");
  if (descricao.length > 5000) throw new HttpError(400, "Descrição muito longa (máx. 5000 caracteres)");

  const resultado = String(form.get("resultado") ?? "");
  if (!(RESULTADO_VALUES as readonly string[]).includes(resultado))
    throw new HttpError(400, "Informe se o contato foi Efetivo ou Refazer");

  let motivo: string | null = null;
  let refazerEm: Date | null = null;
  if (resultado === "refazer") {
    motivo = String(form.get("motivo") ?? "").trim();
    if (motivo.length < 5) throw new HttpError(400, "Explique por que o contato não foi efetivo (mínimo 5 caracteres)");
    if (motivo.length > 2000) throw new HttpError(400, "Motivo muito longo (máx. 2000 caracteres)");
    const raw = String(form.get("refazerEm") ?? "");
    const d = new Date(raw);
    if (!raw || Number.isNaN(d.getTime())) throw new HttpError(400, "Informe quando o contato deve ser refeito");
    if (d.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, "A data para refazer não pode estar no passado");
    if (d.getTime() > Date.now() + 365 * 86_400_000) throw new HttpError(400, "A data para refazer deve ser em até 1 ano");
    refazerEm = d;
  }

  const files = form.getAll("arquivos").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (files.length === 0) throw new HttpError(400, "Anexe o histórico da conversa");
  if (files.length > MAX_FILES) throw new HttpError(400, `Envie no máximo ${MAX_FILES} arquivos`);
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXT_OK.has(ext)) throw new HttpError(400, `Tipo de arquivo não permitido: ${f.name}`);
  }
  const total = files.reduce((acc, f) => acc + f.size, 0);
  if (total > MAX_TOTAL) throw new HttpError(413, "Os arquivos somam mais de 4 MB. Envie menos arquivos ou arquivos menores.");

  const aberto = await checkinAberto(session.vendedorId);
  if (!aberto) throw new HttpError(404, "Nenhum atendimento em aberto");

  for (const f of files) {
    await db.insert(anexos).values({
      empresaId: session.empresaId,
      checkinId: aberto.id,
      vendedorId: session.vendedorId,
      nome: f.name.replace(/[^\p{L}\p{N}._\-() ]/gu, "_").slice(0, 120),
      mime: f.type || "application/octet-stream",
      tamanho: f.size,
      dados: Buffer.from(await f.arrayBuffer()),
    });
  }
  const c = await fecharCheckin(session.vendedorId, {
    descricao,
    resultado: resultado as "efetivo" | "refazer",
    motivo,
    refazerEm,
  });
  await mudarStatus(session.vendedorId, "online", "status");
  return { checkin: c };
});
