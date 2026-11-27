import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { planners } from "./domain.js";
import { assertActiveEquipment } from "./equipment-identity.js";
import {
  actor,
  audit,
  HttpError,
  pageResponse,
  requireRole,
  run,
} from "./helpers.js";
import { scheduleLock } from "../scheduling/lifecycle.js";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Informe uma data válida")
  .transform((value) => new Date(value));

const body = z
  .object({
    equipmentId: z.string().min(1).max(100),
    kind: z.enum(["CORP", "CONTRATURNO", "MELH"]),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(3).max(2000),
    plannedFor: dateOnly,
  })
  .strict();

export function remindersRouter(db: PrismaClient) {
  const router = Router();
  router.get(
    "/reminders",
    run(async (req, res) => {
      requireRole(res, planners);
      const { page, equipmentId, sectorId, status } = z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          equipmentId: z.string().max(100).optional(),
          sectorId: z.string().max(100).optional(),
          status: z.enum(["PENDING", "LINKED", "CANCELLED"]).default("PENDING"),
        })
        .strict()
        .parse(req.query);
      const where = { status, equipmentId, equipment: { sectorId } };
      const [rows, total] = await Promise.all([
        db.maintenanceReminder.findMany({
          where,
          orderBy: [{ plannedFor: "asc" }, { id: "asc" }],
          skip: (page - 1) * 20,
          take: 20,
          include: { equipment: { include: { sector: true } } },
        }),
        db.maintenanceReminder.count({ where }),
      ]);
      res.json(pageResponse(rows, total, page, 20));
    }),
  );
  router.post(
    "/reminders",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = body.parse(req.body);
      const user = actor(res);
      const row = await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        await assertActiveEquipment(tx, data.equipmentId);
        const reminder = await tx.maintenanceReminder.create({
          data: { ...data, createdBy: user.id },
        });
        await audit(tx, user, "REMINDER_CREATED", "MaintenanceReminder", {
          id: reminder.id,
        });
        return reminder;
      });
      res.status(201).json(row);
    }),
  );
  router.patch(
    "/reminders/:id",
    run(async (req, res) => {
      requireRole(res, planners);
      const input = z
        .discriminatedUnion("status", [
          z
            .object({
              status: z.literal("LINKED"),
              sapReference: z
                .string()
                .trim()
                .regex(/^\d{1,24}$/),
            })
            .strict(),
          z.object({ status: z.literal("CANCELLED") }).strict(),
        ])
        .parse(req.body);
      const user = actor(res);
      await db.$transaction(async (tx) => {
        const existing = await tx.maintenanceReminder.findUnique({
          where: { id: req.params.id },
        });
        if (!existing) throw new HttpError(404, "Planejamento não encontrado");
        if (user.role.name === "PLANNER" && existing.createdBy !== user.id)
          throw new HttpError(
            403,
            "Somente o autor ou um gestor pode alterar este planejamento",
          );
        const sapReference =
          input.status === "LINKED" ? input.sapReference : null;
        if (sapReference) {
          const order = await tx.sapOrder.findUnique({
            where: { number: sapReference },
          });
          if (!order || order.equipmentId !== existing.equipmentId)
            throw new HttpError(
              409,
              "Importe a ordem IW38 e confira se ela pertence ao mesmo equipamento",
            );
        }
        const changed = await tx.maintenanceReminder.updateMany({
          where: { id: existing.id, status: "PENDING" },
          data: { status: input.status, sapReference, resolvedAt: new Date() },
        });
        if (!changed.count)
          throw new HttpError(409, "Este planejamento já foi encerrado");
        await audit(
          tx,
          user,
          "REMINDER_" + input.status,
          "MaintenanceReminder",
          { id: existing.id, sapReference },
        );
      });
      res.sendStatus(204);
    }),
  );
  return router;
}
