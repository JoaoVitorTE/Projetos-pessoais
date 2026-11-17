import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  date,
  equipmentWhere,
  filters,
  optionalText,
  ORDER_STATUS,
  ORDER_TYPES,
  orderTransitions,
  planners,
  snapshot,
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
const create = z
  .object({
    equipmentId: z.string().min(1),
    technicianId: z.string().min(1).nullable(),
    type: z.enum(ORDER_TYPES),
    description: text,
    priority: z.number().int().min(1).max(3),
    scheduledAt: date.nullable(),
    notes: optionalText,
    sapReference: z.string().trim().max(100).nullable().optional(),
  })
  .strict();
const edit = create
  .partial()
  .extend({
    status: z.enum(ORDER_STATUS).optional(),
    version,
    changeNote: z.string().trim().min(3).max(1000),
  })
  .strict();
function whereOrders(
  f: z.infer<typeof filters>,
): Prisma.MaintenanceOrderWhereInput {
  return {
    equipment: equipmentWhere(f),
    ...(f.status ? { status: f.status } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.q
      ? {
          OR: [
            { id: { contains: f.q, mode: "insensitive" } },
            { description: { contains: f.q, mode: "insensitive" } },
            { equipmentId: { contains: f.q, mode: "insensitive" } },
            { sapReference: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(f.overdue === "true"
      ? {
          scheduledAt: { lt: new Date() },
          AND: [{ status: { notIn: ["COMPLETED", "CANCELLED"] } }],
        }
      : {}),
  };
}
const csv = (value: unknown) => {
  let s = value == null ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function ordersRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/orders/export.csv",
    run(async (req, res) => {
      const f = filters.parse(req.query),
        where = whereOrders(f),
        total = await db.maintenanceOrder.count({ where });
      if (total > 5000)
        throw new HttpError(
          400,
          "Restrinja os filtros para exportar até 5.000 ordens",
        );
      const rows = await db.maintenanceOrder.findMany({
        where,
        include: { equipment: { include: { sector: true } }, technician: true },
        orderBy: { openedAt: "desc" },
      });
      const lines = [
        [
          "OS local",
          "Equipamento",
          "Setor",
          "Tipo",
          "Prioridade",
          "Técnico",
          "Abertura",
          "Programação",
          "Status",
          "Descrição",
          "Referência informada SAP",
        ],
        ...rows.map((o) => [
          o.id,
          o.equipmentId,
          o.equipment.sector.name,
          o.type,
          o.priority,
          o.technician?.name,
          o.openedAt?.toISOString() || "",
          o.scheduledAt?.toISOString() || "",
          o.status,
          o.description,
          o.sapReference,
        ]),
      ];
      res
        .set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ordens-locais.csv"',
        })
        .send(
          "\uFEFF" + lines.map((row) => row.map(csv).join(";")).join("\r\n"),
        );
    }),
  );
  r.get(
    "/orders",
    run(async (req, res) => {
      const f = filters.parse(req.query),
        where = whereOrders(f);
      const [items, total] = await Promise.all([
        db.maintenanceOrder.findMany({
          where,
          include: {
            equipment: { include: { sector: true } },
            technician: true,
          },
          orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
        db.maintenanceOrder.count({ where }),
      ]);
      res.json(
        pageResponse(
          items.map((o) => ({
            ...o,
            overdue:
              o.scheduledAt !== null &&
              o.scheduledAt < new Date() &&
              !["COMPLETED", "CANCELLED"].includes(o.status),
          })),
          total,
          f.page,
          f.limit,
        ),
      );
    }),
  );
  r.get(
    "/orders/:id",
    run(async (req, res) =>
      res.json(
        must(
          await db.maintenanceOrder.findUnique({
            where: { id: req.params.id },
            include: {
              equipment: { include: { sector: true } },
              technician: true,
              history: {
                include: { user: { select: { name: true } } },
                orderBy: { createdAt: "desc" },
                take: 100,
              },
            },
          }),
        ),
      ),
    ),
  );
  r.post(
    "/orders",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = create.parse(req.body),
        user = actor(res);
      const row = await db.$transaction(async (tx) => {
        const row = await tx.maintenanceOrder.create({
          data: {
            ...data,
            id: "OS-LOCAL-" + randomUUID().slice(0, 8).toUpperCase(),
            openedAt: new Date(),
            status: "OPEN",
            isDemo: process.env.DATA_MODE !== "operational",
          },
        });
        await tx.orderHistory.create({
          data: {
            orderId: row.id,
            userId: user.id,
            action: "CREATED",
            after: snapshot(row),
            notes: "Registro local; não enviado ao SAP",
          },
        });
        await audit(tx, user, "ORDER_CREATED", "MaintenanceOrder", row);
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/orders/:id",
    run(async (req, res) => {
      const body = edit.parse(req.body),
        user = actor(res);
      requireRole(res, [...planners, "TECHNICIAN"]);
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.maintenanceOrder.findUnique({
            where: { id: req.params.id },
          }),
        );
        if (["COMPLETED", "CANCELLED"].includes(before.status))
          throw new HttpError(409, "Ordens encerradas não podem ser alteradas");
        if (user.role.name === "TECHNICIAN") {
          if (!user.technicianId || before.technicianId !== user.technicianId)
            throw new HttpError(
              403,
              "Você só pode apontar ordens atribuídas ao seu cadastro de técnico",
            );
          if (
            Object.keys(body).some(
              (k) => !["status", "notes", "changeNote", "version"].includes(k),
            ) ||
            !body.status ||
            ![
              "IN_PROGRESS",
              "WAITING_PART",
              "WAITING_VENDOR",
              "COMPLETED",
            ].includes(body.status)
          )
            throw new HttpError(
              403,
              "Técnicos podem registrar execução, espera e conclusão da própria ordem",
            );
        }
        if (
          body.status &&
          body.status !== before.status &&
          !orderTransitions[before.status]?.includes(body.status)
        )
          throw new HttpError(409, "Transição de status não permitida");
        const { version: expected, changeNote, ...patch } = body;
        updated(
          await tx.maintenanceOrder.updateMany({
            where: { id: before.id, version: expected },
            data: {
              ...patch,
              ...(patch.status === "COMPLETED"
                ? { completedAt: new Date() }
                : {}),
              version: { increment: 1 },
            },
          }),
        );
        const after = must(
          await tx.maintenanceOrder.findUnique({ where: { id: before.id } }),
        );
        await tx.orderHistory.create({
          data: {
            orderId: before.id,
            userId: user.id,
            action:
              body.status && body.status !== before.status
                ? "STATUS_CHANGED"
                : "UPDATED",
            before: snapshot(before),
            after: snapshot(after),
            notes: changeNote,
          },
        });
        await audit(tx, user, "ORDER_UPDATED", "MaintenanceOrder", {
          before,
          after,
        });
        return after;
      });
      res.json(row);
    }),
  );
  return r;
}
