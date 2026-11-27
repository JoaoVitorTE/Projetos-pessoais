import { scheduleLock } from "../scheduling/lifecycle.js";
import { ACTIVE } from "../scheduling/intervals.js";
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
function requireManageableAccount(
  userId: string,
  target: { id: string; role: { name: string } },
) {
  if (target.id !== userId && target.role.name === "ADMIN")
    throw new HttpError(
      403,
      "Você não pode alterar a conta de outro administrador.",
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
          .extend({
            temporaryPassword: password.optional(),
            newTechnician: z
              .object({
                name: z.string().trim().min(3).max(120),
                specialty: z.string().trim().min(3).max(120),
              })
              .strict()
              .optional(),
          })
          .strict()
          .parse(req.body),
        temporaryPassword =
          body.temporaryPassword || randomBytes(18).toString("base64url"),
        passwordHash = await hash(temporaryPassword, 12),
        user = actor(res);
      const row = await db.$transaction(async (tx) => {
        await adminLock(tx, user.id);
        if (body.newTechnician && body.technicianId)
          throw new HttpError(
            400,
            "Escolha cadastrar um técnico novo ou vincular um existente",
          );
        let technicianId = body.technicianId;
        if (body.newTechnician) {
          const created = await tx.technician.create({
            data: {
              ...body.newTechnician,
              id: "TEC-" + randomUUID().slice(0, 8).toUpperCase(),
              active: true,
              isDemo: process.env.DATA_MODE === "demo",
            },
          });
          technicianId = created.id;
          await audit(tx, user, "TECHNICIAN_CREATED", "Technician", created);
        }
        if (body.role === "TECHNICIAN" && !technicianId)
          throw new HttpError(400, "Vincule um técnico à conta técnica");
        if (
          technicianId &&
          !(await tx.technician.findFirst({
            where: { id: technicianId!, active: true },
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
            technicianId,
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
        requireManageableAccount(user.id, before);
        if (before.id === user.id && (!body.active || body.role !== "ADMIN"))
          throw new HttpError(
            409,
            "Não é permitido remover seu próprio acesso administrativo",
          );
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
          await tx.user.findUnique({
            where: { id: req.params.id },
            include: { role: true },
          }),
        );
        requireManageableAccount(user.id, target);
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
        await scheduleLock(tx);
        if (
          !data.active &&
          (await tx.technicianAssignment.count({
            where: {
              technicianId: req.params.id,
              status: { in: ACTIVE },
              OR: [{ endsAt: { gt: new Date() } }, { status: "IN_PROGRESS" }],
            },
          }))
        )
          throw new HttpError(
            409,
            "Reprograme ou cancele as reservas futuras antes de desativar o técnico.",
          );
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
  r.delete(
    "/users/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN"]);
      const user = actor(res),
        id = req.params.id;
      if (id === user.id)
        throw new HttpError(409, "Sua própria conta não pode ser removida.");
      const outcome = await db.$transaction(async (tx) => {
        await adminLock(tx, user.id);
        await scheduleLock(tx);
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
        const before = must(
          await tx.user.findUnique({
            where: { id },
            include: {
              role: true,
              _count: {
                select: {
                  audits: true,
                  orderChanges: true,
                  importBatches: true,
                  scheduleChanges: true,
                },
              },
            },
          }),
        );
        requireManageableAccount(user.id, before);
        const settings = await tx.sapWorkbookSettings.findFirst({
          where: { actorId: id },
          select: { id: true },
        });
        if (settings)
          throw new HttpError(
            409,
            "Outro administrador autorizado deve salvar o mapeamento SAP antes de remover esta conta.",
          );
        await tx.session.deleteMany({ where: { userId: id } });
        if (Object.values(before._count).some(Boolean)) {
          const after = await tx.user.update({
            where: { id },
            data: { active: false },
            include: { role: true },
          });
          await audit(tx, user, "USER_DEACTIVATED", "User", {
            before: publicUser(before),
            after: publicUser(after),
          });
          return "deactivated";
        }
        await tx.user.delete({ where: { id } });
        await audit(tx, user, "USER_DELETED", "User", {
          before: publicUser(before),
        });
        return "deleted";
      });
      res.json({ outcome });
    }),
  );
  r.delete(
    "/technicians/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      const id = req.params.id;
      const outcome = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(739104,2)`;
        await scheduleLock(tx);
        const row = must(
          await tx.technician.findUnique({
            where: { id },
            include: {
              user: { select: { id: true } },
              _count: {
                select: {
                  workWindows: true,
                  absences: true,
                  assignments: true,
                  plans: true,
                  orders: true,
                },
              },
            },
          }),
        );
        const { _count, user: account, ...before } = row;
        if (account)
          throw new HttpError(
            409,
            "Remova o vínculo entre o técnico e a conta de usuário primeiro.",
          );
        if (
          await tx.technicianAssignment.count({
            where: {
              technicianId: id,
              status: { in: ACTIVE },
              OR: [{ endsAt: { gt: new Date() } }, { status: "IN_PROGRESS" }],
            },
          })
        )
          throw new HttpError(
            409,
            "Reprograme ou cancele as reservas futuras antes de remover o técnico.",
          );
        const hasImport = await tx.importChange.count({
          where: { entityId: id, entityType: "TECHNICIAN", undone: false },
        });
        if (hasImport || Object.values(_count).some(Boolean)) {
          const after = await tx.technician.update({
            where: { id },
            data: { active: false },
          });
          await audit(tx, actor(res), "TECHNICIAN_DEACTIVATED", "Technician", {
            before,
            after,
          });
          return "deactivated";
        }
        await tx.technician.delete({ where: { id } });
        await audit(tx, actor(res), "TECHNICIAN_DELETED", "Technician", {
          before,
        });
        return "deleted";
      });
      res.json({ outcome });
    }),
  );
  r.delete(
    "/sectors/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN", "MANAGER", "PLANNER"]);
      const id = req.params.id;
      await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const before = must(await tx.sector.findUnique({ where: { id } }));
        const equipment = await tx.equipment.count({ where: { sectorId: id } });
        if (equipment)
          throw new HttpError(
            409,
            `Este setor tem ${equipment} equipamento(s) vinculado(s). Mova os equipamentos para outro setor antes de removê-lo.`,
          );
        if (
          await tx.importChange.count({
            where: { entityId: id, entityType: "SECTOR", undone: false },
          })
        )
          throw new HttpError(
            409,
            "O setor faz parte do histórico de uma importação ativa. Revise o lote antes de removê-lo.",
          );
        await tx.sector.delete({ where: { id } });
        await audit(tx, actor(res), "SECTOR_DELETED", "Sector", { before });
      });
      res.json({ outcome: "deleted" });
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
