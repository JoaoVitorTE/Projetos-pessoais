import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Router } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HttpError, must, run } from "../operations/helpers.js";
import { sapDate, type Values } from "./workbook.js";

const dateParameter = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const filters = z.object({
  from: dateParameter,
  to: dateParameter,
  technician: z.string().max(100).optional(),
  center: z.string().max(120).optional(),
  type: z.string().max(120).optional(),
  equipment: z.string().max(120).optional(),
  interval: z.enum(["day", "week"]).default("day"),
});
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";
const rounded = (value: Prisma.Decimal) => value.toFixed(3);
const asFields = (value: Prisma.JsonValue): Values =>
  Object.fromEntries(
    Object.entries(value as Prisma.JsonObject).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
const TotalHours = Prisma.Decimal.clone({ precision: 40 });
const localDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
  }).format(new Date());
function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const counts = (values: Map<string, number>) =>
  [...values]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));

export async function sapReport(db: PrismaClient, query: unknown) {
  const f = filters.parse(query);
  let from, to;
  try {
    from = sapDate(f.from);
    to = sapDate(f.to);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  if (from && to && from > to)
    throw new HttpError(400, "O período inicial deve preceder o final.");
  const period = { ...(from && { gte: from }), ...(to && { lte: to }) };
  const dated = Boolean(from || to);
  const [orders, notes, confirmations, equipment] = await db.$transaction(
    [
      db.sapOrder.findMany({
        select: {
          number: true,
          equipmentId: true,
          noteNumber: true,
          entryDate: true,
          workCenter: true,
          orderType: true,
          localOrderId: true,
          fields: true,
          localOrder: { select: { equipmentId: true } },
        },
        orderBy: { number: "asc" },
      }),
      db.sapNote.findMany({ orderBy: [{ date: "asc" }, { number: "asc" }] }),
      db.sapConfirmation.findMany({
        where: {
          supersededBy: null,
          ...(dated && { date: period }),
          ...(f.technician && { personnelNumber: f.technician }),
        },
        orderBy: [{ date: "desc" }, { key: "asc" }],
      }),
      db.equipment.findMany({
        select: {
          id: true,
          tag: true,
          name: true,
          sector: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  const orderByNumber = new Map(orders.map((order) => [order.number, order]));
  const matchingOrders = new Map<string, typeof orders>();
  for (const order of orders)
    if (order.noteNumber) {
      const matching = matchingOrders.get(order.noteNumber) ?? [];
      matching.push(order);
      matchingOrders.set(order.noteNumber, matching);
    }
  const matchesDate = (date: Date | null) =>
    !dated || Boolean(date && (!from || date >= from) && (!to || date <= to));
  const equipmentMatches = (order?: (typeof orders)[number]) =>
    !f.equipment ||
    (order?.equipmentId ?? order?.localOrder?.equipmentId) === f.equipment;
  const today = sapDate(localDay())!;
  const noteBuckets = new Map<string, number>([
    ["0–7 dias", 0],
    ["8–30 dias", 0],
    ["31+ dias", 0],
    ["Sem data", 0],
  ]);
  const noteRows = notes
    .filter(
      (note) =>
        matchesDate(note.date) &&
        (!f.equipment || note.equipmentId === f.equipment),
    )
    .map((note) => {
      const explicit = note.orderNumber
        ? orderByNumber.get(note.orderNumber)
        : undefined;
      const matches = [
        ...new Map(
          [
            ...(explicit ? [explicit] : []),
            ...(matchingOrders.get(note.number) ?? []),
          ].map((order) => [order.number, order]),
        ).values(),
      ];
      const pending = !note.orderNumber && !matches.length;
      const daysOpen = note.date
        ? Math.max(0, Math.floor((+today - +note.date) / 86400000))
        : null;
      if (pending)
        increment(
          noteBuckets,
          daysOpen === null
            ? "Sem data"
            : daysOpen <= 7
              ? "0–7 dias"
              : daysOpen <= 30
                ? "8–30 dias"
                : "31+ dias",
        );
      return {
        number: note.number,
        date: day(note.date),
        daysOpen: pending ? daysOpen : null,
        pending,
        fields: asFields(note.fields),
        orderNumber: note.orderNumber,
        orders: matches.map(({ number, localOrderId }) => ({
          number,
          localOrderId,
        })),
      };
    });

  const grouped = new Map<
    string,
    {
      name: string;
      orders: Set<string>;
      hours: Prisma.Decimal;
      count: number;
      excluded: number;
    }
  >();
  const trend = new Map<string, Prisma.Decimal>();
  const matchedOrderNumbers = new Set<string>();
  let hours = new TotalHours(0),
    excluded = 0;
  const details = confirmations.flatMap((item) => {
    const order = orderByNumber.get(item.orderNumber);
    const center = item.workCenter ?? order?.workCenter;
    const type = item.orderType ?? order?.orderType;
    if (
      (f.center && f.center !== center) ||
      (f.type && f.type !== type) ||
      !equipmentMatches(order)
    )
      return [];
    const group = grouped.get(item.personnelNumber) ?? {
      name: "",
      orders: new Set<string>(),
      hours: new TotalHours(0),
      count: 0,
      excluded: 0,
    };
    group.name ||= item.technicianName ?? "";
    group.count++;
    group.orders.add(item.orderNumber);
    matchedOrderNumbers.add(item.orderNumber);
    if (item.hours !== null) {
      hours = hours.plus(item.hours);
      group.hours = group.hours.plus(item.hours);
      const date = item.date ? new Date(item.date) : null;
      if (date && f.interval === "week")
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const label = day(date) || "Sem data";
      trend.set(
        label,
        (trend.get(label) ?? new TotalHours(0)).plus(item.hours),
      );
    } else {
      excluded++;
      group.excluded++;
    }
    grouped.set(item.personnelNumber, group);
    return [
      {
        key: item.key,
        personnelNumber: item.personnelNumber,
        technicianName: item.technicianName,
        orderNumber: item.orderNumber,
        localOrderId: order?.localOrderId,
        orderReceived: !!order,
        date: day(item.date),
        hours: item.hours?.toString() ?? null,
        review: item.review,
        fields: asFields(item.fields),
      },
    ];
  });
  const orderGroups = new Map<string, number>();
  const orderRows = orders.flatMap((order) => {
    if (
      !matchesDate(order.entryDate) ||
      !equipmentMatches(order) ||
      (f.center && f.center !== order.workCenter) ||
      (f.type && f.type !== order.orderType) ||
      (f.technician && !matchedOrderNumbers.has(order.number))
    )
      return [];
    increment(
      orderGroups,
      `${order.orderType || "Sem tipo"} / ${order.workCenter || "Sem centro"}`,
    );
    return [
      {
        number: order.number,
        localOrderId: order.localOrderId,
        date: day(order.entryDate),
        workCenter: order.workCenter,
        orderType: order.orderType,
        description: asFields(order.fields).description,
      },
    ];
  });
  const technicians = [...grouped].map(([personnelNumber, group]) => ({
    personnelNumber,
    name: group.name,
    orders: group.orders.size,
    confirmations: group.count,
    hours: rounded(group.hours),
    excluded: group.excluded,
  }));
  return {
    filters: f,
    today,
    equipment,
    orders: orderRows,
    hours: rounded(hours),
    excluded,
    technicians,
    details,
    pending: noteRows.filter((note) => note.pending),
    linked: noteRows.filter((note) => !note.pending),
    charts: {
      evolution: [...trend]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, total]) => ({ label, value: rounded(total) })),
      orders: counts(orderGroups),
      notes: [...noteBuckets].map(([label, value]) => ({ label, value })),
    },
  };
}

type Report = Awaited<ReturnType<typeof sapReport>>;
const sections = (
  report: Report,
): { title: string; headers: string[]; rows: (string | number)[][] }[] => [
  {
    title: "Horas por técnico",
    headers: [
      "Matrícula",
      "Nome",
      "Ordens distintas",
      "Apontamentos",
      "Horas",
      "Fora da soma",
    ],
    rows: report.technicians.map((r) => [
      r.personnelNumber,
      r.name,
      r.orders,
      r.confirmations,
      r.hours,
      r.excluded,
    ]),
  },
  {
    title: "Apontamentos",
    headers: [
      "Matrícula",
      "Técnico",
      "Ordem SAP",
      "Confirmação",
      "Contador",
      "Data de início",
      "Hora inicial",
      "Hora final",
      "Horas SAP",
      "Registrado por",
      "Texto de confirmação",
      "Revisão",
    ],
    rows: report.details.map(
      ({
        personnelNumber,
        technicianName,
        orderNumber,
        date,
        hours,
        review,
        fields: f,
      }) => [
        personnelNumber,
        technicianName || "",
        orderNumber,
        f.confirmationId || "",
        f.counter || "",
        date,
        f.startTime || "",
        f.endTime || "",
        hours ?? "",
        f.registeredBy || "",
        f.confirmationText || "",
        review || "",
      ],
    ),
  },
  {
    title: "Evolução das horas",
    headers: ["Início do apontamento", "Horas"],
    rows: report.charts.evolution.map((r) => [r.label, r.value]),
  },
  {
    title: "Ordens por tipo e centro",
    headers: ["Tipo / centro (data de entrada)", "Ordens"],
    rows: report.charts.orders.map((r) => [r.label, r.value]),
  },
  {
    title: "Tempo em aberto",
    headers: ["Dias desde a data da nota", "Notas"],
    rows: report.charts.notes.map((r) => [r.label, r.value]),
  },
  {
    title: "Notas sem ordem",
    headers: [
      "Nota",
      "Data da nota",
      "Dias em aberto",
      "Descrição",
      "Equipamento",
      "Local",
    ],
    rows: report.pending.map((r) => [
      r.number,
      r.date,
      r.daysOpen ?? "",
      r.fields.description || "",
      r.fields.equipmentName || r.fields.equipmentNumber || r.fields.tag || "",
      r.fields.locationName || r.fields.locationCode || "",
    ]),
  },
  {
    title: "Notas com ordem",
    headers: ["Nota", "Data da nota", "Ordens SAP", "Descrição"],
    rows: report.linked.map((r) => [
      r.number,
      r.date,
      r.orders.map((order) => order.number).join(", ") || r.orderNumber || "",
      r.fields.description || "",
    ]),
  },
  {
    title: "Ordens SAP",
    headers: [
      "Ordem",
      "Data de entrada",
      "Tipo SAP",
      "Centro de trabalho",
      "Descritivo",
    ],
    rows: report.orders.map((r) => [
      r.number,
      r.date,
      r.orderType || "",
      r.workCenter || "",
      r.description || "",
    ]),
  },
];

const rangeLabel = (r: Report) =>
  `Período ${r.filters.from || "sem início"} a ${r.filters.to || "sem fim"} · matrícula ${r.filters.technician || "todas"} · centro ${r.filters.center || "todos"} · tipo ${r.filters.type || "todos"} · equipamento ${r.filters.equipment || "todos"}`;

export function sapReportRouter(db: PrismaClient) {
  const router = Router();
  router.get(
    "/reports/sap",
    run(async (req, res) => res.json(await sapReport(db, req.query))),
  );
  router.get(
    "/reports/sap/orders/:number",
    run(async (req, res) => {
      const order = must(
        await db.sapOrder.findUnique({ where: { number: req.params.number } }),
      );
      const confirmations = await db.sapConfirmation.findMany({
        where: { orderNumber: order.number, supersededBy: null },
        orderBy: { date: "asc" },
      });
      res.json({
        ...order,
        confirmations: confirmations.map((item) => ({
          ...item,
          fields: asFields(item.fields),
        })),
      });
    }),
  );
  router.get(
    "/reports/sap.xlsx",
    run(async (req, res) => {
      const report = await sapReport(db, req.query);
      const workbook = new ExcelJS.Workbook();
      const summary = workbook.addWorksheet("Resumo");
      summary.addRows([
        [rangeLabel(report)],
        ["Horas válidas", Number(report.hours)],
        ["Apontamentos fora da soma", report.excluded],
      ]);
      summary.getColumn(2).width = 24;
      summary.getCell("B2").numFmt = "0.000";
      for (const section of sections(report)) {
        const sheet = workbook.addWorksheet(section.title, {
          views: [{ state: "frozen", ySplit: 1 }],
        });
        sheet.addRow(section.headers);
        sheet.getRow(1).font = { bold: true };
        sheet.addRows(
          section.rows.map((row) =>
            row.map((value, index) =>
              section.headers[index] === "Horas" && value !== ""
                ? Number(value)
                : value,
            ),
          ),
        );
        sheet.columns.forEach((col, index) => {
          col.width = 24;
          if (section.headers[index] === "Horas") col.numFmt = "0.000";
        });
      }
      res
        .attachment("relatorio-sap.xlsx")
        .send(Buffer.from(await workbook.xlsx.writeBuffer()));
    }),
  );
  router.get(
    "/reports/sap.pdf",
    run(async (req, res) => {
      const report = await sapReport(db, req.query);
      const pdf = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      const output = new Promise<Buffer>((resolve, reject) => {
        pdf.on("data", (chunk) => chunks.push(chunk));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
      });
      pdf.fontSize(19).text("PCM Intelligence — Relatório SAP").moveDown();
      pdf.fontSize(10).text(rangeLabel(report));
      pdf.text(
        `Horas válidas ${report.hours} · Apontamentos fora da soma ${report.excluded}`,
      );
      for (const { title, headers, rows } of sections(report)) {
        pdf.moveDown().fontSize(13).text(title).fontSize(9);
        if (!rows.length) pdf.text("Sem registros");
        for (const row of rows)
          pdf
            .text(
              row
                .map((value, index) =>
                  value === "" ? "" : `${headers[index]} ${value}`,
                )
                .filter(Boolean)
                .join(" · "),
            )
            .moveDown(0.4);
      }
      pdf.end();
      res.attachment("relatorio-sap.pdf").send(await output);
    }),
  );
  return router;
}
