import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";
import { readFile } from "../src/modules/imports/files.js";
const db = new PrismaClient(),
  app = createApp(db),
  origin = process.env.FRONTEND_ORIGIN!,
  tag = "QA-IMP-" + randomUUID().slice(0, 8).toUpperCase();
let admin: string[],
  viewer: string[],
  planner: string[],
  tech: string[],
  source: any,
  first: any,
  update: any;
const batches: string[] = [],
  sources: string[] = [],
  gear = tag + "-EQ";
const scheduleIds: string[] = [],
  scheduleWindows: string[] = [];
const options = {
  dateFormat: "BR",
  timezone: "America/Sao_Paulo",
  createReferences: true,
  defaultSectorId: "SEC-1",
  defaultCriticality: 2,
};
const mapping = {
  externalKey: "OS",
  equipmentId: "Equipamento",
  description: "Descrição",
  type: "Tipo",
  status: "Status",
  priority: "Prioridade",
  scheduledAt: "Programação",
};
function call(
  method: "get" | "post" | "patch",
  path: string,
  body?: unknown,
  cookie = admin,
) {
  const r = request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);
  if (path.includes(".xlsx") || path.includes("format=xlsx"))
    r.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => done(null, Buffer.concat(chunks)));
      res.on("error", done);
    });
  return body === undefined ? r : r.send(body);
}
async function upload(rows: string[], originId = source.id) {
  const csv =
    "OS;Equipamento;Descrição;Tipo;Status;Prioridade;Programação\r\n" +
    rows.join("\r\n");
  const r = await call("post", "/imports/upload", {
    sourceId: originId,
    filename: "exportacao-ficticia.csv",
    base64: Buffer.from(csv).toString("base64"),
  });
  expect(r.status).toBe(201);
  batches.push(r.body.id);
  return r.body;
}
const row = (
  key: string,
  description = "Teste fictício",
  date = "01/12/2026 08:00",
) => [key, gear, description, "PREVENTIVE", "OPEN", "2", date].join(";");
async function preview(id: string, opts: any = options) {
  const r = await call("post", "/imports/" + id + "/preview", {
    mapping,
    options: opts,
    saveMapping: true,
  });
  expect(r.status).toBe(200);
  return r.body;
}
async function apply(id: string, acceptValidOnly = false) {
  expect(
    (
      await call("post", "/imports/" + id + "/confirm", {
        confirmation: "IMPORTAR",
        acceptValidOnly,
      })
    ).status,
  ).toBe(200);
  let r;
  do {
    r = await call("post", "/imports/" + id + "/process", {});
    expect(r.status).toBe(200);
  } while (r.body.status === "RUNNING");
  return r.body;
}
beforeAll(async () => {
  await db.loginThrottle.deleteMany();
  [admin, viewer, tech, planner] = await Promise.all(
    ["admin", "viewer", "technician", "planner"].map(async (role) => {
      const r = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({
          email: role + "@pcm.demo",
          password: process.env.SEED_PASSWORD,
        });
      expect(r.status).toBe(200);
      return r.headers["set-cookie"] as unknown as string[];
    }),
  );
  const r = await call("post", "/imports/sources", {
    name: tag,
    system: "SAP",
    scope: tag,
    target: "ORDERS",
    isDemo: true,
  });
  expect(r.status).toBe(201);
  source = r.body;
  sources.push(source.id);
});
afterAll(async () => {
  await db.assignmentHistory.deleteMany({
    where: { assignmentId: { in: scheduleIds } },
  });
  await db.technicianAssignment.deleteMany({
    where: { id: { in: scheduleIds } },
  });
  await db.technicianWorkWindow.deleteMany({
    where: { id: { in: scheduleWindows } },
  });
  const entities = await db.externalRecord.findMany({
    where: { sourceId: { in: sources } },
  });
  const ids = entities
    .filter((e) => e.entityType === "ORDERS")
    .map((e) => e.entityId);
  await db.orderHistory.deleteMany({ where: { orderId: { in: ids } } });
  await db.maintenanceOrder.deleteMany({ where: { id: { in: ids } } });
  await db.equipment.deleteMany({ where: { id: gear } });
  await db.importChange.deleteMany({ where: { batchId: { in: batches } } });
  await db.externalRecord.deleteMany({ where: { sourceId: { in: sources } } });
  await db.importBatch.deleteMany({ where: { id: { in: batches } } });
  await db.importSource.deleteMany({ where: { id: { in: sources } } });
  await db.$disconnect();
});
it("restringe o lote de outro usuário e protege a prévia quando a chave está configurada", async () => {
  const batch = await upload([row(tag + "-PRIVADO")]);
  const path = "/imports/" + batch.id;
  expect((await call("get", path, undefined, planner)).status).toBe(404);
  expect((await call("post", path + "/stop", {}, planner)).status).toBe(404);
  const listing = await call("get", "/imports", undefined, planner);
  expect(listing.status).toBe(200);
  expect(
    listing.body.items.some((item: { id: string }) => item.id === batch.id),
  ).toBe(false);
  expect((await call("get", path)).status).toBe(200);
  if (process.env.PCM_IMPORT_ENCRYPTION_KEY) {
    const stored = await db.importBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(stored.preview).toMatchObject({ sealed: "aes-256-gcm-v1" });
    expect(JSON.stringify(stored.preview)).not.toContain(tag + "-PRIVADO");
    await preview(batch.id);
    const planned = await db.importBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(planned.payload).toMatchObject({ sealed: "aes-256-gcm-v1" });
  }
});
describe("Leitura segura de arquivos", () => {
  it("preserva zeros em CSV UTF-8 e respeita aspas", async () => {
    const p = await readFile(
      Buffer.from('\uFEFFOS;Descrição\n0000123;"Texto; com separador"'),
      "arquivo.csv",
      {},
    );
    expect(p.rows[0]).toEqual(["0000123", "Texto; com separador"]);
  });
  it("preserva formatação numérica de identificadores no XLSX", async () => {
    const wb = new ExcelJS.Workbook(),
      s = wb.addWorksheet("Teste");
    s.addRow(["OS", "Descrição"]);
    s.addRow([123, "Fictício"]);
    s.getCell("A2").numFmt = "0000000";
    const p = await readFile(
      Buffer.from(await wb.xlsx.writeBuffer()),
      "arquivo.xlsx",
      {},
    );
    expect(p.rows[0][0]).toBe("0000123");
  });
  it("rejeita extensão, ZIP, cabeçalhos ambíguos e limites", async () => {
    await expect(readFile(Buffer.from("texto"), "a.exe", {})).rejects.toThrow(
      "CSV ou XLSX",
    );
    await expect(
      readFile(Buffer.from("PKinválido"), "a.xlsx", {}),
    ).rejects.toThrow("inválido");
    await expect(
      readFile(Buffer.from("OS;OS\n1;2"), "a.csv", {}),
    ).rejects.toThrow("repetido");
    await expect(
      readFile(Buffer.alloc(3 * 1024 * 1024 + 1), "a.csv", {}),
    ).rejects.toThrow("3 MB");
    await expect(
      readFile(
        Buffer.from(
          "OS\n" + Array.from({ length: 1001 }, (_, i) => i).join("\n"),
        ),
        "a.csv",
        {},
      ),
    ).rejects.toThrow("1.000");
  });
});
describe("Importação revisada, repetição e reversão", () => {
  it("protege APIs contra ausência de sessão, visualizador e técnico", async () => {
    expect((await request(app).get("/api/imports")).status).toBe(401);
    expect((await call("get", "/imports", undefined, viewer)).status).toBe(403);
    expect((await call("get", "/imports", undefined, tech)).status).toBe(403);
  });
  it("prévia não grava dados e não permite aplicação sem confirmação", async () => {
    first = await upload([row("00001234"), row("00001234")]);
    const p = await preview(first.id);
    expect(p.counts).toEqual({ CREATE: 1, DUPLICATE: 1 });
    expect(await db.equipment.findUnique({ where: { id: gear } })).toBeNull();
    expect(
      (await call("post", "/imports/" + first.id + "/process", {})).status,
    ).toBe(409);
  });
  it("aplica uma vez, preserva número SAP, data e auditoria", async () => {
    const result = await apply(first.id);
    expect(result.counts).toMatchObject({ created: 1, duplicates: 1 });
    const link = await db.externalRecord.findFirstOrThrow({
      where: { scope: tag, externalKey: "00001234" },
    });
    const o = await db.maintenanceOrder.findUniqueOrThrow({
      where: { id: link.entityId },
    });
    expect(o.sapReference).toBe("00001234");
    expect(o.scheduledAt?.toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(o.openedAt).toBeNull();
    expect(
      (await db.equipment.findUniqueOrThrow({ where: { id: gear } })).status,
    ).toBe("UNKNOWN");
    expect(
      (await call("post", "/imports/" + first.id + "/process", {})).body.counts,
    ).toEqual(result.counts);
    expect(await db.orderHistory.count({ where: { orderId: o.id } })).toBe(1);
    expect(
      (await db.importBatch.findUniqueOrThrow({ where: { id: first.id } }))
        .payload,
    ).toEqual({ completed: true });
  });
  it("reimportação diária não duplica nem incrementa versão", async () => {
    const batch = await upload([row("00001234")]);
    expect(batch.previousIdenticalFile).toBeNull();
    expect((await preview(batch.id)).counts.SKIP).toBe(1);
    expect((await apply(batch.id)).counts.unchanged).toBe(1);
    expect(await db.externalRecord.count({ where: { scope: tag } })).toBe(1);
  });
  it("outro layout da mesma base reconhece o mesmo número", async () => {
    const s = await call("post", "/imports/sources", {
      name: tag + "-outro",
      system: "SAP",
      scope: tag,
      target: "ORDERS",
      isDemo: true,
    });
    sources.push(s.body.id);
    const b = await upload([row("00001234")], s.body.id);
    expect((await preview(b.id)).counts.SKIP).toBe(1);
    await apply(b.id);
    expect(await db.externalRecord.count({ where: { scope: tag } })).toBe(1);
  });
  it("atualiza registro existente com antes/depois e permite desfazer atualização", async () => {
    update = await upload([row("00001234", "Descrição revisada")]);
    const p = await preview(update.id);
    expect(p.counts.UPDATE).toBe(1);
    expect(p.rows[0].changes).toContainEqual({
      field: "description",
      before: "Teste fictício",
      after: "Descrição revisada",
    });
    await apply(update.id);
    const detail = (
      await call("get", "/imports/" + update.id + "/undo-preview")
    ).body;
    expect(detail.canUndo).toBe(true);
    expect(
      (
        await call("post", "/imports/" + update.id + "/undo", {
          confirmation: "DESFAZER",
        })
      ).body.status,
    ).toBe("REVERTED");
    const link = await db.externalRecord.findFirstOrThrow({
      where: { scope: tag },
    });
    expect(
      (
        await db.maintenanceOrder.findUniqueOrThrow({
          where: { id: link.entityId },
        })
      ).description,
    ).toBe("Teste fictício");
  });
  it("edição local é preservada e conflito exige revisão explícita", async () => {
    const link = await db.externalRecord.findFirstOrThrow({
      where: { scope: tag },
    });
    let o = await db.maintenanceOrder.findUniqueOrThrow({
      where: { id: link.entityId },
    });
    const r = await call("patch", "/orders/" + o.id, {
      version: o.version,
      description: "Edição local do planejador",
      changeNote: "Teste de proteção",
    });
    expect(r.status).toBe(200);
    const b = await upload([row("00001234", "Mudança do SAP")]);
    expect((await preview(b.id)).counts.CONFLICT).toBe(1);
    expect(
      (
        await call("post", "/imports/" + b.id + "/confirm", {
          confirmation: "IMPORTAR",
          acceptValidOnly: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (await preview(b.id, { ...options, allowOverwriteModified: true })).counts
        .UPDATE,
    ).toBe(1);
  });
  it("chaves divergentes e datas inválidas geram erros consultáveis", async () => {
    const b = await upload([
      row("00005678", "A"),
      row("00005678", "B"),
      row("00009999", "Data", "31/02/2026 08:00"),
      row("00007777"),
    ]);
    const p = await preview(b.id);
    expect(p.counts).toMatchObject({ CONFLICT: 2, INVALID: 1, CREATE: 1 });
    expect(
      (
        await call("post", "/imports/" + b.id + "/confirm", {
          confirmation: "IMPORTAR",
          acceptValidOnly: false,
        })
      ).status,
    ).toBe(400);
    const result = await apply(b.id, true);
    expect(result.status).toBe("PARTIAL");
    expect(result.counts).toMatchObject({ created: 1, errors: 3 });
    const csv = await call("get", "/imports/" + b.id + "/errors.csv");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("calendário");
    expect(
      (await call("get", "/imports/" + b.id + "/undo-preview")).body.canUndo,
    ).toBe(true);
    expect(
      (
        await call("post", "/imports/" + b.id + "/undo", {
          confirmation: "DESFAZER",
        })
      ).body.status,
    ).toBe("REVERTED");
  });
  it("prévia fica inválida quando registro muda antes da confirmação", async () => {
    const b = await upload([row("00001234", "Outro texto SAP")]);
    await preview(b.id, { ...options, allowOverwriteModified: true });
    const link = await db.externalRecord.findFirstOrThrow({
        where: { scope: tag },
      }),
      o = await db.maintenanceOrder.findUniqueOrThrow({
        where: { id: link.entityId },
      });
    expect(
      (
        await call("patch", "/orders/" + o.id, {
          version: o.version,
          notes: "Nova edição concorrente",
          changeNote: "Teste de concorrência",
        })
      ).status,
    ).toBe(200);
    const result = await apply(b.id);
    expect(result.counts).toMatchObject({ updated: 0, errors: 1 });
    expect(result.status).toBe("PARTIAL");
  });
  it("impede apagar registros alterados depois da importação", async () => {
    const p = await call("get", "/imports/" + first.id + "/undo-preview");
    expect(p.body.canUndo).toBe(false);
    expect(p.body.blockers.join(" ")).toContain("alterado");
    expect(
      (
        await call("post", "/imports/" + first.id + "/undo", {
          confirmation: "DESFAZER",
        })
      ).status,
    ).toBe(409);
  });
  it("retoma trechos e reverte referências sem duplicar", async () => {
    const b = await upload(
      Array.from({ length: 23 }, (_, i) => row("LOTE-" + i)),
    );
    await preview(b.id);
    expect(
      (
        await call("post", "/imports/" + b.id + "/confirm", {
          confirmation: "IMPORTAR",
          acceptValidOnly: false,
        })
      ).status,
    ).toBe(200);
    const chunk = await call("post", "/imports/" + b.id + "/process", {});
    expect(chunk.body.status).toBe("RUNNING");
    expect(chunk.body.processed).toBe(5);
    let r;
    do {
      r = await call("post", "/imports/" + b.id + "/process", {});
      expect(r.status).toBe(200);
    } while (r.body.status === "RUNNING");
    expect(r.body.counts.created).toBe(23);
    do {
      r = await call("post", "/imports/" + b.id + "/undo", {
        confirmation: "DESFAZER",
      });
      expect(r.status).toBe(200);
    } while (r.body.status === "REVERTING");
    expect(r.body.status).toBe("REVERTED");
    expect(await db.externalRecord.count({ where: { scope: tag } })).toBe(1);
  });
  it("arquivos XLSX de exemplo são reais e declaradamente fictícios", async () => {
    const r = await call("get", "/imports/sample/PLANS?format=xlsx");
    expect(r.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    expect(wb.worksheets[0].getCell("A2").text).toContain("DEMO");
  });
});

describe("Outros relatórios autorizados e referências", () => {
  async function sourceFor(target: string) {
    const r = await call("post", "/imports/sources", {
      name: tag + "-" + target,
      scope: tag,
      system: "SAP",
      target,
      isDemo: true,
    });
    expect(r.status).toBe(201);
    sources.push(r.body.id);
    return r.body.id;
  }
  async function mappedBatch(
    sourceId: string,
    text: string,
    map: Record<string, string>,
    opts: any = options,
  ) {
    const upload = await call("post", "/imports/upload", {
      sourceId,
      filename: "ficticio.csv",
      base64: Buffer.from(text).toString("base64"),
    });
    expect(upload.status).toBe(201);
    batches.push(upload.body.id);
    const p = await call("post", "/imports/" + upload.body.id + "/preview", {
      mapping: map,
      options: opts,
      saveMapping: true,
    });
    expect(p.status).toBe(200);
    return { id: upload.body.id, preview: p.body };
  }
  async function undoAll(id: string) {
    let r;
    do {
      r = await call("post", "/imports/" + id + "/undo", {
        confirmation: "DESFAZER",
      });
      expect(r.status).toBe(200);
    } while (r.body.status === "REVERTING");
    expect(r.body.status).toBe("REVERTED");
  }
  it("importa plano, cria referências autorizadas e desfaz todas em ordem segura", async () => {
    const sourceId = await sourceFor("PLANS"),
      equipment = gear + "-PLAN",
      technician = tag + " Técnico novo",
      sector = tag + " Setor novo";
    const b = await mappedBatch(
      sourceId,
      [
        "Chave;Equipamento;Nome;Tipo;Dias;Vencimento;Técnico;Setor",
        `PLAN-001;${equipment};Lubrificação fictícia;LUBRICATION;15;01/12/2026 08:00;${technician};${sector}`,
      ].join("\n"),
      {
        externalKey: "Chave",
        equipmentId: "Equipamento",
        title: "Nome",
        type: "Tipo",
        intervalDays: "Dias",
        nextExecution: "Vencimento",
        technician: "Técnico",
        sector: "Setor",
      },
    );
    expect(b.preview.counts.CREATE).toBe(1);
    await apply(b.id);
    const link = await db.externalRecord.findFirstOrThrow({
      where: { scope: tag, entityType: "PLANS" },
    });
    const p = await db.maintenancePlan.findUniqueOrThrow({
      where: { id: link.entityId },
    });
    expect(p.intervalDays).toBe(15);
    expect(p.type).toBe("LUBRICATION");
    expect(await db.importChange.count({ where: { batchId: b.id } })).toBe(4);
    await undoAll(b.id);
    expect(
      await db.equipment.findUnique({ where: { id: equipment } }),
    ).toBeNull();
    expect(await db.technician.count({ where: { name: technician } })).toBe(0);
    expect(await db.sector.count({ where: { name: sector } })).toBe(0);
  });
  it("importa equipamento com estado não informado e o remove na reversão", async () => {
    const sourceId = await sourceFor("EQUIPMENT"),
      equipment = gear + "-CAD";
    const b = await mappedBatch(
      sourceId,
      `Chave;Equipamento;Nome\nCAD-001;${equipment};Equipamento fictício`,
      { externalKey: "Chave", equipmentId: "Equipamento", name: "Nome" },
    );
    expect(b.preview.counts.CREATE).toBe(1);
    await apply(b.id);
    expect(
      (await db.equipment.findUniqueOrThrow({ where: { id: equipment } }))
        .status,
    ).toBe("UNKNOWN");
    await undoAll(b.id);
  });
  it("importa interrupção e calcula a duração a partir das datas", async () => {
    const sourceId = await sourceFor("INTERRUPTIONS");
    const b = await mappedBatch(
      sourceId,
      `Chave;Equipamento;Início;Fim;Tipo;Motivo\nINT-001;${gear};01/11/2026 08:00;01/11/2026 09:00;UNPLANNED;Motivo informado fictício`,
      {
        externalKey: "Chave",
        equipmentId: "Equipamento",
        startedAt: "Início",
        endedAt: "Fim",
        type: "Tipo",
        reason: "Motivo",
      },
    );
    expect(b.preview.counts.CREATE).toBe(1);
    await apply(b.id);
    const link = await db.externalRecord.findFirstOrThrow({
      where: { scope: tag, entityType: "INTERRUPTIONS" },
    });
    expect(
      (
        await db.interruption.findUniqueOrThrow({
          where: { id: link.entityId },
        })
      ).durationMinutes,
    ).toBe(60);
    await undoAll(b.id);
  });
});

describe("Agenda e reimportação da mesma OS", () => {
  it("expõe conflito de programação na prévia e sincroniza encerramento importado sem inventar data de execução", async () => {
    const link = await db.externalRecord.findFirstOrThrow({
      where: { scope: tag, externalKey: "00001234" },
    });
    const o = await db.maintenanceOrder.findUniqueOrThrow({
      where: { id: link.entityId },
    });
    for (let weekday = 0; weekday < 7; weekday++) {
      const w = await call("post", "/scheduling/work-windows", {
        technicianId: "TEC-1",
        weekday,
        startMinute: 0,
        endMinute: 1440,
        active: true,
      });
      expect(w.status).toBe(201);
      scheduleWindows.push(w.body.id);
    }
    const startsAt = new Date(Date.now() + 86400000).toISOString(),
      endsAt = new Date(Date.now() + 90000000).toISOString();
    const booked = await call("post", "/scheduling/assignments", {
      kind: "ORDER",
      targetId: o.id,
      targetVersion: o.version,
      technicianId: "TEC-1",
      startsAt,
      endsAt,
      notes: "Reserva revisada para teste de reimportação",
      reviewConfirmed: true,
    });
    expect(booked.status).toBe(201);
    scheduleIds.push(booked.body.id);
    const changed = await upload([
      row("00001234", "Nova programação do relatório"),
    ]);
    expect(
      (await preview(changed.id, { ...options, allowOverwriteModified: true }))
        .counts.CONFLICT,
    ).toBe(1);
    const closed = await upload([
      row("00001234", "Encerramento informado", startsAt).replace(
        ";OPEN;",
        ";COMPLETED;",
      ),
    ]);
    expect(
      (await preview(closed.id, { ...options, allowOverwriteModified: true }))
        .counts.UPDATE,
    ).toBe(1);
    await apply(closed.id);
    const a = await db.technicianAssignment.findUniqueOrThrow({
      where: { id: booked.body.id },
    });
    expect(a.status).toBe("CANCELLED");
    expect(a.completedAt).toBeNull();
    expect(
      (await db.maintenanceOrder.findUniqueOrThrow({ where: { id: o.id } }))
        .completedAt,
    ).toBeNull();
  });
});
