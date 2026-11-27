import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { hash, compare } from "bcryptjs";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
const db = new PrismaClient();
const origin = process.env.FRONTEND_ORIGIN!;
const app = createApp(db);
const id = randomUUID(),
  email = `security-${id}@pcm.demo`;
const currentPassword = "TemporaryTestPassword!2026",
  newPassword = "ChangedTestPassword!2026";
let cookie: string[], otherCookie: string[];
async function login(password = currentPassword) {
  return request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password });
}
beforeAll(async () => {
  const role = await db.role.findUniqueOrThrow({ where: { name: "VIEWER" } });
  await db.user.create({
    data: {
      id,
      email,
      name: "Usuário de teste temporário",
      roleId: role.id,
      passwordHash: await hash(currentPassword, 12),
      mustChangePassword: true,
    },
  });
  cookie = (await login()).headers["set-cookie"] as unknown as string[];
  otherCookie = (await login()).headers["set-cookie"] as unknown as string[];
});
afterAll(async () => {
  await db.auditLog.deleteMany({ where: { userId: id } });
  await db.user.deleteMany({ where: { id } });
  await db.loginThrottle.deleteMany({
    where: { id: createHash("sha256").update(email).digest("hex") },
  });
  await db.$disconnect();
});
describe("Senha temporária e troca", () => {
  it("informa troca obrigatória e bloqueia dados até a troca", async () => {
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).body
        .mustChangePassword,
    ).toBe(true);
    expect(
      (await request(app).get("/api/foundation").set("Cookie", cookie)).body
        .code,
    ).toBe("PASSWORD_CHANGE_REQUIRED");
  });
  it("exige autenticação para trocar senha", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set("Origin", origin)
          .send({ currentPassword, newPassword })
      ).status,
    ).toBe(401);
  });
  it("rejeita senha atual incorreta", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({ currentPassword: "incorrect", newPassword })
      ).status,
    ).toBe(401);
  });
  it.each(["short", "🔐".repeat(30)])(
    "rejeita nova senha fora dos limites",
    async (password) => {
      expect(
        (
          await request(app)
            .post("/api/auth/change-password")
            .set("Origin", origin)
            .set("Cookie", cookie)
            .send({ currentPassword, newPassword: password })
        ).status,
      ).toBe(400);
    },
  );
  it("não aceita reutilizar a senha temporária", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({ currentPassword, newPassword: currentPassword })
      ).status,
    ).toBe(400);
  });
  it("altera o hash, audita e encerra todas as sessões", async () => {
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set("Origin", origin)
          .set("Cookie", cookie)
          .send({ currentPassword, newPassword })
      ).status,
    ).toBe(204);
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    expect(await compare(newPassword, user.passwordHash)).toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: { userId: id, action: "PASSWORD_CHANGED" },
      }),
    ).toBe(1);
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", otherCookie))
        .status,
    ).toBe(401);
    expect((await login()).status).toBe(401);
    const result = await login(newPassword);
    expect(result.status).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/foundation")
          .set("Cookie", result.headers["set-cookie"])
      ).status,
    ).toBe(200);
  });
});
describe("Limite de login entre instâncias", () => {
  it("mantém limite ao recriar a aplicação", async () => {
    const unknown = `absent-${id}@pcm.demo`;
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await request(createApp(db))
            .post("/api/auth/login")
            .set("Origin", origin)
            .send({ email: unknown, password: "wrong" })
        ).status,
      ).toBe(401);
    }
    const response = await request(createApp(db))
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: unknown, password: "wrong" });
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("900");
    await db.loginThrottle.deleteMany({
      where: { id: createHash("sha256").update(unknown).digest("hex") },
    });
  }, 15000);
});
