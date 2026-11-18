import { Router } from "express";
import { z } from "zod";
import type {
  PrismaClient,
  MaintenanceOrder,
  MaintenancePlan,
  TechnicianAssignment,
} from "@prisma/client";
import {
  actor,
  audit,
  HttpError,
  must,
  requireRole,
  run,
  updated,
  type Actor,
} from "../operations/helpers.js";
import {
  date,
  planners,
  snapshot,
  text,
  version,
} from "../operations/domain.js";
import { ACTIVE, TIMEZONE } from "./intervals.js";
import { configurationRouter } from "./configuration.js";
import {
  assignmentInclude,
  assignmentView,
  overview,
  rangeQuery,
  suggestions,
  targets,
} from "./queries.js";
import { inspectSlot, target } from "./availability.js";
import {
  movement,
  recordPlanCompletion,
  scheduleLock,
  syncOrderAssignments,
  type Tx,
} from "./lifecycle.js";
const booking = z
  .object({
    kind: z.enum(["ORDER", "PLAN"]),
    targetId: z.string().min(1).max(100),
    targetVersion: version,
    technicianId: z.string().min(1).max(100),
    startsAt: date,
    endsAt: date,
    notes: text,
    reviewConfirmed: z.literal(true),
  })
  .strict();
function validInterval(startsAt: Date, endsAt: Date) {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60000;
  if (minutes < 5 || minutes > 1440 || endsAt <= new Date())
    throw new HttpError(
      400,
      "Reserve de 5 minutos a 24 horas, com término posterior ao momento atual. Atividades longas podem ter etapas em horários distintos.",
    );
}
async function orderHistory(
  tx: Tx,
  user: Actor,
  before: MaintenanceOrder,
  after: MaintenanceOrder,
  action: string,
  notes: string,
) {
  await tx.orderHistory.create({
    data: {
      orderId: before.id,
      userId: user.id,
      action,
      before: snapshot(before),
      after: snapshot(after),
      notes,
    },
  });
  await audit(tx, user, action, "MaintenanceOrder", { before, after, notes });
}
async function touchTarget(
  tx: Tx,
  source: MaintenanceOrder | MaintenancePlan,
  kind: "ORDER" | "PLAN",
  user: Actor,
  notes: string,
) {
  const next = await tx.technicianAssignment.findFirst({
    where: {
      ...(kind === "ORDER" ? { orderId: source.id } : { planId: source.id }),
      status: { in: ACTIVE },
      endsAt: { gt: new Date() },
    },
    orderBy: { startsAt: "asc" },
  });
  if (kind === "ORDER") {
    const before = source as MaintenanceOrder;
    const status =
      ["OPEN", "ANALYSIS"].includes(before.status) && next
        ? "SCHEDULED"
        : before.status === "SCHEDULED" && !next
          ? "ANALYSIS"
          : before.status;
    updated(
      await tx.maintenanceOrder.updateMany({
        where: { id: before.id, version: before.version },
        data: {
          version: { increment: 1 },
          status,
          ...(next
            ? { scheduledAt: next.startsAt, technicianId: next.technicianId }
            : {}),
        },
      }),
    );
    const after = must(
      await tx.maintenanceOrder.findUnique({ where: { id: before.id } }),
    );
    await orderHistory(tx, user, before, after, "AGENDA_UPDATED", notes);
  } else {
    const before = source as MaintenancePlan;
    updated(
      await tx.maintenancePlan.updateMany({
        where: { id: before.id, version: before.version },
        data: {
          version: { increment: 1 },
          ...(next ? { technicianId: next.technicianId } : {}),
        },
      }),
    );
    const after = must(
      await tx.maintenancePlan.findUnique({ where: { id: before.id } }),
    );
    await audit(tx, user, "PLAN_AGENDA_UPDATED", "MaintenancePlan", {
      before,
      after,
      notes,
    });
  }
}
function verifySource(
  source: MaintenanceOrder | MaintenancePlan,
  expected: number,
  assignment?: TechnicianAssignment,
) {
  if (source.version !== expected)
    throw new HttpError(
      409,
      "A OS ou o plano foi alterado. Atualize a tela e revise novamente.",
    );
  if (
    "status" in source &&
    ["WAITING_PART", "WAITING_VENDOR"].includes(source.status)
  )
    throw new HttpError(
      409,
      "A OS aguarda peça ou terceiro. Resolva a dependência antes de reservar ou iniciar.",
    );
  if (
    "nextExecution" in source &&
    assignment?.scheduledFor?.getTime() !== undefined &&
    assignment.scheduledFor.getTime() !== source.nextExecution.getTime()
  )
    throw new HttpError(
      409,
      "O vencimento do plano mudou. Revise esta reserva.",
    );
}
export function schedulingRouter(db: PrismaClient) {
  const r = Router();
  r.use(configurationRouter(db));
  r.get(
    "/",
    run(async (req, res) =>
      res.json(await overview(db, rangeQuery.parse(req.query))),
    ),
  );
  r.get(
    "/targets",
    run(async (req, res) =>
      res.json({ items: await targets(db, rangeQuery.parse(req.query)) }),
    ),
  );
  r.get(
    "/suggestions",
    run(async (req, res) => {
      requireRole(res, planners);
      const f = rangeQuery.parse(req.query),
        duration = z.coerce
          .number()
          .int()
          .min(5)
          .max(1440)
          .default(60)
          .parse(req.query.durationMinutes);
      res.json(await suggestions(db, f, duration));
    }),
  );
  r.post(
    "/check",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = booking
        .omit({ notes: true, reviewConfirmed: true })
        .extend({ excludeId: z.string().optional() })
        .parse(req.body);
      validInterval(data.startsAt, data.endsAt);
      const source = await target(db, data.kind, data.targetId);
      verifySource(source, data.targetVersion);
      if (data.excludeId) {
        const existing = must(
          await db.technicianAssignment.findUnique({
            where: { id: data.excludeId },
          }),
        );
        if ((existing.orderId || existing.planId) !== data.targetId)
          throw new HttpError(
            400,
            "A reserva informada pertence a outra atividade",
          );
      }
      res.json({
        ...(await inspectSlot(
          db,
          data.technicianId,
          source.equipmentId,
          data.startsAt,
          data.endsAt,
          data.excludeId,
        )),
        timezone: TIMEZONE,
      });
    }),
  );
  r.get(
    "/assignments/:id",
    run(async (req, res) => {
      const item = must(
        await db.technicianAssignment.findUnique({
          where: { id: req.params.id },
          include: {
            ...assignmentInclude,
            history: {
              include: { user: { select: { name: true } } },
              orderBy: { createdAt: "desc" },
              take: 100,
            },
          },
        }),
      );
      res.json({ ...assignmentView(item), history: item.history });
    }),
  );
  for (const edit of [false, true])
    r[edit ? "patch" : "post"](
      "/assignments" + (edit ? "/:id" : ""),
      run(async (req, res) => {
        requireRole(res, planners);
        const data = (edit ? booking.extend({ version }) : booking).parse(
          req.body,
        );
        validInterval(data.startsAt, data.endsAt);
        const id = await db.$transaction(
          async (tx) => {
            await scheduleLock(tx);
            const source = await target(tx, data.kind, data.targetId);
            const before = edit
              ? must(
                  await tx.technicianAssignment.findUnique({
                    where: { id: req.params.id },
                  }),
                )
              : null;
            verifySource(source, data.targetVersion, before || undefined);
            if (before) {
              if (
                (before.orderId || before.planId) !== data.targetId ||
                Boolean(before.orderId) !== (data.kind === "ORDER")
              )
                throw new HttpError(
                  400,
                  "A atividade vinculada não pode ser trocada",
                );
              if (!ACTIVE.includes(before.status))
                throw new HttpError(409, "A reserva já foi encerrada");
              if (
                before.status === "IN_PROGRESS" &&
                (before.startsAt.getTime() !== data.startsAt.getTime() ||
                  before.technicianId !== data.technicianId)
              )
                throw new HttpError(
                  409,
                  "Atividade em execução permite somente ajuste do término e observações",
                );
            }
            const check = await inspectSlot(
              tx,
              data.technicianId,
              source.equipmentId,
              data.startsAt,
              data.endsAt,
              before?.id,
            );
            if (!check.available)
              throw new HttpError(
                409,
                check.conflicts
                  .map((c) => c.message + (c.id ? " (" + c.id + ")" : ""))
                  .join("; "),
              );
            const values = {
              technicianId: data.technicianId,
              startsAt: data.startsAt,
              endsAt: data.endsAt,
              notes: data.notes,
            };
            let after;
            if (before) {
              updated(
                await tx.technicianAssignment.updateMany({
                  where: {
                    id: before.id,
                    version: (
                      data as z.infer<typeof booking> & { version: number }
                    ).version,
                  },
                  data: {
                    ...values,
                    version: { increment: 1 },
                    ...(before.status === "BLOCKED"
                      ? { status: "SCHEDULED" }
                      : {}),
                  },
                }),
              );
              after = must(
                await tx.technicianAssignment.findUnique({
                  where: { id: before.id },
                }),
              );
            } else
              after = await tx.technicianAssignment.create({
                data: {
                  ...values,
                  ...(data.kind === "ORDER"
                    ? { orderId: source.id }
                    : {
                        planId: source.id,
                        scheduledFor: (source as MaintenancePlan).nextExecution,
                      }),
                },
              });
            await touchTarget(tx, source, data.kind, actor(res), data.notes);
            await movement(
              tx,
              actor(res),
              edit ? "RESCHEDULED" : "CREATED",
              before,
              after,
              data.notes,
            );
            return after.id;
          },
          { timeout: 25000, maxWait: 5000 },
        );
        res
          .status(edit ? 200 : 201)
          .json(
            assignmentView(
              must(
                await db.technicianAssignment.findUnique({
                  where: { id },
                  include: assignmentInclude,
                }),
              ),
            ),
          );
      }),
    );
  r.post(
    "/assignments/:id/cancel",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = z
        .object({ version, targetVersion: version, notes: text })
        .strict()
        .parse(req.body);
      await db.$transaction(
        async (tx) => {
          await scheduleLock(tx);
          const before = must(
            await tx.technicianAssignment.findUnique({
              where: { id: req.params.id },
            }),
          );
          if (!ACTIVE.includes(before.status))
            throw new HttpError(409, "A reserva já foi encerrada");
          const kind = before.orderId ? "ORDER" : "PLAN",
            source = await target(tx, kind, (before.orderId || before.planId)!);
          if (source.version !== data.targetVersion)
            throw new HttpError(409, "A atividade mudou. Atualize a tela.");
          updated(
            await tx.technicianAssignment.updateMany({
              where: { id: before.id, version: data.version },
              data: {
                status: "CANCELLED",
                version: { increment: 1 },
                notes: data.notes,
              },
            }),
          );
          const after = must(
            await tx.technicianAssignment.findUnique({
              where: { id: before.id },
            }),
          );
          await touchTarget(tx, source, kind, actor(res), data.notes);
          await movement(
            tx,
            actor(res),
            "CANCELLED",
            before,
            after,
            data.notes,
          );
        },
        { timeout: 25000 },
      );
      res.json({ status: "CANCELLED" });
    }),
  );
  for (const action of ["start", "complete"] as const)
    r.post(
      "/assignments/:id/" + action,
      run(async (req, res) => {
        requireRole(res, [...planners, "TECHNICIAN"]);
        const data = z
            .object({
              version,
              targetVersion: version,
              notes: text,
              finishTarget: z.boolean().optional(),
            })
            .strict()
            .parse(req.body),
          user = actor(res);
        await db.$transaction(
          async (tx) => {
            await scheduleLock(tx);
            const before = must(
              await tx.technicianAssignment.findUnique({
                where: { id: req.params.id },
              }),
            );
            if (
              user.role.name === "TECHNICIAN" &&
              user.technicianId !== before.technicianId
            )
              throw new HttpError(
                403,
                "Você só pode executar suas próprias atividades",
              );
            const kind = before.orderId ? "ORDER" : "PLAN",
              source = await target(
                tx,
                kind,
                (before.orderId || before.planId)!,
              );
            verifySource(source, data.targetVersion, before);
            const now = new Date();
            if (action === "start") {
              if (before.status !== "SCHEDULED")
                throw new HttpError(
                  409,
                  "A atividade precisa estar programada para iniciar",
                );
              if (now < before.startsAt || now >= before.endsAt)
                throw new HttpError(
                  409,
                  "Reprograme o horário antes de iniciar uma reserva futura ou vencida",
                );
              const conflict = await tx.technicianAssignment.findFirst({
                where: {
                  id: { not: before.id },
                  status: "IN_PROGRESS",
                  OR: [
                    { technicianId: before.technicianId },
                    { order: { equipmentId: source.equipmentId } },
                    { plan: { equipmentId: source.equipmentId } },
                  ],
                },
              });
              if (conflict)
                throw new HttpError(
                  409,
                  "Já existe atividade em execução para este técnico ou equipamento: " +
                    conflict.id,
                );
            } else if (before.status !== "IN_PROGRESS")
              throw new HttpError(
                409,
                "Inicie a atividade antes de registrar a conclusão",
              );
            updated(
              await tx.technicianAssignment.updateMany({
                where: { id: before.id, version: data.version },
                data: {
                  status: action === "start" ? "IN_PROGRESS" : "COMPLETED",
                  version: { increment: 1 },
                  notes: data.notes,
                  ...(action === "start"
                    ? { actualStartedAt: now }
                    : { completedAt: now }),
                },
              }),
            );
            const after = must(
              await tx.technicianAssignment.findUnique({
                where: { id: before.id },
              }),
            );
            if (kind === "ORDER") {
              const order = source as MaintenanceOrder;
              const status =
                action === "start"
                  ? "IN_PROGRESS"
                  : data.finishTarget
                    ? "COMPLETED"
                    : "IN_PROGRESS";
              updated(
                await tx.maintenanceOrder.updateMany({
                  where: { id: order.id, version: data.targetVersion },
                  data: {
                    status,
                    version: { increment: 1 },
                    ...(action === "start"
                      ? { technicianId: before.technicianId }
                      : {}),
                    ...(status === "COMPLETED" ? { completedAt: now } : {}),
                  },
                }),
              );
              const changed = must(
                await tx.maintenanceOrder.findUnique({
                  where: { id: order.id },
                }),
              );
              await orderHistory(
                tx,
                user,
                order,
                changed,
                action === "start"
                  ? "AGENDA_STARTED"
                  : data.finishTarget
                    ? "AGENDA_ORDER_COMPLETED"
                    : "AGENDA_STAGE_COMPLETED",
                data.notes,
              );
              if (status === "COMPLETED")
                await syncOrderAssignments(
                  tx,
                  changed,
                  user,
                  "OS concluída pela agenda. " + data.notes,
                );
            } else if (action === "complete" && data.finishTarget)
              await recordPlanCompletion(
                tx,
                source.id,
                data.targetVersion,
                now,
                data.notes,
                user,
                before.id,
              );
            else {
              updated(
                await tx.maintenancePlan.updateMany({
                  where: { id: source.id, version: data.targetVersion },
                  data: { version: { increment: 1 } },
                }),
              );
            }
            await movement(
              tx,
              user,
              action === "start"
                ? "STARTED"
                : data.finishTarget
                  ? "COMPLETED"
                  : "STAGE_COMPLETED",
              before,
              after,
              data.notes,
            );
          },
          { timeout: 25000 },
        );
        res.json({ status: action === "start" ? "IN_PROGRESS" : "COMPLETED" });
      }),
    );
  return r;
}
