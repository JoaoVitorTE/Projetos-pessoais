import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import {
  actor,
  audit,
  must,
  run,
  requireRole,
  HttpError,
  updated,
} from "./helpers.js";
import { planners, version, text } from "./domain.js";
import { scheduleLock } from "../scheduling/lifecycle.js";
const reason = z.string().trim().min(3).max(500);
async function change(
  db: PrismaClient,
  items: { id: string; version: number }[],
  restore: boolean,
  notes: string,
  user: ReturnType<typeof actor>,
) {
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new HttpError(400, "Seleção contém equipamentos repetidos");
  return db.$transaction(
    async (tx) => {
      await scheduleLock(tx);
      const result = [];
      for (const item of items) {
        const before = must(
          await tx.equipment.findUnique({ where: { id: item.id } }),
        );
        if (before.version !== item.version)
          throw new HttpError(409, "Cadastro alterado. Atualize a seleção.");
        if (restore && !before.deletedAt)
          throw new HttpError(409, "Equipamento já está disponível");
        if (!restore && before.deletedAt)
          throw new HttpError(409, "Equipamento já está excluído");
        if (!restore) {
          const [orders, plans, openStops, bookings] = await Promise.all([
            tx.maintenanceOrder.count({
              where: {
                equipmentId: before.id,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
              },
            }),
            tx.maintenancePlan.count({
              where: { equipmentId: before.id, active: true },
            }),
            tx.interruption.count({
              where: { equipmentId: before.id, endedAt: null },
            }),
            tx.technicianAssignment.count({
              where: {
                status: { in: ["SCHEDULED", "IN_PROGRESS", "BLOCKED"] },
                OR: [
                  { order: { equipmentId: before.id } },
                  { plan: { equipmentId: before.id } },
                ],
              },
            }),
          ]);
          if (orders || plans || openStops || bookings)
            throw new HttpError(
              409,
              "O equipamento " +
                (before.tag || before.id) +
                " tem " +
                orders +
                " OS abertas, " +
                plans +
                " planos ativos e " +
                openStops +
                " interrupções abertas e " +
                bookings +
                " reservas abertas. Regularize essas atividades antes de excluir.",
            );
        }
        updated(
          await tx.equipment.updateMany({
            where: { id: before.id, version: item.version },
            data: {
              deletedAt: restore ? null : new Date(),
              version: { increment: 1 },
            },
          }),
        );
        const after = must(
          await tx.equipment.findUnique({ where: { id: before.id } }),
        );
        await audit(
          tx,
          user,
          restore ? "EQUIPMENT_RESTORED" : "EQUIPMENT_DELETED",
          "Equipment",
          { entityId: before.id, before, after, reason: notes },
        );
        result.push(after);
      }
      return result;
    },
    { timeout: 25000 },
  );
}
export function equipmentLifecycleRouter(db: PrismaClient) {
  const r = Router();
  r.delete(
    "/equipment/:id",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = z.object({ version, reason }).strict().parse(req.body);
      res.json(
        (
          await change(
            db,
            [{ id: req.params.id, version: body.version }],
            false,
            body.reason,
            actor(res),
          )
        )[0],
      );
    }),
  );
  r.post(
    "/equipment/bulk-delete",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = z
        .object({
          items: z
            .array(
              z.object({ id: z.string().min(1).max(100), version }).strict(),
            )
            .min(1)
            .max(500),
          reason,
        })
        .strict()
        .parse(req.body);
      const rows = await change(db, body.items, false, body.reason, actor(res));
      res.json({ count: rows.length });
    }),
  );
  r.post(
    "/equipment/:id/restore",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = z.object({ version, reason }).strict().parse(req.body);
      res.json(
        (
          await change(
            db,
            [{ id: req.params.id, version: body.version }],
            true,
            body.reason,
            actor(res),
          )
        )[0],
      );
    }),
  );
  r.get(
    "/equipment/:id/history",
    run(async (req, res) => {
      must(await db.equipment.findUnique({ where: { id: req.params.id } }));
      const id = req.params.id;
      res.json(
        await db.auditLog.findMany({
          where: {
            entity: { in: ["Equipment", "EQUIPMENT"] },
            OR: [
              { metadata: { path: ["entityId"], equals: id } },
              { metadata: { path: ["id"], equals: id } },
              { metadata: { path: ["after", "id"], equals: id } },
              { metadata: { path: ["before", "id"], equals: id } },
            ],
          },
          select: {
            id: true,
            action: true,
            createdAt: true,
            metadata: true,
            user: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    }),
  );
  return r;
}
