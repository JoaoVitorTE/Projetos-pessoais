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
  archive = false,
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
        if (!restore && !archive) {
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
          restore
            ? "EQUIPMENT_RESTORED"
            : archive
              ? "EQUIPMENT_ARCHIVED"
              : "EQUIPMENT_DELETED",
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
  r.post(
    "/equipment/:id/archive",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = z.object({ version, reason }).strict().parse(req.body);
      const [row] = await change(
        db,
        [{ id: req.params.id, version: body.version }],
        false,
        body.reason,
        actor(res),
        true,
      );
      res.json(row);
    }),
  );
  r.delete(
    "/equipment/:id/permanent",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = z.object({ version, reason }).strict().parse(req.body);
      const id = req.params.id;
      await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const before = must(await tx.equipment.findUnique({ where: { id } }));
        if (before.version !== body.version)
          throw new HttpError(409, "Cadastro alterado. Atualize a tela.");
        const links = [
          [
            "ordens",
            await tx.maintenanceOrder.count({ where: { equipmentId: id } }),
          ],
          [
            "planos",
            await tx.maintenancePlan.count({ where: { equipmentId: id } }),
          ],
          [
            "interrupções",
            await tx.interruption.count({ where: { equipmentId: id } }),
          ],
          ["alertas", await tx.alert.count({ where: { equipmentId: id } })],
          [
            "ordens SAP",
            await tx.sapOrder.count({ where: { equipmentId: id } }),
          ],
          ["notas SAP", await tx.sapNote.count({ where: { equipmentId: id } })],
          [
            "referências de importação",
            await tx.externalRecord.count({
              where: { entityType: "EQUIPMENT", entityId: id },
            }),
          ],
          [
            "alterações de importação",
            await tx.importChange.count({
              where: { entityType: "EQUIPMENT", entityId: id },
            }),
          ],
        ] as const;
        const blockers = links
          .filter(([, count]) => count)
          .map(([label, count]) => `${count} ${label}`);
        if (blockers.length)
          throw new HttpError(
            409,
            `Exclusão bloqueada para ${before.tag || id}. Vínculos: ${blockers.join(", ")}. Use Arquivar.`,
          );
        updated(
          await tx.equipment.deleteMany({
            where: { id, version: body.version },
          }),
        );
        await audit(tx, actor(res), "EQUIPMENT_PURGED", "Equipment", {
          entityId: id,
          before,
          reason: body.reason,
        });
      });
      res.status(204).end();
    }),
  );
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
    "/equipment/bulk-archive",
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
      const rows = await change(
        db,
        body.items,
        false,
        body.reason,
        actor(res),
        true,
      );
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
