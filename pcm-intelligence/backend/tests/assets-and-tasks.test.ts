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
  tag = "QA-ASSET-" + randomUUID().slice(0, 8).toUpperCase();
let admin: string[],
  planner: string[],
  viewer: string[],
  technician: string[],
  a: any,
  b: any,
  legacy: any,
  source: any,
  equipmentSource: any,
  sectors: any[],
  techName: string,
  oldTasks: any;
const gear: string[] = [],
  plans: string[] = [],
  orders: string[] = [],
  stops: string[] = [],
  sources: string[] = [],
  batches: string[] = [];
function call(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  body?: unknown,
  cookie = admin,
) {
  const r = request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);
  return body === undefined ? r : r.send(body);
}
async function createEquipment(
  sectorId: string,
  tagValue = "0011",
  extra: any = {},
) {
  const r = await call("post", "/equipment", {
    tag: tagValue,
    name: tag + " Equipamento",
    sectorId,
    criticality: 2,
    status: "UNKNOWN",
    ...extra,
  });
  if (r.status === 201) gear.push(r.body.id);
  return r;
}
async function equipment(id: string) {
  return db.equipment.findUniqueOrThrow({ where: { id } });
}
async function upload(sourceId: string, csv: string) {
  const r = await call("post", "/imports/upload", {
    sourceId,
    filename: "dados-ficticios.csv",
    base64: Buffer.from(csv).toString("base64"),
  });
  expect(r.status).toBe(201);
  batches.push(r.body.id);
  return r.body;
}
async function preview(id: string, mapping: any, options: any = {}) {
  return call("post", "/imports/" + id + "/preview", {
    mapping,
    options: { createReferences: false, ...options },
    saveMapping: true,
  });
}
async function apply(id: string) {
  expect(
    (
      await call("post", "/imports/" + id + "/confirm", {
        confirmation: "IMPORTAR",
        acceptValidOnly: false,
      })
    ).status,
  ).toBe(200);
  let r: any;
  do {
    r = await call("post", "/imports/" + id + "/process", {});
    expect(r.status).toBe(200);
  } while (r.body.status === "RUNNING");
  return r.body;
}
async function undo(id: string) {
  let r: any;
  do {
    r = await call("post", "/imports/" + id + "/undo", {
      confirmation: "DESFAZER",
    });
    expect(r.status).toBe(200);
  } while (r.body.status === "REVERTING");
  return r.body;
}
const mapping = {
  externalKey: "Plano",
  equipmentId: "TAG",
  sector: "Setor",
  title: "Nome",
  type: "Tipo",
  intervalDays: "Dias",
  nextExecution: "Vencimento",
  technician: "Técnico",
  taskListReference: "Lista",
  taskCode: "Operação",
  taskDescription: "Tarefa",
  estimatedMinutes: "Minutos",
};
function planCsv(change = false) {
  const date =
    new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10) +
    "T08:00:00Z";
  const line = (
    key: string,
    sector: any,
    type: string,
    code: string,
    description: string,
  ) =>
    [
      key,
      "0011",
      sector.name,
      "Plano fictício " + key,
      type,
      "30",
      date,
      techName,
      "LISTA-" + key,
      code,
      description,
      "15",
    ].join(";");
  return [
    "Plano;TAG;Setor;Nome;Tipo;Dias;Vencimento;Técnico;Lista;Operação;Tarefa;Minutos",
    line(
      "P-A",
      sectors[0],
      "PREVENTIVE",
      "0010",
      change ? "Inspeção revisada fictícia" : "Inspeção fictícia",
    ),
    line("P-A", sectors[0], "PREVENTIVE", "0020", "Conferência fictícia"),
    line("P-B", sectors[1], "LUBRICATION", "0010", "Lubrificação fictícia"),
  ].join("\r\n");
}
beforeAll(async () => {
  await db.loginThrottle.deleteMany();
  [admin, planner, viewer, technician] = await Promise.all(
    ["admin", "planner", "viewer", "technician"].map(
      async (role) =>
        (
          await request(app)
            .post("/api/auth/login")
            .set("Origin", origin)
            .send({
              email: role + "@pcm.demo",
              password: process.env.SEED_PASSWORD,
            })
        ).headers["set-cookie"] as unknown as string[],
    ),
  );
  sectors = await db.sector.findMany({
    where: { id: { in: ["SEC-1", "SEC-2"] } },
    orderBy: { id: "asc" },
  });
  techName = (await db.technician.findUniqueOrThrow({ where: { id: "TEC-1" } }))
    .name;
  a = (await createEquipment(sectors[0].id)).body;
  b = (
    await createEquipment(sectors[1].id, "0011", {
      equipmentNumber: "0000" + tag,
    })
  ).body;
  expect(a.id).toBeTruthy();
  expect(b.id).toBeTruthy();
  for (const target of ["PLANS", "EQUIPMENT"]) {
    const r = await call("post", "/imports/sources", {
      name: tag + " " + target,
      system: "GENERIC",
      scope: tag + " " + target,
      target,
      isDemo: true,
    });
    expect(r.status).toBe(201);
    sources.push(r.body.id);
    if (target === "PLANS") source = r.body;
    else equipmentSource = r.body;
  }
});
afterAll(async () => {
  await db.assignmentHistory.deleteMany({
    where: { assignment: { planId: { in: plans } } },
  });
  await db.technicianAssignment.deleteMany({
    where: { planId: { in: plans } },
  });
  await db.maintenanceExecution.deleteMany({
    where: { planId: { in: plans } },
  });
  await db.maintenancePlan.deleteMany({
    where: { OR: [{ id: { in: plans } }, { equipmentId: { in: gear } }] },
  });
  await db.orderHistory.deleteMany({ where: { orderId: { in: orders } } });
  await db.maintenanceOrder.deleteMany({
    where: { equipmentId: { in: gear } },
  });
  await db.interruption.deleteMany({ where: { equipmentId: { in: gear } } });
  await db.externalRecord.deleteMany({ where: { sourceId: { in: sources } } });
  await db.importChange.deleteMany({ where: { batchId: { in: batches } } });
  await db.importBatch.deleteMany({ where: { id: { in: batches } } });
  await db.importSource.deleteMany({ where: { id: { in: sources } } });
  await db.equipment.deleteMany({ where: { id: { in: gear } } });
  await db.$disconnect();
});
describe("TAG por setor, número opcional e exclusão rastreável", () => {
  it("exige TAG, permite o número em branco e preserva zeros e IDs internos separados", async () => {
    expect(a.tag).toBe("0011");
    expect(a.equipmentNumber).toBeNull();
    expect(a.id).not.toBe(a.tag);
    expect(b.equipmentNumber).toBe("0000" + tag);
    for (const value of [undefined, "", "  "])
      expect(
        (await createEquipment(sectors[0].id, value as any, { tag: value }))
          .status,
      ).toBe(400);
  });
  it("permite a mesma TAG em dois setores e bloqueia repetição no mesmo setor", async () => {
    expect(a.sectorId).not.toBe(b.sectorId);
    expect((await createEquipment(sectors[0].id)).status).toBe(409);
    expect((await createEquipment(sectors[1].id, "0011")).status).toBe(409);
  });
  it("rejeita número de equipamento repetido e escrita por visualizador", async () => {
    expect(
      (
        await createEquipment(sectors[0].id, "OUTRO-" + tag, {
          equipmentNumber: b.equipmentNumber,
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("post", "/equipment", { tag: "0012" }, viewer)).status,
    ).toBe(403);
  });
  it("pesquisa separadamente TAG e número e apresenta o setor na consulta", async () => {
    let r = await call("get", "/equipment?q=0011");
    expect(
      r.body.items.filter((e: any) => [a.id, b.id].includes(e.id)),
    ).toHaveLength(2);
    r = await call(
      "get",
      "/equipment?q=" + encodeURIComponent(b.equipmentNumber),
    );
    expect(r.body.items.map((e: any) => e.id)).toContain(b.id);
    expect(r.body.items[0].sector.name).toBeTruthy();
  });
  it("bloqueia exclusão sem motivo, por técnico/visualizador e com versão antiga", async () => {
    for (const cookie of [viewer, technician])
      expect(
        (
          await call(
            "delete",
            "/equipment/" + a.id,
            { version: 1, reason: "Teste fictício" },
            cookie,
          )
        ).status,
      ).toBe(403);
    expect(
      (await call("delete", "/equipment/" + a.id, { version: 1, reason: "" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("delete", "/equipment/" + a.id, {
          version: 99,
          reason: "Teste fictício",
        })
      ).status,
    ).toBe(409);
  });
  it("exclui da consulta e dos seletores sem apagar o registro, e restaura com autoria", async () => {
    const removed = await call(
      "delete",
      "/equipment/" + a.id,
      { version: a.version, reason: "Cadastro fictício incorreto" },
      planner,
    );
    expect(removed.status).toBe(200);
    expect(removed.body.deletedAt).toBeTruthy();
    expect((await equipment(a.id)).deletedAt).toBeTruthy();
    expect((await call("get", "/equipment?q=" + a.id)).body.items).toEqual([]);
    expect(
      (await call("get", "/lookups")).body.equipment.some(
        (e: any) => e.id === a.id,
      ),
    ).toBe(false);
    expect(
      (await call("get", "/equipment?deleted=true&q=" + a.id)).body.items,
    ).toHaveLength(1);
    expect((await createEquipment(sectors[0].id)).body.error).toContain(
      "restaurar",
    );
    const restored = await call(
      "post",
      "/equipment/" + a.id + "/restore",
      { version: removed.body.version, reason: "Cadastro fictício conferido" },
      planner,
    );
    expect(restored.status).toBe(200);
    a = restored.body;
    const history = await call("get", "/equipment/" + a.id + "/history");
    expect(
      history.body.some(
        (r: any) =>
          r.action === "EQUIPMENT_DELETED" && r.user.name && r.metadata.reason,
      ),
    ).toBe(true);
    expect(
      history.body.some((r: any) => r.action === "EQUIPMENT_RESTORED"),
    ).toBe(true);
  });
  it("impede novas ordens em equipamento excluído", async () => {
    const removed = await call("delete", "/equipment/" + b.id, {
      version: b.version,
      reason: "Teste fictício",
    });
    expect(removed.status).toBe(200);
    const r = await call("post", "/orders", {
      equipmentId: b.id,
      technicianId: null,
      type: "CORRECTIVE",
      description: "Ordem fictícia",
      priority: 1,
      scheduledAt: null,
      notes: null,
      sapReference: null,
    });
    expect(r.status).toBe(409);
    const other = await call("post", "/orders", {
      equipmentId: a.id,
      technicianId: null,
      type: "CORRECTIVE",
      description: "Ordem fictícia para verificar edição",
      priority: 1,
      scheduledAt: null,
      notes: null,
      sapReference: null,
    });
    expect(other.status).toBe(201);
    orders.push(other.body.id);
    expect(
      (
        await call("patch", "/orders/" + other.body.id, {
          version: other.body.version,
          equipmentId: b.id,
          changeNote: "Tentativa de atribuição a cadastro excluído",
        })
      ).status,
    ).toBe(409);
    await db.maintenanceOrder.update({
      where: { id: other.body.id },
      data: { status: "CANCELLED" },
    });
    b = (
      await call("post", "/equipment/" + b.id + "/restore", {
        version: removed.body.version,
        reason: "Restaurado no teste",
      })
    ).body;
  });
  it("preserva o histórico de interrupções encerradas ao excluir", async () => {
    const r = await call("post", "/interruptions", {
      equipmentId: b.id,
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      endedAt: new Date(Date.now() - 3600000).toISOString(),
      type: "UNPLANNED",
      reason: "Motivo fictício",
      description: "Registro fictício para histórico",
    });
    expect(r.status).toBe(201);
    stops.push(r.body.id);
    const removed = await call("delete", "/equipment/" + b.id, {
      version: b.version,
      reason: "Teste de histórico",
    });
    expect(removed.status).toBe(200);
    expect(await db.interruption.count({ where: { id: r.body.id } })).toBe(1);
    b = (
      await call("post", "/equipment/" + b.id + "/restore", {
        version: removed.body.version,
        reason: "Restaurado no teste",
      })
    ).body;
  });
  it("bloqueia exclusão com OS aberta e torna a operação em lote atômica", async () => {
    const r = await call("post", "/orders", {
      equipmentId: b.id,
      technicianId: null,
      type: "CORRECTIVE",
      description: "Ordem fictícia em aberto",
      priority: 1,
      scheduledAt: null,
      notes: null,
      sapReference: null,
    });
    expect(r.status).toBe(201);
    orders.push(r.body.id);
    const result = await call("post", "/equipment/bulk-delete", {
      items: [
        { id: a.id, version: a.version },
        { id: b.id, version: b.version },
      ],
      reason: "Limpeza fictícia em lote",
    });
    expect(result.status).toBe(409);
    expect((await equipment(a.id)).deletedAt).toBeNull();
    expect((await equipment(a.id)).version).toBe(a.version);
    await db.maintenanceOrder.update({
      where: { id: r.body.id },
      data: { status: "CANCELLED" },
    });
  });
});
describe("Planos mistos e operações agrupadas com importação repetível", () => {
  it("informa ambiguidade de TAG quando o setor não foi mapeado", async () => {
    const file = await upload(source.id, planCsv());
    const { sector, ...withoutSector } = mapping;
    const r = await preview(file.id, withoutSector);
    expect(r.status).toBe(200);
    expect(r.body.counts.INVALID).toBeGreaterThan(0);
    expect(r.body.rows.some((r: any) => r.reason?.includes("ambígua"))).toBe(
      true,
    );
  });
  it("importa preventiva e lubrificação no mesmo CSV, agrupando todas as tarefas", async () => {
    const file = await upload(source.id, planCsv());
    const r = await preview(file.id, mapping);
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({ CREATE: 2, GROUPED: 1 });
    const result = await apply(file.id);
    expect(result.counts.created).toBe(2);
    expect(result.counts.grouped).toBe(1);
    const links = await db.externalRecord.findMany({
      where: { sourceId: source.id },
    });
    plans.push(...links.map((l) => l.entityId));
    const rows = await db.maintenancePlan.findMany({
      where: { id: { in: plans } },
      orderBy: { type: "asc" },
    });
    expect(rows.map((r) => r.type).sort()).toEqual([
      "LUBRICATION",
      "PREVENTIVE",
    ]);
    const preventive = rows.find((r) => r.type === "PREVENTIVE")!;
    expect(preventive.equipmentId).toBe(a.id);
    expect(preventive.tasks).toHaveLength(2);
    expect(preventive.taskListReference).toBe("LISTA-P-A");
    expect(rows.find((r) => r.type === "LUBRICATION")!.equipmentId).toBe(b.id);
    oldTasks = preventive.tasks;
  });
  it("a mesma planilha não duplica planos nem tarefas ou incrementa versões", async () => {
    const before = await db.maintenancePlan.findMany({
      where: { id: { in: plans } },
    });
    const file = await upload(source.id, planCsv());
    const r = await preview(file.id, mapping);
    expect(r.body.counts).toEqual({ SKIP: 2, GROUPED: 1 });
    await apply(file.id);
    expect(
      await db.maintenancePlan.findMany({ where: { id: { in: plans } } }),
    ).toEqual(before);
  });
  it("mostra alterações na lista de tarefas e permite desfazer a atualização", async () => {
    const file = await upload(source.id, planCsv(true));
    const r = await preview(file.id, mapping);
    expect(
      r.body.rows.some((r: any) =>
        r.changes?.some((c: any) => c.field === "tasks"),
      ),
    ).toBe(true);
    await apply(file.id);
    expect(
      JSON.stringify(
        (
          await db.maintenancePlan.findFirstOrThrow({
            where: { id: { in: plans }, type: "PREVENTIVE" },
          })
        ).tasks,
      ),
    ).toContain("revisada");
    await undo(file.id);
    expect(
      (
        await db.maintenancePlan.findFirstOrThrow({
          where: { id: { in: plans }, type: "PREVENTIVE" },
        })
      ).tasks,
    ).toEqual(oldTasks);
  });
  it("rejeita operações com mesmo código e conteúdo divergente sem alterar o plano", async () => {
    const file = await upload(
      source.id,
      planCsv().replace(
        ";0020;Conferência fictícia;",
        ";0010;Outra instrução fictícia;",
      ),
    );
    const r = await preview(file.id, mapping);
    expect(r.body.counts.INVALID).toBe(2);
    expect(
      r.body.rows.some((r: any) =>
        r.reason?.includes("Código de tarefa repetido"),
      ),
    ).toBe(true);
  });
  it("rejeita dados de plano conflitantes entre as linhas de tarefas", async () => {
    const file = await upload(
      source.id,
      planCsv()
        .replace("Conferência fictícia", "Conferência fictícia")
        .replace(";0020;", ";0020;")
        .split("\r\n")
        .map((line, i) => (i === 2 ? line.replace(";30;", ";90;") : line))
        .join("\r\n"),
    );
    const r = await preview(file.id, mapping);
    expect(r.body.counts.INVALID).toBe(2);
  });
  it("exige dados completos de tarefa e duração numérica em minutos", async () => {
    const file = await upload(
      source.id,
      planCsv().replace(";0010;Inspeção fictícia;15", ";0010;;15"),
    );
    const r = await preview(file.id, mapping);
    expect(r.body.counts.INVALID).toBe(2);
    const file2 = await upload(
      source.id,
      planCsv().replace(";Inspeção fictícia;15", ";Inspeção fictícia;abc"),
    );
    expect((await preview(file2.id, mapping)).body.counts.INVALID).toBe(2);
  });
  it("bloqueia exclusão de equipamento com plano ativo", async () => {
    const r = await call("delete", "/equipment/" + a.id, {
      version: (await equipment(a.id)).version,
      reason: "Teste de bloqueio",
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("planos ativos");
  });
  it("mantém uma prévia limitada para listas com muitas operações sem multiplicar o conteúdo", async () => {
    const lines = planCsv().split("\r\n"),
      base = lines[1].split(";");
    const csv = [
      lines[0],
      ...Array.from({ length: 150 }, (_, i) => {
        const row = [...base];
        row[9] = String(i + 1).padStart(4, "0");
        row[10] = "Operação fictícia " + i + " " + "x".repeat(600);
        return row.join(";");
      }),
    ].join("\r\n");
    const file = await upload(source.id, csv),
      r = await preview(file.id, mapping);
    expect(r.status).toBe(200);
    expect(r.body.counts.UPDATE).toBe(1);
    expect(r.body.counts.GROUPED).toBe(149);
    const batch = await db.importBatch.findUniqueOrThrow({
      where: { id: file.id },
    });
    expect(Buffer.byteLength(JSON.stringify(batch.payload))).toBeLessThan(
      800000,
    );
    expect((batch.payload as any).rows[0].data.tasks).toHaveLength(150);
  });
});
describe("Importação de equipamentos com TAG e número separados", () => {
  it("atualiza o cadastro antigo sem trocar o ID, e aceita um novo registro sem número", async () => {
    legacy = await db.equipment.create({
      data: {
        id: tag + "-LEGACY",
        name: "Cadastro anterior fictício",
        sectorId: sectors[0].id,
        criticality: 2,
        status: "UNKNOWN",
        isDemo: true,
      },
    });
    gear.push(legacy.id);
    await db.externalRecord.create({
      data: {
        sourceId: equipmentSource.id,
        scope: equipmentSource.scope,
        entityType: "EQUIPMENT",
        externalKey: "00009000001",
        entityId: legacy.id,
        contentHash: "legacy",
        lastApplied: legacy,
        appliedVersion: 1,
        lastBatchId: "LEGACY-TEST",
      },
    });
    const csv = [
      "TAG;Número;Nome;Setor",
      [
        tag + "-A",
        "00009000001",
        "Cadastro corrigido fictício",
        sectors[0].name,
      ].join(";"),
      [tag + "-B", "", "Cadastro sem número fictício", sectors[1].name].join(
        ";",
      ),
    ].join("\r\n");
    const file = await upload(equipmentSource.id, csv),
      m = {
        externalKey: "Número",
        equipmentId: "TAG",
        equipmentNumber: "Número",
        name: "Nome",
        sector: "Setor",
      };
    const r = await preview(file.id, m, { defaultCriticality: 2 });
    expect(r.body.counts).toEqual({ UPDATE: 1, CREATE: 1 });
    await apply(file.id);
    const fixed = await equipment(legacy.id);
    expect(fixed.tag).toBe(tag + "-A");
    expect(fixed.equipmentNumber).toBe("00009000001");
    const created = await db.equipment.findFirstOrThrow({
      where: { tag: tag + "-B" },
    });
    gear.push(created.id);
    expect(created.equipmentNumber).toBeNull();
    const again = await upload(equipmentSource.id, csv);
    expect(
      (await preview(again.id, m, { defaultCriticality: 2 })).body.counts,
    ).toEqual({ SKIP: 2 });
    await apply(again.id);
  });
  it("aceita a mesma TAG em setores diferentes usando a chave padrão composta", async () => {
    const csv = [
        "TAG;Nome;Setor",
        [tag + "-S", "Cadastro um fictício", sectors[0].name].join(";"),
        [tag + "-S", "Cadastro dois fictício", sectors[1].name].join(";"),
      ].join("\r\n"),
      file = await upload(equipmentSource.id, csv);
    const r = await preview(
      file.id,
      { equipmentId: "TAG", name: "Nome", sector: "Setor" },
      { defaultCriticality: 2 },
    );
    expect(r.body.counts).toEqual({ CREATE: 2 });
    await apply(file.id);
    const created = await db.equipment.findMany({ where: { tag: tag + "-S" } });
    gear.push(...created.map((e) => e.id));
    expect(created).toHaveLength(2);
    expect(created[0].id).not.toBe(created[1].id);
  });
  it("identifica duas linhas tentando criar a mesma TAG no mesmo setor", async () => {
    const csv = [
      "Chave;TAG;Nome;Setor",
      ["A", tag + "-X", "Cadastro um fictício", sectors[0].name].join(";"),
      ["B", tag + "-X", "Cadastro dois fictício", sectors[0].name].join(";"),
    ].join("\r\n");
    const file = await upload(equipmentSource.id, csv);
    expect(
      (
        await preview(
          file.id,
          {
            externalKey: "Chave",
            equipmentId: "TAG",
            name: "Nome",
            sector: "Setor",
          },
          { defaultCriticality: 2 },
        )
      ).body.counts.INVALID,
    ).toBe(2);
  });
  it("ignora apenas colunas finais totalmente vazias e preserva o aviso para o usuário", async () => {
    const r = await readFile(
      Buffer.from("TAG;Setor;\r\n0011;Setor fictício;"),
      "teste.csv",
      {},
    );
    expect(r.headers).toEqual(["TAG", "Setor"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.rows).toEqual([["0011", "Setor fictício"]]);
    await expect(
      readFile(
        Buffer.from("TAG;Setor;\r\n0011;Setor fictício;valor"),
        "teste.csv",
        {},
      ),
    ).rejects.toThrow("sem título");
  });
  it("mantém TAGs numéricas com zeros na leitura XLSX", async () => {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("Equipamentos");
    sheet.addRow(["TAG", "Setor"]);
    sheet.addRow([11, "Setor fictício"]);
    sheet.getCell("A2").numFmt = "0000";
    const r = await readFile(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      "teste.xlsx",
      {},
    );
    expect(r.rows[0][0]).toBe("0011");
  });
});
