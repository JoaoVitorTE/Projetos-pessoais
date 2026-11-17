import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
const db = new PrismaClient();
const app = createApp(db);
const origin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
let admin: string[], viewer: string[];
async function login(email: string) {
  const r = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password: process.env.SEED_PASSWORD });
  expect(r.status).toBe(200);
  expect(JSON.stringify(r.body)).not.toContain("passwordHash");
  return r.headers["set-cookie"] as unknown as string[];
}
beforeAll(async () => {
  if (process.env.DATA_MODE !== "demo" || !process.env.SEED_PASSWORD)
    throw new Error("Testes exigem banco demo preparado e SEED_PASSWORD");
  await db.$connect();
  await db.loginThrottle.deleteMany();
  admin = await login("admin@pcm.demo");
  viewer = await login("viewer@pcm.demo");
});
afterAll(() => db.$disconnect());
describe("Fundação com PostgreSQL real", () => {
  it.each([
    ["admin", 200, 200],
    ["manager", 403, 200],
    ["planner", 403, 403],
    ["technician", 403, 403],
    ["viewer", 403, 403],
  ])(
    "aplica matriz de permissões ao perfil %s",
    async (role, usersStatus, auditStatus) => {
      const cookie = await login(`${role}@pcm.demo`);
      expect(
        (await request(app).get("/api/auth/me").set("Cookie", cookie)).body
          .role,
      ).toBe(String(role).toUpperCase());
      expect(
        (await request(app).get("/api/admin/users").set("Cookie", cookie))
          .status,
      ).toBe(usersStatus);
      expect(
        (await request(app).get("/api/audit").set("Cookie", cookie)).status,
      ).toBe(auditStatus);
    },
  );
  it("verifica conexão", async () => {
    expect((await request(app).get("/api/health")).body.database).toBe(
      "connected",
    );
  });
  it("protege rotas sem sessão", async () => {
    expect((await request(app).get("/api/foundation")).status).toBe(401);
  });
  it("nega credenciais incorretas", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({ email: "admin@pcm.demo", password: "incorreta" })
      ).status,
    ).toBe(401);
  });
  it("valida entradas", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", origin)
          .send({ email: "inválido" })
      ).status,
    ).toBe(400);
  });
  it("bloqueia requisições de origem externa", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", "https://other.invalid")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("permite leitura e confere volumes do seed", async () => {
    const r = await request(app).get("/api/foundation").set("Cookie", viewer);
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({
      equipment: 30,
      sectors: 5,
      technicians: 12,
      interruptions: 200,
      orders: 100,
      preventives: 40,
      lubrications: 30,
      thirdParties: 25,
      airReadings: 336,
    });
  });
  it("restringe usuários ao administrador", async () => {
    expect(
      (await request(app).get("/api/admin/users").set("Cookie", viewer)).status,
    ).toBe(403);
    const r = await request(app).get("/api/admin/users").set("Cookie", admin);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(5);
  });
  it("restringe auditoria e registra login", async () => {
    expect(
      (await request(app).get("/api/audit").set("Cookie", viewer)).status,
    ).toBe(403);
    const r = await request(app).get("/api/audit").set("Cookie", admin);
    expect(r.body.some((x: any) => x.action === "LOGIN")).toBe(true);
  });
  it("rejeita sessão expirada", async () => {
    const cookie = await login("technician@pcm.demo");
    const { createHash } = await import("node:crypto");
    const token = cookie[0].split(";")[0].split("=")[1];
    await db.session.update({
      where: { id: createHash("sha256").update(token).digest("hex") },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    ).toBe(401);
  });
  it("logout invalida sessão no banco", async () => {
    const cookie = await login("planner@pcm.demo");
    expect(
      (
        await request(app)
          .post("/api/auth/logout")
          .set("Origin", origin)
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    ).toBe(401);
  });
});
