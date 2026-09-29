import { count } from "drizzle-orm";
import { db } from "@/db";
import {
  atividades,
  checkins,
  clientes,
  colaboradores,
  empresas,
  regioes,
  users,
  vendas,
  vendedores,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { TIPO_VALUES } from "@/lib/contato";

let running: Promise<void> | null = null;

/**
 * Primeira execução (banco vazio):
 *  - Produção: se ADMIN_EMAIL e ADMIN_PASSWORD estiverem definidos, cria só a empresa e o gestor
 *    (SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD opcionais criam o super admin).
 *  - Caso contrário: cria os dados de demonstração (admin@admin.com / admin …).
 */
export function ensureSeed() {
  running ??= seed().catch((e) => {
    running = null;
    // outra instância serverless pode ter criado os dados ao mesmo tempo (e-mail único)
    if (String(e?.cause?.code ?? e?.code) === "23505") return;
    throw e;
  });
  return running;
}

async function seed() {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return;

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminSenha = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminSenha) {
    const [emp] = await db
      .insert(empresas)
      .values({ nome: process.env.EMPRESA_NOME || "Mazzochini Materiais Laboratoriais" })
      .returning();
    await db.insert(users).values({
      empresaId: emp.id,
      nome: process.env.ADMIN_NOME || "Gestor",
      email: adminEmail,
      senhaHash: await hashPassword(adminSenha),
      role: "admin",
    });
    const superEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    const superSenha = process.env.SUPER_ADMIN_PASSWORD;
    if (superEmail && superSenha && superEmail !== adminEmail)
      await db.insert(users).values({
        nome: "Super Admin",
        email: superEmail,
        senhaHash: await hashPassword(superSenha),
        role: "super_admin",
      });
    return;
  }

  const [emp] = await db.insert(empresas).values({ nome: "Mazzochini Materiais Laboratoriais" }).returning();
  const [adminH, funcH] = await Promise.all([hashPassword("admin"), hashPassword("funcionario")]);
  await db.insert(users).values({ nome: "Super Admin", email: "super@demo.com", senhaHash: funcH, role: "super_admin" });
  await db.insert(users).values({ empresaId: emp.id, nome: "Gestor", email: "admin@admin.com", senhaHash: adminH, role: "admin" });

  const regs = await db
    .insert(regioes)
    .values([
      { empresaId: emp.id, nome: "Sul" },
      { empresaId: emp.id, nome: "Sudeste" },
      { empresaId: emp.id, nome: "Centro-Oeste" },
    ])
    .returning();

  const cli = await db
    .insert(clientes)
    .values([
      { empresaId: emp.id, nome: "Laboratório Vida Análises", email: "compras@vidaanalises.com.br", endereco: "Curitiba - PR" },
      { empresaId: emp.id, nome: "Clínica Saúde+", email: "contato@saudemais.com.br", endereco: "Porto Alegre - RS" },
      { empresaId: emp.id, nome: "Universidade Federal do Sul", email: "labquimica@ufsul.edu.br", endereco: "Florianópolis - SC" },
      { empresaId: emp.id, nome: "Indústria Química Delta", email: "suprimentos@quimicadelta.com.br", endereco: "Campinas - SP" },
      { empresaId: emp.id, nome: "Hospital São Lucas", email: "almoxarifado@saolucas.org.br", endereco: "São Paulo - SP" },
      { empresaId: emp.id, nome: "AgroTech Pesquisa", email: "pesquisa@agrotech.com.br", endereco: "Goiânia - GO" },
    ])
    .returning();

  const nomesColab = [
    ["Fernanda Ribeiro", "Marcos Tavares"],
    ["Dra. Helena Prado", "Ricardo Lopes"],
    ["Prof. André Martins", "Camila Nogueira"],
    ["Paulo Henrique", "Larissa Duarte"],
    ["Juliana Freitas", "Roberto Campos"],
    ["Dr. Eduardo Faria", "Patrícia Moura"],
  ];
  const slug = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
  const colabRows = cli.flatMap((c, i) =>
    nomesColab[i].map((nome) => ({
      empresaId: emp.id,
      clienteId: c.id,
      nome,
      email: `${slug(nome)}@${(c.email ?? "cliente.com").split("@")[1]}`,
      telefone: `(41) 9${1000 + ((i * 37 + nome.length * 101) % 9000)}-${1000 + ((i * 731 + nome.length * 53) % 9000)}`,
    })),
  );
  const colabs = await db.insert(colaboradores).values(colabRows).returning();

  const nomes = ["Carlos Mendes", "Beatriz Lima", "Rafael Souza", "Juliana Costa", "Pedro Alves"];
  const produtos = ["Vidrarias (kit)", "Reagentes P.A.", "Micropipetas", "Balança analítica", "Estufa de secagem", "EPIs de laboratório"];
  const relatos = [
    "Apresentei o catálogo atualizado e o cliente pediu cotação de reagentes para o próximo trimestre.",
    "Cliente questionou o prazo de entrega; combinamos retorno com prazo confirmado até sexta.",
    "Negociação de desconto para compra em volume. Aguardando aprovação da diretoria do cliente.",
    "Follow-up do pedido anterior: entrega confirmada, cliente satisfeito e interessado em micropipetas.",
    "Demonstração de novos equipamentos. Enviarei proposta comercial por e-mail ainda hoje.",
  ];
  const motivos = [
    "Decisor ausente — pediu para ligar na próxima semana",
    "Cliente aguardando aprovação da diretoria para fechar o pedido",
    "Sem retorno: caiu na caixa postal e não respondeu ao e-mail",
    "Faltou enviar a proposta/orçamento antes do contato",
    "Conversa interrompida por problema de conexão",
  ];
  let seedN = 7;
  const rnd = () => {
    seedN = (seedN * 16807) % 2147483647;
    return seedN / 2147483647;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  for (let i = 0; i < nomes.length; i++) {
    const [u] = await db
      .insert(users)
      .values({
        empresaId: emp.id,
        nome: nomes[i],
        email: i === 0 ? "funcionario@funcionario.com" : `vendedor${i + 1}@demo.com`,
        senhaHash: funcH,
        role: "vendedor",
      })
      .returning();
    const [v] = await db
      .insert(vendedores)
      .values({
        userId: u.id,
        empresaId: emp.id,
        regiaoId: regs[i % regs.length].id,
        telefone: `(41) 9${Math.floor(1000 + rnd() * 8999)}-${Math.floor(1000 + rnd() * 8999)}`,
        metaMensal: String(15000 + i * 2500),
      })
      .returning();

    const vendasRows: (typeof vendas.$inferInsert)[] = [];
    const ativRows: (typeof atividades.$inferInsert)[] = [];
    const chkRows: (typeof checkins.$inferInsert)[] = [];
    for (let d = 0; d < 30; d++) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      day.setHours(0, 0, 0, 0);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const at = (h: number, m = 0) => new Date(day.getTime() + (h * 60 + m) * 60_000);

      const nv = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < nv; k++) {
        const c = pick(cli);
        vendasRows.push({
          vendedorId: v.id,
          clienteId: c.id,
          cliente: c.nome,
          produto: pick(produtos),
          valor: (80 + rnd() * 520).toFixed(2),
          data: at(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60)),
        });
      }
      if (d < 14) {
        const seq: [string, string, number, number][] = [
          ["login", "online", 8, 0],
          ["status", "em_deslocamento", 8, 30],
          ["status", "em_atendimento", 9, 15],
          ["status", "online", 10, 0],
          ["status", "em_atendimento", 11, 20],
          ["status", "em_pausa", 12, 15],
          ["status", "online", 13, 15 + Math.floor(rnd() * 30)],
          ["status", "em_atendimento", 14, 40],
          ["status", "online", 16, 30],
          ["logout", "offline", 17, 30],
        ];
        for (const [tipo, st, h, m] of seq)
          ativRows.push({ vendedorId: v.id, tipo, descricao: st, timestamp: at(h, m) });

        for (const [h, m, dur] of [[9, 15, 45], [11, 20, 55], [14, 40, 50]] as const) {
          const c = pick(cli);
          const cb = pick(colabs.filter((x) => x.clienteId === c.id));
          const refaz = rnd() < 0.22;
          chkRows.push({
            vendedorId: v.id,
            clienteId: c.id,
            clienteNome: c.nome,
            emailEmpresa: c.email,
            colaboradorId: cb.id,
            colaboradorNome: cb.nome,
            emailColaborador: cb.email,
            telefoneColaborador: cb.telefone,
            tipoContato: pick([...TIPO_VALUES]),
            descricao: pick(relatos),
            ...(refaz
              ? { resultado: "refazer", motivo: pick(motivos), refazerEm: at(h + 48, m), refeito: d >= 2 }
              : { resultado: "efetivo" }),
            entrada: at(h, m),
            saida: at(h, m + dur),
          });
        }
      }
    }
    await db.insert(vendas).values(vendasRows);
    await db.insert(atividades).values(ativRows);
    await db.insert(checkins).values(chkRows);
  }
}
