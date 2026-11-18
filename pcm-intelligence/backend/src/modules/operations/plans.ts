import {
  scheduleLock,
  guardReservedTarget,
  recordPlanCompletion,
} from "../scheduling/lifecycle.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  date,
  equipmentWhere,
  filters,
  planners,
  text,
  version,
} from "./domain.js";
import {
  actor,
  audit,
  HttpError,
  must,
  pageResponse,
  requireRole,
  run,
  updated,
} from "./helpers.js";
import { assertActiveEquipment } from "./equipment-identity.js";
import { tasksSchema } from "./plan-tasks.js";
const body = z
  .object({
    title: z.string().trim().min(3).max(160),
    equipmentId: z.string().min(1),
    technicianId: z.string().min(1),
    type: z.enum(["PREVENTIVE", "LUBRICATION"]),
    intervalDays: z.number().int().min(1).max(3660),
    nextExecution: date,
    active: z.boolean(),
    taskListReference: z.string().trim().max(120).nullable().optional(),
    tasks: tasksSchema.optional(),
  })
  .strict();
export function plansRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/plans",
    run(async (req, res) => {
      const f = filters.parse(req.query),
        where: Prisma.MaintenancePlanWhereInput = {
          equipment: equipmentWhere(f),
          ...(f.type ? { type: f.type } : {}),
          ...(f.status ? { active: f.status === "ACTIVE" } : {}),
          ...(f.overdue === "true"
            ? { active: true, nextExecution: { lt: new Date() } }
            : f.from || f.to
              ? {
                  nextExecution: {
                    ...(f.from ? { gte: new Date(f.from) } : {}),
                    ...(f.to ? { lte: new Date(f.to) } : {}),
                  },
                }
              : {}),
          ...(f.q
            ? {
                OR: [
                  { id: { contains: f.q, mode: "insensitive" } },
                  { title: { contains: f.q, mode: "insensitive" } },
                  { equipmentId: { contains: f.q, mode: "insensitive" } },
                ],
              }
            : {}),
        };
      const [items, total] = await Promise.all([
        db.maintenancePlan.findMany({
          where,
          include: {
            equipment: { include: { sector: true } },
            technician: true,
          },
          orderBy: { nextExecution: "asc" },
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
        db.maintenancePlan.count({ where }),
      ]);
      res.json(pageResponse(items, total, f.page, f.limit));
    }),
  );
  r.get(
    "/plans/:id",
    run(async (req, res) =>
      res.json(
        must(
          await db.maintenancePlan.findUnique({
            where: { id: req.params.id },
            include: {
              equipment: true,
              technician: true,
              executions: { orderBy: { executedAt: "desc" }, take: 100 },
            },
          }),
        ),
      ),
    ),
  );
  r.post(
    "/plans",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = body.parse(req.body);
      const row = await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        await assertActiveEquipment(tx, data.equipmentId);
        const row = await tx.maintenancePlan.create({
          data: {
            ...data,
            id: "PLAN-" + randomUUID().slice(0, 8),
            isDemo: process.env.DATA_MODE !== "operational",
          },
        });
        await audit(tx, actor(res), "PLAN_CREATED", "MaintenancePlan", row);
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/plans/:id",
    run(async (req, res) => {
      requireRole(res, planners);
      const { version: expected, ...data } = body
        .extend({ version })
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const before = must(
          await tx.maintenancePlan.findUnique({ where: { id: req.params.id } }),
        );
        await assertActiveEquipment(tx, data.equipmentId);
        await guardReservedTarget(tx, "PLAN", before.id, before, data);
        updated(
          await tx.maintenancePlan.updateMany({
            where: { id: before.id, version: expected },
            data: { ...data, version: { increment: 1 } },
          }),
        );
        const after = must(
          await tx.maintenancePlan.findUnique({ where: { id: before.id } }),
        );
        await audit(tx, actor(res), "PLAN_UPDATED", "MaintenancePlan", {
          before,
          after,
        });
        return after;
      });
      res.json(row);
    }),
  );
  r.post(
    "/plans/:id/complete",
    run(async (req, res) => {
      requireRole(res, [...planners, "TECHNICIAN"]);
      const data = z
        .object({ version, executedAt: date, notes: text })
        .strict()
        .parse(req.body);
      if (data.executedAt > new Date())
        throw new HttpError(400, "Execução não pode estar no futuro");
      const row = await db.$transaction(
        async (tx) => {
          await scheduleLock(tx);
          return recordPlanCompletion(
            tx,
            req.params.id,
            data.version,
            data.executedAt,
            data.notes,
            actor(res),
          );
        },
        { timeout: 25000 },
      );
      res.status(201).json(row);
    }),
  );
  return r;
}
