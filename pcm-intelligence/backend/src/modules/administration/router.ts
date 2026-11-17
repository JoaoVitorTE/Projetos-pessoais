import { Router } from "express";
import { z } from "zod";
import { hash } from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  actor,
  audit,
  HttpError,
  must,
  pageResponse,
  requireRole,
  run,
} from "../operations/helpers.js";
const roles = ["ADMIN", "MANAGER", "PLANNER", "TECHNICIAN", "VIEWER"] as const;
const userFields = z
  .object({
    name: z.string().trim().min(3).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    role: z.enum(roles),
    active: z.boolean(),
    technicianId: z.string().nullable(),
  })
  .strict();
const password = z
  .string()
  .min(12)
  .refine(
    (s) => Buffer.byteLength(s, "utf8") <= 72,
    "Senha deve ter até 72 bytes",
  );
const publicUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  active: u.active,
  role: u.role.name,
  technicianId: u.technicianId,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt,
});
async function adminLock(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(739104,2)`;
  const current = await tx.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!current?.active || current.role.name !== "ADMIN")
    throw new HttpError(
      403,
      "Sua permissão administrativa mudou. Entre novamente.",
    );
}
export function administrationRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/users",
    run(async (_req, res) => {
      requireRole(res, ["ADMIN"]);
      res.json(
        (
          await db.user.findMany({
            include: { role: true },
            orderBy: { name: "asc" },
          })
        ).map(publicUser),
      );
    }),
  );
  r.post(
    "/users",
    run(async (req, res) => {
      requireRole(res, ["ADMIN"]);
      const body = userFields
          .extend({ temporaryPassword: password.optional() })
          .strict()
          .parse(req.body),
        temporaryPassword =
          body.temporaryPassword || randomBytes(18).toString("base64url"),
        passwordHash = await hash(temporaryPassword, 12),
        user = actor(res);
      const row = await db.$transaction(async (tx) => {
        await adminLock(tx, user.id);
        if (body.role === "TECHNICIAN" && !body.technicianId)
          throw new HttpError(400, "Vincule um técnico à conta técnica");
        if (
          body.technicianId &&
          !(await tx.technician.findFirst({
            where: { id: body.technicianId, active: true },
          }))
        )
          throw new HttpError(400, "Técnico inexistente ou inativo");
        const role = must(
          await tx.role.findUnique({ where: { name: body.role } }),
        );
        const row = await tx.user.create({
          data: {
            name: body.name,
            email: body.email,
            active: body.active,
            roleId: role.id,
            technicianId: body.technicianId,
            passwordHash,
            mustChangePassword: true,
          },
          include: { role: true },
        });
        await audit(tx, user, "USER_CREATED", "User", {
          after: publicUser(row),
        });
        return row;
      });
      res.status(201).json({ user: publicUser(row), temporaryPassword });
    }),
  );
  r.patch(
    "/users/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN"]);
      const body = userFields.parse(req.body),
        user = actor(res);
      const row = await db.$transaction(async (tx) => {
        await adminLock(tx, user.id);
        const before = must(
          await tx.user.findUnique({
            where: { id: req.params.id },
            include: { role: true },
          }),
        );
        if (before.id === user.id && (!body.active || body.role !== "ADMIN"))
          throw new HttpError(
            409,
            "Não é permitido remover seu próprio acesso administrativo",
          );
        if (
          before.role.name === "ADMIN" &&
          (!body.active || body.role !== "ADMIN") &&
          (await tx.user.count({
            where: { active: true, role: { name: "ADMIN" } },
          })) <= 1
        )
          throw new HttpError(409, "Mantenha ao menos um administrador ativo");
        if (body.role === "TECHNICIAN" && !body.technicianId)
          throw new HttpError(400, "Vincule um técnico à conta");
        if (
          body.technicianId &&
          !(await tx.technician.findFirst({
            where: { id: body.technicianId, active: true },
          }))
        )
          throw new HttpError(400, "Técnico inexistente ou inativo");
        const role = must(
          await tx.role.findUnique({ where: { name: body.role } }),
        );
        const after = await tx.user.update({
          where: { id: before.id },
          data: {
            name: body.name,
            email: body.email,
            active: body.active,
            roleId: role.id,
            technicianId: body.technicianId,
          },
          include: { role: true },
        });
        if (
          before.roleId !== role.id ||
          before.active !== body.active ||
          before.technicianId !== body.technicianId
        )
          await tx.session.deleteMany({ where: { userId: before.id } });
        await audit(tx, user, "USER_UPDATED", "User", {
          before: publicUser(before),
          after: publicUser(after),
        });
        return after;
      });
      res.json(publicUser(row));
    }),
  );
  r.post(
    "/users/:id/reset-password",
    run(async (req, res) => {
      requireRole(res, ["ADMIN"]);
      const user = actor(res);
      if (req.params.id === user.id)
        throw new HttpError(409, "Para sua conta, use Minha senha");
      const temporaryPassword = randomBytes(18).toString("base64url"),
        passwordHash = await hash(temporaryPassword, 12);
      await db.$transaction(async (tx) => {
        await adminLock(tx, user.id);
        const target = must(
          await tx.user.findUnique({ where: { id: req.params.id } }),
        );
        await tx.user.update({
          where: { id: target.id },
          data: { passwordHash, mustChangePassword: true },
        });
        await tx.session.deleteMany({ where: { userId: target.id } });
        await audit(tx, user, "USER_PASSWORD_RESET", "User", {
          userId: target.id,
          email: target.email,
        });
      });
      res.json({ temporaryPassword });
    }),
  );
  r.get(
    "/technicians",
    run(async (_req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      res.json(
        await db.technician.findMany({
          include: { user: { select: { name: true, email: true } } },
          orderBy: { name: "asc" },
        }),
      );
    }),
  );
  const tech = z
    .object({
      name: z.string().trim().min(3).max(120),
      specialty: z.string().trim().min(3).max(120),
      active: z.boolean(),
    })
    .strict();
  r.post(
    "/technicians",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      const data = tech.parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const row = await tx.technician.create({
          data: {
            ...data,
            id: "TEC-" + randomUUID().slice(0, 8).toUpperCase(),
            isDemo: process.env.DATA_MODE === "demo",
          },
        });
        await audit(tx, actor(res), "TECHNICIAN_CREATED", "Technician", row);
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/technicians/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      const data = tech.parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.technician.findUnique({ where: { id: req.params.id } }),
        );
        const after = await tx.technician.update({
          where: { id: before.id },
          data,
        });
        await audit(tx, actor(res), "TECHNICIAN_UPDATED", "Technician", {
          before,
          after,
        });
        return after;
      });
      res.json(row);
    }),
  );
  r.get(
    "/sectors",
    run(async (_req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      res.json(await db.sector.findMany({ orderBy: { name: "asc" } }));
    }),
  );
  r.post(
    "/sectors",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      const data = z
        .object({ name: z.string().trim().min(3).max(120) })
        .strict()
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const row = await tx.sector.create({
          data: {
            id: "SEC-" + randomUUID().slice(0, 8).toUpperCase(),
            name: data.name,
          },
        });
        await audit(tx, actor(res), "SECTOR_CREATED", "Sector", row);
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/sectors/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      const data = z
        .object({ name: z.string().trim().min(3).max(120) })
        .strict()
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.sector.findUnique({ where: { id: req.params.id } }),
        );
        const after = await tx.sector.update({
          where: { id: before.id },
          data,
        });
        await audit(tx, actor(res), "SECTOR_UPDATED", "Sector", {
          before,
          after,
        });
        return after;
      });
      res.json(row);
    }),
  );
  r.get(
    "/audit",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER"]);
      const f = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          q: z.string().trim().max(120).optional(),
          userId: z.string().optional(),
          action: z.string().max(100).optional(),
          entity: z.string().max(100).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .parse(req.query);
      const from = f.from ? new Date(f.from) : new Date(0),
        to = f.to ? new Date(f.to) : new Date();
      const q =
        "%" +
        (f.q || "")
          .replaceAll("\\", "\\\\")
          .replaceAll("%", "\\%")
          .replaceAll("_", "\\_") +
        "%";
      const rows = await db.$queryRaw<
        any[]
      >`SELECT a.id,a.action,a.entity,a.metadata,a."createdAt",u.name AS "userName",u.email AS "userEmail" FROM "AuditLog" a LEFT JOIN "User" u ON u.id=a."userId" WHERE a."createdAt">=${from} AND a."createdAt"<=${to} AND (${f.userId || ""}='' OR a."userId"=${f.userId || ""}) AND (${f.action || ""}='' OR a.action=${f.action || ""}) AND (${f.entity || ""}='' OR a.entity=${f.entity || ""}) AND (a.action ILIKE ${q} OR a.entity ILIKE ${q} OR a.metadata::text ILIKE ${q} OR u.name ILIKE ${q}) ORDER BY a."createdAt" DESC,a.id LIMIT 25 OFFSET ${(f.page - 1) * 25}`;
      const count = await db.$queryRaw<
        { total: bigint }[]
      >`SELECT count(*) AS total FROM "AuditLog" a LEFT JOIN "User" u ON u.id=a."userId" WHERE a."createdAt">=${from} AND a."createdAt"<=${to} AND (${f.userId || ""}='' OR a."userId"=${f.userId || ""}) AND (${f.action || ""}='' OR a.action=${f.action || ""}) AND (${f.entity || ""}='' OR a.entity=${f.entity || ""}) AND (a.action ILIKE ${q} OR a.entity ILIKE ${q} OR a.metadata::text ILIKE ${q} OR u.name ILIKE ${q})`;
      res.json(pageResponse(rows, Number(count[0].total), f.page, 25));
    }),
  );
  return r;
}
