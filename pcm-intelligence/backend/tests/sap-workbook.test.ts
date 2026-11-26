import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { workbookTemplate } from "../src/modules/sap/workbook.js";

const db = new PrismaClient();
const app = createApp(db);
const origin = process.env.FRONTEND_ORIGIN!;
const scope = "SAP-QA-" + randomUUID().slice(0, 8);
const orderNumber = scope + "-OS";
const noteNumber = scope + "-NOTA";
const equipmentNumber = "000" + scope;
const connection = {
  secret: "sap-test-secret-not-for-production".repeat(2),
  id: scope,
  label: "Documentos / PCM / PCM-SAP.xlsx",
};
let planner: string[];
let viewer: string[];
let plannerId: string;
const createdIds: string[] = [];
const runIds: string[] = [];

async function login(roleName: "PLANNER" | "VIEWER") {
  const password = "SAP-Workbook-Test-2026";
  const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
  const { id, email } = await db.user.create({
    data: {
      email: `${scope.toLowerCase()}-${roleName.toLowerCase()}@pcm.demo`,
      name: scope,
      passwordHash: await hash(password, 4),
      roleId: role.id,
    },
  });
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
  expect(response.status).toBe(200);
  return { id, cookie: response.headers["set-cookie"] as unknown as string[] };
}
function call(
  method: "get" | "post" | "patch" | "delete" | "put",
  path: string,
  cookie = planner,
) {
  return request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);
}
async function workbook(fill: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await workbookTemplate()) as any);
  fill(book);
  return {
    filename: scope + ".xlsx",
    content: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
  };
}
const sheet = (book: ExcelJS.Workbook, title: string) =>
  book.getWorksheet(title)!;
const confirmation = [
  "",
  "90011144",
  "Técnico de teste 1",
  "25.11.2026",
  "10:34:36",
  "07:21:37",
  "20,780",
  "RFC_PS4",
  "CORR",
  "ELE-FMAD",
  "ELE-FMAD",
  "1000-LOCAL-TESTE",
  "CNPA LIB",
  "ORDEM FINALIZADA",
];
async function load(file: Awaited<ReturnType<typeof workbook>>) {
  const response = await call("post", "/sap/import").send(file);
  expect(response.status).toBe(200);
  runIds.push(response.body.id);
  return response.body;
}
function cloud(
  file: Awaited<ReturnType<typeof workbook>>,
  modifiedAt: string,
  secret = connection.secret,
) {
  return request(app)
    .post("/api/sap/connection")
    .set("Authorization", "Bearer " + secret)
    .send({ ...file, fileId: connection.id, modifiedAt });
}
const orderRow = (label: string) => [
  "ELE-FMAD",
  "CORR",
  orderNumber,
  noteNumber,
  "25.11.2026",
  "25.11.2026",
  label,
  "A",
  "LIB CAPC NOAP SCDM",
  equipmentNumber,
  "Máquina teste",
  "Linha UV",
  "1000-LINHA-TESTE",
];

beforeAll(async () => {
  const [owner, reader] = await Promise.all([
    login("PLANNER"),
    login("VIEWER"),
  ]);
  planner = owner.cookie;
  plannerId = owner.id;
  viewer = reader.cookie;
});
afterAll(async () => {
  await db.sapWorkbookRun.deleteMany({
    where: { OR: [{ id: { in: runIds } }, { filename: scope + ".xlsx" }] },
  });
  await db.sapWorkbookSettings.deleteMany({ where: { actorId: plannerId } });
  await db.sapConfirmation.deleteMany({
    where: { orderNumber: { startsWith: scope } },
  });
  const scopeFilter = { number: { startsWith: scope } };
  const orders = await db.sapOrder.findMany({ where: scopeFilter });
  const localOrderIds = orders.flatMap(({ localOrderId }) =>
    localOrderId ? [localOrderId] : [],
  );
  await db.sapOrder.deleteMany({ where: scopeFilter });
  await db.sapNote.deleteMany({ where: scopeFilter });
  await db.orderHistory.deleteMany({
    where: { orderId: { in: localOrderIds } },
  });
  await db.maintenanceOrder.deleteMany({
    where: { id: { in: localOrderIds } },
  });
  await db.equipment.deleteMany({
    where: { OR: [{ id: { in: createdIds } }, { tag: { startsWith: scope } }] },
  });
  const users = await db.user.findMany({ where: { name: scope } });
  const userIds = users.map(({ id }) => id);
  await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("pasta de trabalho SAP", () => {
  it("preserva TAG e número SAP no cadastro e aplica exclusão, arquivamento e permissões", async () => {
    const body = {
      tag: scope,
      name: "Máquina teste",
      sectorId: "SEC-1",
      criticality: 2,
      status: "UNKNOWN",
    };
    const creation = await call("post", "/equipment").send(body);
    expect(creation.status).toBe(201);
    expect(creation.body.equipmentNumber).toBeNull();
    createdIds.push(creation.body.id);
    const newGear = await call("patch", "/equipment/" + creation.body.id).send({
      ...body,
      equipmentNumber,
      version: creation.body.version,
    });
    expect(newGear.status).toBe(200);
    expect(newGear.body.id).toBe(creation.body.id);
    expect(newGear.body.equipmentNumber).toBe(equipmentNumber);

    const spare = await call("post", "/equipment").send({
      ...body,
      tag: scope + "-EXTRA",
    });
    expect(spare.status).toBe(201);
    createdIds.push(spare.body.id);
    const path = "/equipment/" + spare.body.id + "/permanent";
    expect(
      (
        await call("delete", path, viewer).send({
          version: spare.body.version,
          reason: "Cadastro sem vínculo",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("delete", path).send({
          version: spare.body.version,
          reason: "Cadastro sem vínculo",
        })
      ).status,
    ).toBe(204);
    expect(
      await db.equipment.findUnique({ where: { id: spare.body.id } }),
    ).toBeNull();
    expect(
      await db.auditLog.count({
        where: { userId: plannerId, action: "EQUIPMENT_PURGED" },
      }),
    ).toBe(1);
  });

  it("detecta cabeçalhos sem deslocar colunas e indica a linha física da planilha", async () => {
    const file = await workbook((book) => {
      const notes = sheet(book, "Notas");
      notes.getCell("A1").value = "Número no layout de fábrica";
      notes.getCell("K1").value = "Campo adicional";
      notes.getCell("A4").value = noteNumber;
      notes.getCell("K4").value = "Preservar";
    });
    const original = await call("post", "/sap/preview").send(file);
    const notes = original.body.find(
      (item: { tab: string }) => item.tab === "Notas",
    );
    expect(notes.issues[0]).toContain("Nota");
    const mapped = await call("post", "/sap/preview").send({
      ...file,
      mapping: { Notas: { noteNumber: "Número no layout de fábrica" } },
    });
    expect(mapped.status).toBe(200);
    const remapped = mapped.body.find(
      (item: { tab: string }) => item.tab === "Notas",
    );
    expect(remapped.issues).toEqual([]);
    expect(remapped.rows[0]).toMatchObject({ line: 4, values: { noteNumber } });
    expect(remapped.rows[0].columns[10]).toEqual({
      header: "Campo adicional",
      value: "Preservar",
    });
    const duplicateHeader = await workbook((book) => {
      sheet(book, "Ordens").getCell("R1").value = "Número da ordem";
    });
    const ambiguous = await call("post", "/sap/preview").send(duplicateHeader);
    expect(
      ambiguous.body.find((item: { tab: string }) => item.tab === "Ordens")
        .issues[0],
    ).toMatch(/3, 18/);
  });

  it("mantém notas e apontamentos sem OS e vincula automaticamente ao importar a ordem", async () => {
    const pending = await workbook((book) => {
      sheet(book, "Notas").addRow([
        noteNumber,
        "",
        "Nota aguardando ordem",
        "24.11.2026",
        equipmentNumber,
      ]);
      const time = sheet(book, "Apontamentos");
      time.addRow([orderNumber, ...confirmation.slice(1), scope + "C", "0001"]);
      time.addRow([orderNumber, ...confirmation.slice(1), scope + "C", "0002"]);
      time.addRow([
        orderNumber,
        "00001234",
        "Outro técnico",
        "25.11.2026",
        "",
        "",
        "1,2176",
        "RFC_PS4",
        "CORR",
        "ELE-FMAD",
      ]);
      time.addRow([
        orderNumber,
        "00001234",
        "Outro técnico",
        "26.11.2026",
        "",
        "",
        "inválido",
        "RFC_PS4",
      ]);
    });
    expect((await load(pending)).result.status).toBe("partial");
    const before = (await call("get", "/reports/sap")).body;
    expect(
      before.pending.some(
        (item: { number: string }) => item.number === noteNumber,
      ),
    ).toBe(true);
    expect(
      before.details.find(
        (item: { orderNumber: string }) => item.orderNumber === orderNumber,
      ).orderReceived,
    ).toBe(false);
    expect(
      await db.maintenanceOrder.count({ where: { sapReference: orderNumber } }),
    ).toBe(0);

    const orders = await workbook((book) => {
      const ws = sheet(book, "Ordens");
      ws.getCell("Q1").value = "Campo da fábrica";
      ws.addRow([...orderRow("Descrição original SAP"), "", "", "", "ROT"]);
    });
    const [one, two] = await Promise.all([load(orders), load(orders)]);
    expect(one.result.status).toBe("updated");
    expect(two.result.status).toBe("updated");
    await load(pending);
    await load(pending);
    const report = (
      await call("get", "/reports/sap?from=2026-11-24&to=2026-11-26")
    ).body;
    expect(report.hours).toBe("42.778");
    expect(report.excluded).toBe(1);
    expect(report.technicians).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personnelNumber: "90011144",
          orders: 1,
          confirmations: 2,
          hours: "41.560",
        }),
        expect.objectContaining({
          personnelNumber: "00001234",
          orders: 1,
          confirmations: 2,
          hours: "1.218",
          excluded: 1,
        }),
      ]),
    );
    expect(
      report.details.find(
        (item: { personnelNumber: string }) =>
          item.personnelNumber === "90011144",
      ),
    ).toMatchObject({
      orderReceived: true,
      hours: "20.78",
      fields: {
        registeredBy: "RFC_PS4",
        startTime: "10:34:36",
        endTime: "07:21:37",
      },
    });
    expect(
      report.pending.some(
        (item: { number: string }) => item.number === noteNumber,
      ),
    ).toBe(false);
    const linked = report.linked.find(
      (item: { number: string }) => item.number === noteNumber,
    );
    expect(linked.orders[0]).toMatchObject({
      number: orderNumber,
      localOrderId: expect.any(String),
    });
    const detail = (
      await call(
        "get",
        "/reports/sap/orders/" + encodeURIComponent(orderNumber),
      )
    ).body;
    expect(detail.confirmations).toHaveLength(4);
    expect(detail.fields.columns[16]).toEqual({
      header: "Campo da fábrica",
      value: "ROT",
    });
    const local = await db.maintenanceOrder.findUniqueOrThrow({
      where: { id: linked.orders[0].localOrderId },
    });
    await db.maintenanceOrder.update({
      where: { id: local.id },
      data: { notes: "Informação PCM", status: "ANALYSIS" },
    });
    const changed = await workbook((book) =>
      sheet(book, "Ordens").addRow(orderRow("Descrição SAP atualizada")),
    );
    await load(changed);
    expect(
      await db.maintenanceOrder.findUnique({ where: { id: local.id } }),
    ).toMatchObject({ notes: "Informação PCM", status: "ANALYSIS" });
    expect(
      await db.maintenanceOrder.count({ where: { sapReference: orderNumber } }),
    ).toBe(1);
    expect(
      (await db.sapOrder.findUniqueOrThrow({ where: { number: orderNumber } }))
        .fields,
    ).toMatchObject({ description: "Descrição SAP atualizada" });

    const denied = await call(
      "delete",
      "/equipment/" + local.equipmentId + "/permanent",
    ).send({ version: 2, reason: "Verificar vínculos" });
    expect(denied.status).toBe(409);
    expect(denied.body.error).toMatch(/1 ordens.*1 notas SAP/);
    const archived = await call(
      "post",
      "/equipment/" + local.equipmentId + "/archive",
    ).send({ version: 2, reason: "Preservar histórico" });
    expect(archived.status).toBe(200);
    expect(archived.body.deletedAt).toBeTruthy();
    expect(await db.maintenanceOrder.count({ where: { id: local.id } })).toBe(
      1,
    );
    const restored = await call(
      "post",
      "/equipment/" + local.equipmentId + "/restore",
    ).send({ version: archived.body.version, reason: "Voltou à operação" });
    expect(restored.body.deletedAt).toBeNull();

    const suffix = "?from=2026-11-25&to=2026-11-25&technician=90011144";
    const filtered = (await call("get", "/reports/sap" + suffix)).body;
    expect(filtered.hours).toBe("41.560");
    const xlsx = await call("get", "/reports/sap.xlsx" + suffix)
      .buffer(true)
      .parse((response, done) => {
        const parts: Buffer[] = [];
        response.on("data", (chunk) => parts.push(chunk));
        response.on("end", () => done(null, Buffer.concat(parts)));
      });
    const exportBook = new ExcelJS.Workbook();
    await exportBook.xlsx.load(xlsx.body);
    expect(exportBook.getWorksheet("Resumo")!.getCell("B2").value).toBe(41.56);
    expect(exportBook.getWorksheet("Apontamentos")!.rowCount).toBe(3);
    expect(
      (await call("get", "/reports/sap.pdf" + suffix)).headers["content-type"],
    ).toMatch(/application\/pdf/);
  });

  it("pede setor quando a TAG é ambígua e encontra a ordem recebida antes da nota", async () => {
    const tag = scope + "-TAG";
    const number = scope + "-OS-ATRASADA";
    const note = scope + "-NOTA-ATRASADA";
    const machines = await workbook((book) => {
      const ws = sheet(book, "Máquinas");
      ws.addRow([tag, "", "Máquina A", "SEC-1"]);
      ws.addRow([tag, "", "Máquina B", "SEC-2"]);
    });
    expect((await load(machines)).result.status).toBe("updated");
    const orderFile = (sector: string) =>
      workbook((book) => {
        const ws = sheet(book, "Ordens");
        ws.addRow([
          "ELE-FMAD",
          "LUBR",
          number,
          note,
          "26.11.2026",
          "26.11.2026",
          "Conferência por setor",
          "",
          "LIB",
          "",
          "",
          "",
          "",
          tag,
          sector,
        ]);
      });
    const ambiguous = await load(await orderFile(""));
    expect(ambiguous.result.status).toBe("partial");
    expect(await db.sapOrder.findUnique({ where: { number } })).toMatchObject({
      localOrderId: null,
    });
    const issues = await call(
      "get",
      "/sap/runs/" + ambiguous.id + "/errors?tab=Ordens",
    );
    expect(issues.body.items).toMatchObject([
      { line: 2, message: expect.stringContaining("ambíguos") },
    ]);
    expect((await load(await orderFile("SEC-2"))).result.status).toBe(
      "updated",
    );
    const bound = await db.sapOrder.findUniqueOrThrow({
      where: { number },
      include: { equipment: true },
    });
    expect(bound).toMatchObject({
      localOrderId: expect.any(String),
      equipment: { sectorId: "SEC-2" },
    });
    const noteFile = await workbook((book) =>
      sheet(book, "Notas").addRow([note, "", "Nota posterior à ordem"]),
    );
    expect((await load(noteFile)).result.status).toBe("updated");
    const report = (await call("get", "/reports/sap")).body;
    expect(
      report.pending.some((item: { number: string }) => item.number === note),
    ).toBe(false);
    expect(report.linked).toContainEqual(
      expect.objectContaining({
        number: note,
        orders: [{ number, localOrderId: bound.localOrderId }],
      }),
    );
  });

  it("separa uma correção ambígua para decisão do PCM", async () => {
    const fallback = (hours: string) =>
      workbook((book) =>
        sheet(book, "Apontamentos").addRow([
          scope + "-FALLBACK",
          "000095",
          "Técnico Teste",
          "24.11.2026",
          "08:00:00",
          "10:00:00",
          hours,
        ]),
      );
    await load(await fallback("2,000"));
    await load(await fallback("2,000"));
    const revised = await load(await fallback("2,500"));
    expect(revised.result.status).toBe("partial");
    const reportPath = "/reports/sap?technician=000095";
    const prior = (await call("get", reportPath)).body;
    expect(prior).toMatchObject({ hours: "2.000", excluded: 1 });
    const item = prior.details.find(
      (record: { review: string }) => record.review,
    );
    const path = "/sap/confirmation-review/" + encodeURIComponent(item.key);
    const review = await call("get", path);
    expect(review.body.candidates).toHaveLength(1);
    const decision = {
      replace: review.body.candidates[0].key,
      fingerprint: review.body.record.fingerprint,
    };
    expect((await call("post", path, viewer).send(decision)).status).toBe(403);
    expect((await call("post", path).send(decision)).status).toBe(204);
    await load(await fallback("2,000"));
    await load(await fallback("2,500"));
    expect((await call("get", reportPath)).body).toMatchObject({
      hours: "2.500",
      excluded: 0,
    });
  });

  it("simula salvamento, reenvio simultâneo e entrega fora de ordem do SharePoint", async () => {
    process.env.PCM_WORKBOOK_SECRET = connection.secret;
    process.env.PCM_WORKBOOK_FILE_ID = connection.id;
    process.env.PCM_WORKBOOK_FILE_LABEL = connection.label;
    try {
      expect((await call("get", "/sap/status")).body.configured).toBe(false);
      expect((await call("put", "/sap/mapping").send({})).status).toBe(204);
      const first = await workbook((book) =>
        sheet(book, "Ordens").addRow(orderRow("Versão do arquivo 1")),
      );
      const second = await workbook((book) =>
        sheet(book, "Ordens").addRow(orderRow("Versão do arquivo 2")),
      );
      expect(
        (await cloud(first, "2026-11-25T12:30:00Z", "incorreto")).status,
      ).toBe(401);
      expect((await cloud(first, "2026-11-25T12:30:00Z")).body.status).toBe(
        "updated",
      );
      const pair = await Promise.all([
        cloud(second, "2026-11-25T12:31:00Z"),
        cloud(second, "2026-11-25T12:31:00Z"),
      ]);
      expect(pair.map((r) => r.body.status).sort()).toEqual([
        "unchanged",
        "updated",
      ]);
      expect((await cloud(first, "2026-11-25T12:30:00Z")).body.status).toBe(
        "obsolete",
      );
      expect(
        (
          await db.sapOrder.findUniqueOrThrow({
            where: { number: orderNumber },
          })
        ).fields,
      ).toMatchObject({ description: "Versão do arquivo 2" });
      const status = (await call("get", "/sap/status")).body;
      expect(status).toMatchObject({
        file: connection.label,
        configured: true,
        lastSuccessful: { source: "microsoft365" },
      });
    } finally {
      delete process.env.PCM_WORKBOOK_SECRET;
      delete process.env.PCM_WORKBOOK_FILE_ID;
      delete process.env.PCM_WORKBOOK_FILE_LABEL;
    }
  });
});
