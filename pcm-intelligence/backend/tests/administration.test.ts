import { beforeAll, afterAll, it, expect, describe } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
const db = new PrismaClient(),
  app = createApp(db),
  origin = process.env.FRONTEND_ORIGIN!,
  tag = "QA-ADMIN-" + randomUUID().slice(0, 8);
let admin: string[],
  planner: string[],
  viewer: string[],
  tech: any,
  account: any,
  temporary: string,
  sector: any;
const users: string[] = [];
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
  if (path.includes(".xlsx"))
    r.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => done(null, Buffer.concat(chunks)));
      res.on("error", done);
    });
  return body === undefined ? r : r.send(body);
}
async function login(email: string, password = process.env.SEED_PASSWORD!) {
  return request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
}
beforeAll(async () => {
  await db.loginThrottle.deleteMany();
  [admin, planner, viewer] = await Promise.all(
    ["admin", "planner", "viewer"].map(
      async (role) =>
        (await login(role + "@pcm.demo")).headers[
          "set-cookie"
        ] as unknown as string[],
    ),
  );
});
afterAll(async () => {
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.auditLog.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (tech) await db.technician.deleteMany({ where: { id: tech.id } });
  if (sector) await db.sector.deleteMany({ where: { id: sector.id } });
  await db.$disconnect();
});
describe("Cadastros, permissões e rastreabilidade", () => {
  it("planejador cadastra setor e técnico sem poder criar contas", async () => {
    sector = (
      await call("post", "/admin/sectors", { name: tag + " Setor" }, planner)
    ).body;
    const r = await call(
      "post",
      "/admin/technicians",
      { name: tag + " Técnico", specialty: "Mecânica de teste", active: true },
      planner,
    );
    expect(r.status).toBe(201);
    tech = r.body;
    expect((await call("post", "/admin/users", {}, planner)).status).toBe(403);
    expect((await call("post", "/admin/technicians", {}, viewer)).status).toBe(
      403,
    );
  });
  it("remove cadastros livres e bloqueia vínculos e papéis indevidos", async () => {
    const createdSector = await call(
      "post",
      "/admin/sectors",
      { name: tag + " Removível" },
      planner,
    );
    expect(createdSector.status).toBe(201);
    const sectorPath = "/admin/sectors/" + createdSector.body.id;
    expect((await call("delete", sectorPath, undefined, viewer)).status).toBe(
      403,
    );
    const equipment = await call(
      "post",
      "/equipment",
      {
        tag: tag + "-EX",
        name: "Equipamento de teste",
        sectorId: createdSector.body.id,
        criticality: 2,
        status: "UNKNOWN",
      },
      planner,
    );
    expect(equipment.status).toBe(201);
    try {
      const blocked = await call("delete", sectorPath, undefined, planner);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toContain("equipamento");
    } finally {
      await db.equipment.delete({ where: { id: equipment.body.id } });
    }
    expect((await call("delete", sectorPath, undefined, planner)).body).toEqual(
      { outcome: "deleted" },
    );

    const createdTech = await call(
      "post",
      "/admin/technicians",
      {
        name: tag + " Desvinculado",
        specialty: "Inspeção de teste",
        active: true,
      },
      planner,
    );
    expect(createdTech.status).toBe(201);
    expect(
      (
        await call(
          "delete",
          "/admin/technicians/" + createdTech.body.id,
          undefined,
          planner,
        )
      ).body,
    ).toEqual({ outcome: "deleted" });

    const created = await call("post", "/admin/users", {
      name: tag + " Conta removível",
      email: tag.toLowerCase() + "-removal@example.test",
      active: true,
      role: "VIEWER",
      technicianId: null,
    });
    expect(created.status).toBe(201);
    users.push(created.body.user.id);
    const accountPath = "/admin/users/" + created.body.user.id;
    expect((await call("delete", accountPath, undefined, planner)).status).toBe(
      403,
    );
    expect((await call("delete", accountPath)).body).toEqual({
      outcome: "deleted",
    });
    expect(
      await db.user.findUnique({ where: { id: created.body.user.id } }),
    ).toBeNull();
  });
  it("desativa uma conta com histórico e preserva a autoria", async () => {
    const created = await call("post", "/admin/users", {
      name: tag + " Conta histórica",
      email: tag.toLowerCase() + "-history@example.test",
      active: true,
      role: "VIEWER",
      technicianId: null,
    });
    expect(created.status).toBe(201);
    const id = created.body.user.id;
    users.push(id);
    const event = await db.auditLog.create({
      data: {
        userId: id,
        action: "TEST_ACTIVITY",
        entity: "User",
        metadata: {},
      },
    });
    expect((await call("delete", "/admin/users/" + id)).body).toEqual({
      outcome: "deactivated",
    });
    expect((await db.user.findUniqueOrThrow({ where: { id } })).active).toBe(
      false,
    );
    expect(
      (await db.auditLog.findUniqueOrThrow({ where: { id: event.id } })).userId,
    ).toBe(id);
  });
  it("renomeia e remove configurações de importação e requisitos documentais", async () => {
    const source = await call(
      "post",
      "/imports/sources",
      {
        name: tag + " Origem",
        system: "GENERIC",
        scope: tag,
        target: "EQUIPMENT",
        isDemo: true,
      },
      planner,
    );
    expect(source.status).toBe(201);
    const sourcePath = "/imports/sources/" + source.body.id;
    expect(
      (await call("patch", sourcePath, { name: tag + " Revisada" }, planner))
        .body,
    ).toMatchObject({ name: tag + " Revisada", scope: tag });
    expect((await call("delete", sourcePath, undefined, viewer)).status).toBe(
      403,
    );
    expect((await call("delete", sourcePath, undefined, planner)).body).toEqual(
      { outcome: "deleted" },
    );

    const requirement = await call("post", "/document-requirements", {
      name: tag + " Requisito",
    });
    expect(requirement.status).toBe(201);
    const path = "/document-requirements/" + requirement.body.id;
    expect(
      (await call("patch", path, { name: tag + " Documento" })).body,
    ).toMatchObject({ name: tag + " Documento", active: true });
    expect((await call("delete", path, undefined, planner)).status).toBe(403);
    expect((await call("delete", path)).body).toEqual({ outcome: "deleted" });
  });
  it("cria usuário com senha temporária sem expor o hash", async () => {
    const r = await call("post", "/admin/users", {
      name: tag + " Usuário",
      email: tag.toLowerCase() + "@example.test",
      role: "TECHNICIAN",
      technicianId: tech.id,
      active: true,
    });
    expect(r.status).toBe(201);
    account = r.body.user;
    temporary = r.body.temporaryPassword;
    users.push(account.id);
    expect(temporary.length).toBeGreaterThanOrEqual(20);
    expect(account.mustChangePassword).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");
    expect((await login(account.email, temporary)).status).toBe(200);
  });
  it("senha temporária só permite a troca de senha e não os módulos", async () => {
    const cookie = (await login(account.email, temporary)).headers[
      "set-cookie"
    ] as unknown as string[];
    expect((await call("get", "/equipment", undefined, cookie)).status).toBe(
      403,
    );
    expect((await call("get", "/auth/me", undefined, cookie)).status).toBe(200);
  });
  it("desativação revoga sessões e bloqueia novo acesso", async () => {
    const r = await call("patch", "/admin/users/" + account.id, {
      name: account.name,
      email: account.email,
      role: account.role,
      technicianId: tech.id,
      active: false,
    });
    expect(r.status).toBe(200);
    expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
    expect((await login(account.email, temporary)).status).toBe(401);
  });
  it("redefinição gera outra senha e não registra segredos na auditoria", async () => {
    const r = await call(
      "post",
      "/admin/users/" + account.id + "/reset-password",
    );
    expect(r.status).toBe(200);
    expect(r.body.temporaryPassword).not.toBe(temporary);
    const logs = await db.auditLog.findMany({
      where: {
        entity: "User",
        metadata: { path: ["after", "id"], equals: account.id },
      },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(temporary);
    expect(JSON.stringify(logs)).not.toContain("passwordHash");
  });
  it("protege o próprio administrador contra desativação ou perda de perfil", async () => {
    const me = (await call("get", "/auth/me")).body;
    expect(
      (
        await call("patch", "/admin/users/" + me.id, {
          name: me.name,
          email: me.email,
          role: "VIEWER",
          technicianId: null,
          active: false,
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("post", "/admin/users/" + me.id + "/reset-password")).status,
    ).toBe(409);
  });
  it("registra nome, antes/depois e pesquisa paginada por metadados", async () => {
    expect(
      (
        await call("patch", "/admin/technicians/" + tech.id, {
          name: tech.name,
          specialty: "Elétrica de teste",
          active: false,
        })
      ).status,
    ).toBe(200);
    const r = await call("get", "/admin/audit?q=" + encodeURIComponent(tag));
    expect(r.status).toBe(200);
    const log = r.body.items.find(
      (x: any) => x.action === "TECHNICIAN_UPDATED",
    );
    expect(log.userName).toBeTruthy();
    expect(log.metadata.before.specialty).toBe("Mecânica de teste");
    expect(log.metadata.after.specialty).toBe("Elétrica de teste");
    expect((await call("get", "/admin/audit", undefined, planner)).status).toBe(
      403,
    );
  });
});
describe("Relatório e assistente estruturado", () => {
  it("relatório calcula dados do banco e preserva filtros", async () => {
    const r = await call("get", "/reports/preventives?equipmentId=EQ-001");
    expect(r.status).toBe(200);
    expect(r.body.items.every((i: any) => i.equipmentId === "EQ-001")).toBe(
      true,
    );
    expect(r.body.summary.plans).toBe(
      r.body.items.filter((i: any) => i.kind === "Plano").length,
    );
    expect(r.body.executive).toContain(
      "Nenhuma economia financeira foi estimada",
    );
  });
  it("exporta PDF e Excel válidos", async () => {
    const pdf = await call(
      "get",
      "/reports/preventives.pdf?equipmentId=EQ-001",
    );
    expect(pdf.status).toBe(200);
    expect(pdf.body.toString("ascii", 0, 4)).toBe("%PDF");
    const xls = await call(
      "get",
      "/reports/preventives.xlsx?equipmentId=EQ-001",
    );
    expect(xls.status).toBe(200);
    expect(xls.body.toString("ascii", 0, 2)).toBe("PK");
  });
  it("assistente distingue planos vencidos de próximos vencimentos", async () => {
    const upcoming = await call("post", "/assistant/query", {
      question: "Quais preventivas vencem nos próximos sete dias?",
    });
    expect(upcoming.body.intent).toBe("UPCOMING_PLANS");
    const late = await call("post", "/assistant/query", {
      question: "Quais preventivas estão vencidas?",
    });
    expect(late.body.intent).toBe("LATE_PLANS");
    expect(late.body.period.from).toBeNull();
    expect(
      late.body.items.every((i: any) => new Date(i.nextExecution) < new Date()),
    ).toBe(true);
  });
  it("assistente não concede acesso indevido ou inventa respostas", async () => {
    const techLogin = await login("technician@pcm.demo");
    expect(
      (
        await call(
          "post",
          "/assistant/query",
          { question: "Serviços de terceiros pendentes" },
          techLogin.headers["set-cookie"] as unknown as string[],
        )
      ).status,
    ).toBe(403);
    const r = await call("post", "/assistant/query", {
      question: "Qual a probabilidade de quebrar a máquina?",
    });
    expect(r.body.intent).toBe("HELP");
    expect(r.body.items).toEqual([]);
  });
  it("alertas oferecem evidências e consulta somente de leitura", async () => {
    const r = await call("get", "/alerts");
    expect(r.status).toBe(200);
    expect(r.body.period.asOf).toBeTruthy();
    expect(
      r.body.items.every((i: any) => i.kind === "FACT" && i.evidence),
    ).toBe(true);
  });
});
