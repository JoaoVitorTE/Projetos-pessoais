import { beforeAll, afterAll, it, expect, describe } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
const db = new PrismaClient(),
  app = createApp(db),
  origin = process.env.FRONTEND_ORIGIN!,
  tag = "QA-UX-" + randomUUID().slice(0, 8),
  users: string[] = [],
  technicians: string[] = [];
let admin: string[],
  planner: string[],
  viewer: string[],
  technician: string[],
  preferences: {
    onboardingVersion: number;
    onboardingCompletedAt: Date | null;
  };
function call(
  method: "get" | "post",
  path: string,
  body?: unknown,
  cookie = admin,
) {
  const req = request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);
  return body === undefined ? req : req.send(body);
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
  preferences = await db.user.findUniqueOrThrow({
    where: { email: "viewer@pcm.demo" },
    select: { onboardingVersion: true, onboardingCompletedAt: true },
  });
});
afterAll(async () => {
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.technician.deleteMany({ where: { id: { in: technicians } } });
  if (preferences)
    await db.user.update({
      where: { email: "viewer@pcm.demo" },
      data: preferences,
    });
  await db.$disconnect();
});
describe("Início, treinamento e cadastro guiado", () => {
  it("exige sessão na página inicial e no salvamento do tutorial", async () => {
    expect((await request(app).get("/api/home")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/onboarding")
          .set("Origin", origin)
          .send({ version: 1, action: "COMPLETE" })
      ).status,
    ).toBe(401);
  });
  it("calcula indicadores da página inicial com o banco e fornece links reais de pendências", async () => {
    const r = await call("get", "/home");
    expect(r.status).toBe(200);
    expect(r.body.counts.equipment).toBe(await db.equipment.count());
    expect(r.body.counts.openOrders).toBe(
      await db.maintenanceOrder.count({
        where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      }),
    );
    expect(r.body.counts.alerts).toBe(
      r.body.counts.overdueOrders +
        r.body.counts.overduePlans +
        r.body.counts.stalledServices +
        r.body.counts.scheduleAttention,
    );
    expect(r.body.day.timezone).toBe("America/Sao_Paulo");
    expect(r.body.alerts.length).toBeGreaterThan(0);
    for (const alert of r.body.alerts) {
      expect(["orders", "plans", "third", "scheduling"]).toContain(
        alert.module,
      );
      const table =
        alert.module === "orders"
          ? db.maintenanceOrder
          : alert.module === "plans"
            ? db.maintenancePlan
            : alert.module === "third"
              ? db.thirdPartyService
              : db.technicianAssignment;
      expect(
        await (table as any).count({ where: { id: alert.recordId } }),
      ).toBe(1);
    }
    expect(r.body.setup.users).toBe(
      await db.user.count({ where: { active: true } }),
    );
    expect(JSON.stringify(r.body)).not.toMatch(
      /passwordHash|temporaryPassword|purchaseReference/,
    );
  });
  it("técnico não recebe processos de terceiros, auditoria ou cadastros administrativos", async () => {
    const r = await call("get", "/home", undefined, technician);
    expect(r.status).toBe(200);
    expect(r.body.setup).toBeNull();
    expect(r.body.counts.thirdPartyOpen).toBeNull();
    expect(r.body.recentActivity).toEqual([]);
    expect(r.body.alerts.every((a: any) => a.module !== "third")).toBe(true);
  });
  it("visualizador consulta indicadores e planejador recebe apenas contagens de configuração permitidas", async () => {
    const view = await call("get", "/home", undefined, viewer),
      plan = await call("get", "/home", undefined, planner);
    expect(view.status).toBe(200);
    expect(view.body.setup).toBeNull();
    expect(view.body.recentActivity).toEqual([]);
    expect(plan.body.setup.users).toBeNull();
    expect(plan.body.setup.sectors).toBeGreaterThan(0);
  });
  it("persiste o tutorial somente no próprio usuário e preserva a primeira conclusão", async () => {
    let r = await call(
      "post",
      "/onboarding",
      { version: 1, action: "COMPLETE" },
      viewer,
    );
    expect(r.status).toBe(200);
    expect(r.body.onboardingVersion).toBe(1);
    const completed = r.body.onboardingCompletedAt;
    expect(completed).toBeTruthy();
    r = await call(
      "post",
      "/onboarding",
      { version: 1, action: "COMPLETE" },
      viewer,
    );
    expect(r.body.onboardingCompletedAt).toBe(completed);
    r = await call(
      "post",
      "/onboarding",
      { version: 1, action: "DISMISS" },
      viewer,
    );
    expect(r.body.onboardingCompletedAt).toBe(completed);
    const me = await call("get", "/auth/me", undefined, viewer);
    expect(me.body.onboardingVersion).toBe(1);
    const log = await db.auditLog.findFirst({
      where: {
        user: { email: "viewer@pcm.demo" },
        action: "ONBOARDING_COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toBeTruthy();
  });
  it("valida versão, ação, tentativa de escolher outro usuário e origem", async () => {
    for (const body of [
      { version: 2, action: "COMPLETE" },
      { version: 1, action: "DELETE" },
      { version: 1, action: "COMPLETE", userId: "USER-DEMO-ADMIN" },
    ])
      expect((await call("post", "/onboarding", body, viewer)).status).toBe(
        400,
      );
    expect(
      (
        await request(app)
          .post("/api/onboarding")
          .set("Cookie", viewer)
          .set("Origin", "https://untrusted.example")
          .send({ version: 1, action: "COMPLETE" })
      ).status,
    ).toBe(403);
  });
  it("administrador cria conta e técnico em uma transação com histórico e senha temporária", async () => {
    const r = await call("post", "/admin/users", {
      name: tag + " Pessoa",
      email: tag.toLowerCase() + "@example.test",
      role: "TECHNICIAN",
      active: true,
      technicianId: null,
      newTechnician: { name: tag + " Pessoa", specialty: "Elétrica de teste" },
    });
    expect(r.status).toBe(201);
    users.push(r.body.user.id);
    technicians.push(r.body.user.technicianId);
    expect(r.body.temporaryPassword.length).toBeGreaterThanOrEqual(20);
    expect(r.body.user.mustChangePassword).toBe(true);
    const tech = await db.technician.findUniqueOrThrow({
      where: { id: r.body.user.technicianId },
    });
    expect(tech.specialty).toBe("Elétrica de teste");
    expect(tech.isDemo).toBe(true);
    const logs = await db.auditLog.findMany({
      where: {
        action: { in: ["USER_CREATED", "TECHNICIAN_CREATED"] },
        createdAt: { gte: new Date(Date.now() - 10000) },
      },
    });
    expect(logs.some((l) => JSON.stringify(l).includes(tech.id))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(r.body.temporaryPassword);
    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: r.body.user.email, password: r.body.temporaryPassword });
    expect(login.status).toBe(200);
    expect(
      (
        await call(
          "get",
          "/home",
          undefined,
          login.headers["set-cookie"] as unknown as string[],
        )
      ).status,
    ).toBe(403);
  });
  it("reverte o técnico e a auditoria se o e-mail já existir", async () => {
    const before = await db.technician.count(),
      logs = await db.auditLog.count();
    const r = await call("post", "/admin/users", {
      name: tag + " Repetido",
      email: "admin@pcm.demo",
      role: "TECHNICIAN",
      active: true,
      technicianId: null,
      newTechnician: {
        name: tag + " Repetido",
        specialty: "Mecânica de teste",
      },
    });
    expect(r.status).toBe(409);
    expect(await db.technician.count()).toBe(before);
    expect(await db.auditLog.count()).toBe(logs);
  });
  it("rejeita vínculos ambíguos e criação de contas por planejadores", async () => {
    const body = {
      name: tag + " Pessoa",
      email: tag.toLowerCase() + "-other@example.test",
      role: "TECHNICIAN",
      active: true,
      technicianId: "TEC-1",
      newTechnician: { name: tag + " Pessoa", specialty: "Teste" },
    };
    expect((await call("post", "/admin/users", body)).status).toBe(400);
    expect((await call("post", "/admin/users", body, planner)).status).toBe(
      403,
    );
  });
  it("permite a origem antiga apenas quando configurada explicitamente, bloqueando subdomínios não autorizados", async () => {
    const previous = process.env.ADDITIONAL_FRONTEND_ORIGINS;
    process.env.ADDITIONAL_FRONTEND_ORIGINS = "https://legacy-pcm.example";
    const dualApp = createApp(db);
    if (previous === undefined) delete process.env.ADDITIONAL_FRONTEND_ORIGINS;
    else process.env.ADDITIONAL_FRONTEND_ORIGINS = previous;
    expect(
      (
        await request(dualApp)
          .post("/api/onboarding")
          .set("Origin", "https://legacy-pcm.example")
          .set("Cookie", viewer)
          .send({ version: 1, action: "DISMISS" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(dualApp)
          .post("/api/onboarding")
          .set("Origin", "https://evil.legacy-pcm.example")
          .set("Cookie", viewer)
          .send({ version: 1, action: "DISMISS" })
      ).status,
    ).toBe(403);
  });
});
