import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { actor, HttpError, run } from "../operations/helpers.js";
const status: Record<string, string> = {
  OPEN: "Aberta",
  ANALYSIS: "Em análise",
  SCHEDULED: "Programada",
  IN_PROGRESS: "Em execução",
  WAITING_PART: "Aguardando peça",
  WAITING_VENDOR: "Aguardando terceiro",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};
export async function preventiveReport(db: PrismaClient, q: any) {
  const f = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        equipmentId: z.string().optional(),
        sectorId: z.string().optional(),
        overdue: z.enum(["true", "false"]).optional(),
      })
      .parse(q),
    now = new Date(),
    due = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      ...(f.to ? { lte: new Date(f.to) } : {}),
      ...(f.overdue === "true" ? { lt: now } : {}),
    };
  if (f.from && f.to && new Date(f.from) > new Date(f.to))
    throw new HttpError(400, "Período invertido");
  const equipment = {
    ...(f.equipmentId ? { id: f.equipmentId } : {}),
    ...(f.sectorId ? { sectorId: f.sectorId } : {}),
  };
  const [plans, orders] = await Promise.all([
    db.maintenancePlan.findMany({
      where: {
        active: true,
        equipment,
        ...(Object.keys(due).length ? { nextExecution: due } : {}),
      },
      include: { equipment: { include: { sector: true } }, technician: true },
      orderBy: { nextExecution: "asc" },
      take: 1001,
    }),
    db.maintenanceOrder.findMany({
      where: {
        equipment,
        type: { in: ["PREVENTIVE", "LUBRICATION"] },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        ...(Object.keys(due).length ? { scheduledAt: due } : {}),
      },
      include: { equipment: { include: { sector: true } }, technician: true },
      orderBy: { scheduledAt: { sort: "asc", nulls: "last" } },
      take: 1001,
    }),
  ]);
  if (plans.length + orders.length > 1000)
    throw new HttpError(400, "Restrinja o relatório a até 1.000 itens");
  const items = [
    ...plans.map((p) => ({
      id: p.id,
      kind: "Plano",
      equipment: p.equipmentId,
      sector: p.equipment.sector.name,
      type: p.type === "LUBRICATION" ? "Lubrificação" : "Preventiva",
      description: p.title,
      technician: p.technician.name,
      status: p.nextExecution < now ? "Vencido" : "Previsto",
      dueAt: p.nextExecution.toISOString(),
      overdue: p.nextExecution < now,
    })),
    ...orders.map((o) => ({
      id: o.sapReference || o.id,
      kind: "OS local",
      equipment: o.equipmentId,
      sector: o.equipment.sector.name,
      type: o.type === "LUBRICATION" ? "Lubrificação" : "Preventiva",
      description: o.description,
      technician: o.technician?.name || "Não atribuído",
      status: status[o.status] || o.status,
      dueAt: o.scheduledAt?.toISOString() || null,
      overdue: !!o.scheduledAt && o.scheduledAt < now,
    })),
  ].sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999"));
  return {
    generatedAt: now.toISOString(),
    period: { from: f.from || null, to: f.to || null },
    items,
    summary: {
      plans: plans.length,
      openOrders: orders.length,
      overdue: items.filter((i) => i.overdue).length,
      withoutSchedule: items.filter((i) => !i.dueAt).length,
    },
    executive: `Foram encontrados ${plans.length} planos ativos e ${orders.length} ordens preventivas/lubrificação abertas. ${items.filter((i) => i.overdue).length} itens estão vencidos e ${items.filter((i) => !i.dueAt).length} não têm programação informada. Revise responsáveis e datas antes de reprogramar. Nenhuma economia financeira foi estimada.`,
  };
}
const displayDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Sem programação";
export function intelligenceRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/reports/preventives",
    run(async (req, res) => res.json(await preventiveReport(db, req.query))),
  );
  r.get(
    "/reports/preventives.xlsx",
    run(async (req, res) => {
      const report = await preventiveReport(db, req.query),
        wb = new ExcelJS.Workbook(),
        sheet = wb.addWorksheet("Preventivas em aberto");
      sheet.addRow(["Relatório PCM — registros locais/importados"]);
      sheet.addRow(["Gerado em", displayDate(report.generatedAt)]);
      sheet.addRow(["Resumo", report.executive]);
      sheet.addRow([]);
      sheet.addRow([
        "Identificador",
        "Categoria",
        "Equipamento",
        "Setor",
        "Tipo",
        "Descrição",
        "Responsável",
        "Status",
        "Vencimento",
      ]);
      report.items.forEach((i) =>
        sheet.addRow([
          i.id,
          i.kind,
          i.equipment,
          i.sector,
          i.type,
          i.description,
          i.technician,
          i.status,
          displayDate(i.dueAt),
        ]),
      );
      sheet.getRow(5).font = { bold: true };
      sheet.autoFilter = "A5:I5";
      sheet.views = [{ state: "frozen", ySplit: 5 }];
      sheet.columns.forEach((c, i) => (c.width = i === 5 ? 55 : 24));
      res
        .set({
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="preventivas-em-aberto.xlsx"',
        })
        .send(Buffer.from(await wb.xlsx.writeBuffer()));
    }),
  );
  r.get(
    "/reports/preventives.pdf",
    run(async (req, res) => {
      const report = await preventiveReport(db, req.query),
        pdf = new PDFDocument({ size: "A4", margin: 40 }),
        chunks: Buffer[] = [];
      const output = new Promise<Buffer>((resolve, reject) => {
        pdf.on("data", (chunk) => chunks.push(chunk));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
      });
      pdf.fontSize(19).text("PCM Intelligence — Preventivas");
      pdf
        .fontSize(9)
        .text(
          "Registros locais e cópias importadas. Não é um documento oficial SAP.",
        );
      pdf.moveDown().text("Gerado em: " + displayDate(report.generatedAt));
      pdf.text(
        "Vencimentos: " +
          (report.period.from
            ? displayDate(report.period.from)
            : "Sem limite inicial") +
          " até " +
          (report.period.to
            ? displayDate(report.period.to)
            : "Sem limite final"),
      );
      pdf.moveDown().text(report.executive);
      for (const item of report.items) {
        if (pdf.y > 690) pdf.addPage();
        pdf
          .moveDown()
          .fontSize(11)
          .text(item.id + " · " + item.equipment);
        pdf
          .fontSize(9)
          .text(item.kind + " | " + item.type + " | " + item.status)
          .text(
            "Vencimento: " +
              displayDate(item.dueAt) +
              " | Responsável: " +
              item.technician,
          )
          .text(item.description, { width: 510 });
      }
      if (!report.items.length)
        pdf.moveDown().text("Nenhum item encontrado no período.");
      pdf.end();
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition":
            'attachment; filename="preventivas-em-aberto.pdf"',
        })
        .send(await output);
    }),
  );
  r.get(
    "/alerts",
    run(async (_req, res) => {
      const now = new Date();
      const [orders, plans, services] = await Promise.all([
        db.maintenanceOrder.count({
          where: {
            scheduledAt: { lt: now },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        }),
        db.maintenancePlan.count({
          where: { active: true, nextExecution: { lt: now } },
        }),
        actor(res).role.name === "TECHNICIAN"
          ? Promise.resolve(0)
          : db.thirdPartyService.count({
              where: {
                status: { not: "FINISHED" },
                stageEnteredAt: { lt: new Date(now.getTime() - 7 * 86400000) },
              },
            }),
      ]);
      const items = [];
      if (orders)
        items.push({
          id: "late-orders",
          kind: "FACT",
          title: `${orders} ordens estão atrasadas`,
          evidence:
            "Programação anterior à consulta e status não concluído/cancelado.",
          recommendation:
            "Revise peças, responsáveis e programação antes de decidir.",
        });
      if (plans)
        items.push({
          id: "late-plans",
          kind: "FACT",
          title: `${plans} planos estão vencidos`,
          evidence: "Planos ativos com próximo vencimento anterior à consulta.",
          recommendation: "Confirme se houve execução antes de reprogramar.",
        });
      if (services)
        items.push({
          id: "stalled-services",
          kind: "FACT",
          title: `${services} processos estão parados há mais de sete dias`,
          evidence:
            "Etapa atual sem movimentação registrada há mais de sete dias.",
          recommendation: "Revise pendências com o responsável.",
        });
      res.json({
        period: { asOf: now.toISOString() },
        items,
        statisticalNote:
          "Análise estatística de aumento de frequência: funcionalidade futura. A recorrência descritiva está disponível em Interrupções. Nenhuma causa mecânica ou probabilidade é inferida.",
      });
    }),
  );
  r.post(
    "/assistant/query",
    run(async (req, res) => {
      const { question } = z
        .object({ question: z.string().trim().min(3).max(500) })
        .strict()
        .parse(req.body);
      const q = question
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase(),
        now = new Date();
      let from = new Date(now.getTime() - 7 * 86400000),
        to = now,
        items: any[] = [],
        intent = "",
        explanation = "";
      if (/terceir|prestador/.test(q)) {
        if (actor(res).role.name === "TECHNICIAN")
          throw new HttpError(
            403,
            "Seu perfil não permite consultar processos de terceiros",
          );
        intent = "THIRD_PARTIES";
        items = await db.thirdPartyService.findMany({
          where: { status: { not: "FINISHED" } },
          select: {
            id: true,
            provider: true,
            status: true,
            pendingNotes: true,
            stageEnteredAt: true,
          },
          orderBy: { stageEnteredAt: "asc" },
          take: 20,
        });
        explanation =
          "Processos locais ainda não finalizados, sem exposição de valores financeiros.";
      } else if (/preventiv|lubrifica/.test(q) && /vencid|atrasad/.test(q)) {
        intent = "LATE_PLANS";
        from = new Date(0);
        items = await db.maintenancePlan.findMany({
          where: { active: true, nextExecution: { lt: now } },
          select: {
            id: true,
            title: true,
            equipmentId: true,
            nextExecution: true,
            type: true,
          },
          orderBy: { nextExecution: "asc" },
          take: 20,
        });
        explanation = "Planos ativos cujo próximo vencimento já passou.";
      } else if (/preventiv|lubrifica/.test(q)) {
        intent = "UPCOMING_PLANS";
        to = new Date(now.getTime() + 7 * 86400000);
        from = now;
        items = await db.maintenancePlan.findMany({
          where: { active: true, nextExecution: { gte: from, lte: to } },
          select: {
            id: true,
            title: true,
            equipmentId: true,
            nextExecution: true,
            type: true,
          },
          orderBy: { nextExecution: "asc" },
          take: 20,
        });
        explanation =
          "Planos ativos com próximo vencimento nos sete dias após a consulta.";
      } else if (/amanha/.test(q)) {
        intent = "TOMORROW";
        const local = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Sao_Paulo",
        }).format(now);
        from = new Date(local + "T00:00:00-03:00");
        from = new Date(from.getTime() + 86400000);
        to = new Date(from.getTime() + 86400000);
        items = await db.maintenanceOrder.findMany({
          where: {
            scheduledAt: { gte: from, lt: to },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
          select: {
            id: true,
            equipmentId: true,
            description: true,
            scheduledAt: true,
            status: true,
          },
          orderBy: { scheduledAt: "asc" },
          take: 20,
        });
        explanation =
          "Ordens não encerradas programadas para amanhã no fuso America/Sao_Paulo.";
      } else if (/ord|atrasad|vencid/.test(q)) {
        intent = "LATE_ORDERS";
        from = new Date(0);
        items = await db.maintenanceOrder.findMany({
          where: {
            scheduledAt: { lt: now },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
          select: {
            id: true,
            sapReference: true,
            equipmentId: true,
            status: true,
            scheduledAt: true,
            priority: true,
          },
          orderBy: { scheduledAt: "asc" },
          take: 20,
        });
        explanation = "Ordens com programação vencida e status não encerrado.";
      } else if (/parad|interrup|recorren|falha/.test(q)) {
        intent = "INTERRUPTION_RANKING";
        const ranking = await db.interruption.groupBy({
          by: ["equipmentId"],
          where: { startedAt: { gte: from, lte: to } },
          _count: true,
          orderBy: { _count: { equipmentId: "desc" } },
          take: 10,
        });
        items = ranking.map((i) => ({
          equipmentId: i.equipmentId,
          interruptions: i._count,
        }));
        explanation =
          "Quantidade de interrupções iniciadas nos últimos sete dias. Recorrência de registros não é diagnóstico ou probabilidade de falha.";
      } else
        return res.json({
          intent: "HELP",
          period: { from: now, to: now },
          facts: [
            "Posso consultar paradas da semana, ordens atrasadas, preventivas dos próximos sete dias, terceiros pendentes e programação de amanhã.",
          ],
          items: [],
          recommendations: [],
          method: "Consultas estruturadas ao banco, sem modelo pago.",
        });
      res.json({
        intent,
        period: { from: from.getTime() === 0 ? null : from, to },
        facts: [
          explanation,
          items.length
            ? `${items.length} resultados exibidos (limite de 20 ou ranking de 10).`
            : "Nenhum registro atende a esses critérios no banco.",
        ],
        items,
        recommendations: items.length
          ? [
              "Revise os registros e a programação com o responsável antes de alterar prioridades.",
            ]
          : [],
        method:
          "Consulta estruturada; somente leitura. Nenhuma alteração ou integração SAP foi executada.",
      });
    }),
  );
  return r;
}
