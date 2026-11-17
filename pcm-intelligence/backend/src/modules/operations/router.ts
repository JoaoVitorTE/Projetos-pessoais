import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  filters,
  equipmentWhere,
  planners,
  date,
  text,
  optionalText,
} from "./domain.js";
import {
  actor,
  audit,
  HttpError,
  must,
  pageResponse,
  requireRole,
  run,
} from "./helpers.js";
import { dashboard } from "./metrics.js";
import { ordersRouter } from "./orders.js";
import { plansRouter } from "./plans.js";
import { thirdPartiesRouter } from "./third-parties.js";
export { HttpError } from "./helpers.js";
const equipmentBody = z
  .object({
    id: z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/),
    name: z.string().trim().min(3).max(120),
    sectorId: z.string().min(1),
    criticality: z.number().int().min(1).max(3),
    status: z.enum(["RUNNING", "STOPPED", "MAINTENANCE"]),
  })
  .strict();
const interruptionBody = z
  .object({
    equipmentId: z.string().min(1),
    startedAt: date,
    endedAt: date.nullable(),
    type: z.enum(["UNPLANNED", "PLANNED"]),
    reason: z.string().trim().min(3).max(160),
    description: text,
  })
  .strict();
export function createOperationsRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/lookups",
    run(async (_req, res) => {
      const [sectors, technicians, equipment] = await Promise.all([
        db.sector.findMany({ orderBy: { name: "asc" } }),
        db.technician.findMany({
          select: { id: true, name: true, specialty: true },
          orderBy: { name: "asc" },
        }),
        db.equipment.findMany({
          select: { id: true, name: true, sectorId: true, criticality: true },
          orderBy: { id: "asc" },
          take: 1000,
        }),
      ]);
      res.json({ sectors, technicians, equipment });
    }),
  );
  r.get(
    "/dashboard",
    run(async (req, res) =>
      res.json(await dashboard(db, filters.parse(req.query))),
    ),
  );
  r.get(
    "/equipment",
    run(async (req, res) => {
      const f = filters.parse(req.query),
        where: Prisma.EquipmentWhereInput = {
          ...equipmentWhere(f),
          ...(f.status ? { status: f.status } : {}),
          ...(f.q
            ? {
                OR: [
                  { id: { contains: f.q, mode: "insensitive" } },
                  { name: { contains: f.q, mode: "insensitive" } },
                ],
              }
            : {}),
        };
      const [items, total] = await Promise.all([
        db.equipment.findMany({
          where,
          include: { sector: true },
          orderBy: { id: "asc" },
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
        db.equipment.count({ where }),
      ]);
      res.json(pageResponse(items, total, f.page, f.limit));
    }),
  );
  r.post(
    "/equipment",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = equipmentBody.parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const row = await tx.equipment.create({
          data: { ...body, isDemo: true },
        });
        await audit(tx, actor(res), "EQUIPMENT_CREATED", "Equipment", row);
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/equipment/:id",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = equipmentBody.omit({ id: true }).parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.equipment.findUnique({ where: { id: req.params.id } }),
        );
        const row = await tx.equipment.update({
          where: { id: before.id },
          data: body,
        });
        await audit(tx, actor(res), "EQUIPMENT_UPDATED", "Equipment", {
          before,
          after: row,
        });
        return row;
      });
      res.json(row);
    }),
  );
  r.get(
    "/interruptions/recurrence",
    run(async (req, res) => {
      const f = filters.parse(req.query),
        to = f.to ? new Date(f.to) : new Date(),
        from = f.from
          ? new Date(f.from)
          : new Date(to.getTime() - 30 * 86400000);
      const rows = await db.interruption.findMany({
        where: {
          equipment: equipmentWhere(f),
          startedAt: { gte: from, lte: to },
        },
        include: { equipment: { select: { name: true } } },
      });
      const groups = new Map<
        string,
        {
          equipmentId: string;
          name: string;
          reason: string;
          occurrences: number;
          days: Set<string>;
        }
      >();
      for (const row of rows) {
        const key = row.equipmentId + ":" + row.reason.trim().toLowerCase();
        const group = groups.get(key) || {
          equipmentId: row.equipmentId,
          name: row.equipment.name,
          reason: row.reason,
          occurrences: 0,
          days: new Set<string>(),
        };
        group.occurrences++;
        group.days.add(row.startedAt.toISOString().slice(0, 10));
        groups.set(key, group);
      }
      res.json({
        from,
        to,
        rule: "Mesmo motivo informado pelo menos 3 vezes em pelo menos 2 dias; não representa diagnóstico mecânico.",
        items: [...groups.values()]
          .filter((g) => g.occurrences >= 3 && g.days.size >= 2)
          .map((g) => ({ ...g, days: g.days.size }))
          .sort((a, b) => b.occurrences - a.occurrences),
      });
    }),
  );
  r.get(
    "/interruptions",
    run(async (req, res) => {
      const f = filters.parse(req.query),
        where: Prisma.InterruptionWhereInput = {
          equipment: equipmentWhere(f),
          ...(f.status ? { status: f.status } : {}),
          ...(f.from || f.to
            ? {
                startedAt: {
                  ...(f.from ? { gte: new Date(f.from) } : {}),
                  ...(f.to ? { lte: new Date(f.to) } : {}),
                },
              }
            : {}),
          ...(f.q
            ? {
                OR: [
                  { reason: { contains: f.q, mode: "insensitive" } },
                  { equipmentId: { contains: f.q, mode: "insensitive" } },
                  { description: { contains: f.q, mode: "insensitive" } },
                ],
              }
            : {}),
        };
      const [items, total] = await Promise.all([
        db.interruption.findMany({
          where,
          include: { equipment: { include: { sector: true } } },
          orderBy: { startedAt: "desc" },
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
        db.interruption.count({ where }),
      ]);
      res.json(pageResponse(items, total, f.page, f.limit));
    }),
  );
  const interruptionData = (body: z.infer<typeof interruptionBody>) => {
    if (
      body.startedAt > new Date() ||
      (body.endedAt &&
        (body.endedAt < body.startedAt || body.endedAt > new Date()))
    )
      throw new HttpError(
        400,
        "Início e término precisam estar no passado e em ordem cronológica",
      );
    return {
      ...body,
      durationMinutes: body.endedAt
        ? Math.round(
            (body.endedAt.getTime() - body.startedAt.getTime()) / 60000,
          )
        : null,
      status: body.endedAt ? "CLOSED" : "OPEN",
    };
  };
  r.post(
    "/interruptions",
    run(async (req, res) => {
      requireRole(res, [...planners, "TECHNICIAN"]);
      const data = interruptionData(interruptionBody.parse(req.body));
      const row = await db.$transaction(async (tx) => {
        const row = await tx.interruption.create({
          data: {
            ...data,
            id: "INT-" + randomUUID(),
            source: "UI-DEMO",
            isDemo: true,
          },
        });
        await audit(
          tx,
          actor(res),
          "INTERRUPTION_CREATED",
          "Interruption",
          row,
        );
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/interruptions/:id",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = interruptionData(interruptionBody.parse(req.body));
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.interruption.findUnique({ where: { id: req.params.id } }),
        );
        const row = await tx.interruption.update({
          where: { id: before.id },
          data,
        });
        await audit(tx, actor(res), "INTERRUPTION_UPDATED", "Interruption", {
          before,
          after: row,
        });
        return row;
      });
      res.json(row);
    }),
  );
  r.use(ordersRouter(db));
  r.use(plansRouter(db));
  r.use(thirdPartiesRouter(db));
  return r;
}
