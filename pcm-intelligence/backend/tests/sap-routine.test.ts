import { afterAll, beforeAll, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { createApp } from "../src/app.js";

const db = new PrismaClient();
const app = createApp(db);
const origin = process.env.FRONTEND_ORIGIN!;
const day = formatInTimeZone(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
const numbers = Array.from({ length: 4 }, (_, i) =>
  String(Date.now() * 10 + i),
);
const runIds: string[] = [];
const reminderIds: string[] = [];
let cookie: string[];
const call = (method: "get" | "post" | "patch", path: string) =>
  request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);

beforeAll(async () => {
  await db.loginThrottle.deleteMany();
  const login = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({
      email: "admin@pcm.demo",
      password: process.env.SEED_PASSWORD,
    });
  expect(login.status).toBe(200);
  cookie = login.headers["set-cookie"] as unknown as string[];
});

afterAll(async () => {
  const orders = await db.sapOrder.findMany({
    where: { number: { in: numbers } },
  });
  const ids = orders.flatMap((order) =>
    order.localOrderId ? [order.localOrderId] : [],
  );
  await db.sapWorkbookRun.deleteMany({ where: { id: { in: runIds } } });
  await db.sapConfirmation.deleteMany({
    where: { orderNumber: { in: numbers } },
  });
  await db.sapOrder.deleteMany({ where: { number: { in: numbers } } });
  await db.orderHistory.deleteMany({ where: { orderId: { in: ids } } });
  await db.maintenanceOrder.deleteMany({ where: { id: { in: ids } } });
  await db.maintenanceReminder.deleteMany({
    where: { id: { in: reminderIds } },
  });
  await db.$disconnect();
});

async function upload(feed: "IW38" | "IW47", rows: string[][]) {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Exportação").addRows(rows);
  const payload = {
    feed,
    filename: feed + ".xlsx",
    content: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
  };
  const preview = await call("post", "/sap/preview").send(payload);
  expect(preview.status).toBe(200);
  expect(preview.body).toHaveLength(1);
  expect(preview.body[0].issues).toEqual([]);
  const result = await call("post", "/sap/import").send(payload);
  expect(result.status).toBe(200);
  runIds.push(result.body.id);
  expect(result.body.result.status).toBe("updated");
}

it("importa IW38 e IW47 separadamente, identifica recorrência e vincula um planejamento", async () => {
  const equipment = await db.equipment.findFirstOrThrow({
    where: { tag: { not: null }, deletedAt: null, isDemo: true },
    include: { sector: true },
  });
  await upload("IW38", [
    [
      "Ordem",
      "TAG",
      "Setor",
      "Tipo de ordem",
      "Data de entrada",
      "Texto breve",
      "Plano de manutenção",
    ],
    ...["CORR", "CORI", "CORP", "MELH"].map((type, i) => [
      numbers[i],
      equipment.tag!,
      equipment.sector.name,
      type,
      day,
      "Falha de teste " + i,
      i === 3 ? "PL-QA" : "",
    ]),
  ]);
  const orderTypes = await db.maintenanceOrder.findMany({
    where: { sapReference: { in: numbers } },
    orderBy: { sapReference: "asc" },
    select: { type: true },
  });
  expect(orderTypes.map((item) => item.type)).toEqual([
    "CORRECTIVE",
    "CORRECTIVE_INDUSTRIAL",
    "CORRECTIVE_PLANNED",
    "IMPROVEMENT",
  ]);
  await upload("IW47", [
    [
      "Ordem",
      "Matrícula",
      "Data de início",
      "Horas trabalhadas",
      "Confirmação",
    ],
    [numbers[0], "0003321", day, "2", numbers[0]],
  ]);
  const routine = await call("get", "/sap/routine");
  expect(routine.status).toBe(200);
  expect(
    routine.body.feeds.map((item: { status: string }) => item.status),
  ).toEqual(["CURRENT", "CURRENT"]);
  expect(routine.body.recurrence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        equipmentId: equipment.id,
        total: 2,
        recent: expect.arrayContaining([
          expect.objectContaining({
            number: numbers[0],
            description: "Falha de teste 0",
          }),
        ]),
      }),
    ]),
  );
  expect(routine.body.planReferences).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ number: "PL-QA", latestOrder: numbers[3] }),
    ]),
  );
  const planned = await call("post", "/reminders").send({
    equipmentId: equipment.id,
    title: "Investigar recorrência de corretivas",
    kind: "CORP",
    description: "Inspecionar o equipamento e revisar as referências",
    plannedFor: day,
  });
  expect(planned.status).toBe(201);
  reminderIds.push(planned.body.id);
  const path = "/reminders/" + planned.body.id;
  expect(
    (await call("patch", path).send({ status: "LINKED", sapReference: "123" }))
      .status,
  ).toBe(409);
  expect(
    (
      await call("patch", path).send({
        status: "LINKED",
        sapReference: numbers[2],
      })
    ).status,
  ).toBe(204);
  const linked = await call(
    "get",
    "/reminders?status=LINKED&equipmentId=" + equipment.id,
  );
  expect(linked.body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: planned.body.id,
        sapReference: numbers[2],
      }),
    ]),
  );
});
