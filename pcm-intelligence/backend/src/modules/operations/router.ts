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
import { scheduleLock } from "../scheduling/lifecycle.js";
import {
  tagSchema,
  numberSchema,
  assertActiveEquipment,
} from "./equipment-identity.js";
import { equipmentLifecycleRouter } from "./equipment-lifecycle.js";
const equipmentBody = z
  .object({
    id: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9-]{2,79}$/)
      .optional(),
    tag: tagSchema,
    equipmentNumber: numberSchema,
    name: z.string().trim().min(3).max(120),
    sectorId: z.string().min(1),
    criticality: z.number().int().min(1).max(3),
    status: z.enum(["UNKNOWN", "RUNNING", "STOPPED", "MAINTENANCE"]),
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
  r.use(equipmentLifecycleRouter(db));
  r.get(
    "/lookups",
    run(async (_req, res) => {
      const [sectors, technicians, equipment] = await Promise.all([
        db.sector.findMany({ orderBy: { name: "asc" } }),
        db.technician.findMany({
          select: { id: true, name: true, specialty: true, active: true },
          orderBy: { name: "asc" },
        }),
        db.equipment.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            tag: true,
            equipmentNumber: true,
            name: true,
            sectorId: true,
            criticality: true,
            status: true,
            version: true,
          },
          orderBy: { id: "asc" },
          take: 1000,
        }),
      ]);
      res.json({
        sectors,
        technicians,
        equipment,
        mode: process.env.DATA_MODE,
      });
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
          ...(f.deleted === "all"
            ? {}
            : { deletedAt: f.deleted === "true" ? { not: null } : null }),
          ...(f.tagMissing === "true" ? { tag: null } : {}),
          ...(f.status ? { status: f.status } : {}),
          ...(f.q
            ? {
                OR: [
                  { id: { contains: f.q, mode: "insensitive" } },
                  { name: { contains: f.q, mode: "insensitive" } },
                  { tag: { contains: f.q, mode: "insensitive" } },
                  { equipmentNumber: { contains: f.q, mode: "insensitive" } },
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
      res.json({
        ...pageResponse(items, total, f.page, f.limit),
        pendingTags: await db.equipment.count({
          where: { deletedAt: null, tag: null },
        }),
      });
    }),
  );
  r.post(
    "/equipment",
    run(async (req, res) => {
      requireRole(res, planners);
      const body = equipmentBody.parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const existing = await tx.equipment.findUnique({
          where: { sectorId_tag: { sectorId: body.sectorId, tag: body.tag } },
        });
        if (existing)
          throw new HttpError(
            409,
            existing.deletedAt
              ? "A TAG está em um cadastro excluído deste setor. Use a aba Excluídos para restaurar."
              : "TAG já cadastrada neste setor.",
          );
        const row = await tx.equipment.create({
          data: {
            ...body,
            id: body.id || "EQ-" + randomUUID(),
            isDemo: process.env.DATA_MODE !== "operational",
          },
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
      const body = equipmentBody
        .omit({ id: true })
        .extend({ version: z.number().int().positive() })
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const before = must(
          await tx.equipment.findUnique({ where: { id: req.params.id } }),
        );
        if (before.deletedAt)
          throw new HttpError(409, "Restaure o equipamento antes de editar");
        if (before.version !== body.version)
          throw new HttpError(409, "Equipamento alterado. Atualize a tela.");
        const updated = await tx.equipment.updateMany({
          where: { id: before.id, version: body.version },
          data: { ...body, version: { increment: 1 } },
        });
        if (!updated.count)
          throw new HttpError(409, "Equipamento alterado. Atualize a tela.");
        const row = must(
          await tx.equipment.findUnique({ where: { id: before.id } }),
        );
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
        await scheduleLock(tx);
        await assertActiveEquipment(tx, data.equipmentId);
        const row = await tx.interruption.create({
          data: {
            ...data,
            id: "INT-" + randomUUID(),
            source: process.env.DATA_MODE === "operational" ? "UI" : "UI-DEMO",
            isDemo: process.env.DATA_MODE !== "operational",
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
      const { version, ...body } = interruptionBody
        .extend({ version: z.number().int().positive() })
        .parse(req.body);
      const data = interruptionData(body);
      const row = await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const before = must(
          await tx.interruption.findUnique({ where: { id: req.params.id } }),
        );
        if (data.equipmentId !== before.equipmentId || !data.endedAt)
          await assertActiveEquipment(tx, data.equipmentId);
        if (before.version !== version)
          throw new HttpError(409, "Interrupção alterada. Atualize a tela.");
        const updated = await tx.interruption.updateMany({
          where: { id: before.id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (!updated.count)
          throw new HttpError(409, "Interrupção alterada. Atualize a tela.");
        const row = must(
          await tx.interruption.findUnique({ where: { id: before.id } }),
        );
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
