import type {
  Prisma,
  MaintenanceOrder,
  TechnicianAssignment,
} from "@prisma/client";
import {
  audit,
  HttpError,
  must,
  updated,
  type Actor,
} from "../operations/helpers.js";
import { snapshot } from "../operations/domain.js";
import { ACTIVE } from "./intervals.js";
export type Tx = Prisma.TransactionClient;
export async function scheduleLock(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(739104,3)`;
}
export async function movement(
  tx: Tx,
  user: Actor,
  action: string,
  before: TechnicianAssignment | null,
  after: TechnicianAssignment,
  notes: string,
) {
  await tx.assignmentHistory.create({
    data: {
      assignmentId: after.id,
      userId: user.id,
      action,
      before: before ? snapshot(before) : undefined,
      after: snapshot(after),
      notes,
    },
  });
  await audit(tx, user, "SCHEDULE_" + action, "TechnicianAssignment", {
    before,
    after,
    notes,
  });
}
export function reservedFieldsChanged(
  kind: "ORDER" | "PLAN",
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const keys =
    kind === "ORDER"
      ? ["equipmentId", "technicianId", "scheduledAt"]
      : ["equipmentId", "technicianId", "nextExecution", "active"];
  return keys.some(
    (key) =>
      key in patch &&
      JSON.stringify(patch[key]) !== JSON.stringify(before[key]),
  );
}
export async function guardReservedTarget(
  tx: Tx,
  kind: "ORDER" | "PLAN",
  id: string,
  before: any,
  patch: Record<string, unknown>,
) {
  const changed = reservedFieldsChanged(kind, before, patch);
  if (
    changed &&
    (await tx.technicianAssignment.count({
      where: {
        ...(kind === "ORDER" ? { orderId: id } : { planId: id }),
        status: { in: ACTIVE },
      },
    }))
  )
    throw new HttpError(
      409,
      "Há reservas ativas para este registro. Reprograme ou cancele pela Agenda antes de alterar equipamento, responsável ou data.",
    );
}
export async function syncOrderAssignments(
  tx: Tx,
  order: MaintenanceOrder,
  user: Actor,
  notes: string,
) {
  const rows = await tx.technicianAssignment.findMany({
    where: { orderId: order.id, status: { in: ACTIVE } },
  });
  for (const before of rows) {
    let status = before.status;
    if (order.status === "CANCELLED") status = "CANCELLED";
    else if (order.status === "COMPLETED")
      status =
        before.status === "IN_PROGRESS" && order.completedAt
          ? "COMPLETED"
          : "CANCELLED";
    else if (
      ["WAITING_PART", "WAITING_VENDOR", "ANALYSIS"].includes(order.status)
    )
      status = "BLOCKED";
    else if (before.status === "BLOCKED") status = "SCHEDULED";
    if (status === before.status) continue;
    const after = await tx.technicianAssignment.update({
      where: { id: before.id },
      data: {
        status,
        version: { increment: 1 },
        ...(status === "COMPLETED"
          ? { completedAt: order.completedAt || new Date() }
          : {}),
      },
    });
    await movement(tx, user, status, before, after, notes);
  }
}
export async function recordPlanCompletion(
  tx: Tx,
  id: string,
  expected: number,
  executedAt: Date,
  notes: string,
  user: Actor,
  completingAssignmentId?: string,
) {
  const plan = must(
    await tx.maintenancePlan.findUnique({
      where: { id },
      include: { technician: true },
    }),
  );
  if (!plan.active) throw new HttpError(409, "O plano está inativo");
  if (
    user.role.name === "TECHNICIAN" &&
    plan.technicianId !== user.technicianId &&
    !completingAssignmentId
  )
    throw new HttpError(403, "Plano atribuído a outro técnico");
  if (executedAt > new Date())
    throw new HttpError(400, "Execução não pode estar no futuro");
  let next = new Date(plan.nextExecution);
  do {
    next = new Date(next.getTime() + plan.intervalDays * 86400000);
  } while (next <= executedAt);
  updated(
    await tx.maintenancePlan.updateMany({
      where: { id, version: expected },
      data: { nextExecution: next, version: { increment: 1 } },
    }),
  );
  const assignment = completingAssignmentId
    ? await tx.technicianAssignment.findUnique({
        where: { id: completingAssignmentId },
        include: { technician: true },
      })
    : null;
  const execution = await tx.maintenanceExecution.create({
    data: {
      planId: id,
      executedAt,
      scheduledFor: plan.nextExecution,
      technicianName: assignment?.technician.name || plan.technician.name,
      notes,
    },
  });
  const reservations = await tx.technicianAssignment.findMany({
    where: {
      planId: id,
      scheduledFor: plan.nextExecution,
      status: { in: ACTIVE },
      ...(completingAssignmentId
        ? { id: { not: completingAssignmentId } }
        : {}),
    },
  });
  for (const before of reservations) {
    const after = await tx.technicianAssignment.update({
      where: { id: before.id },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    await movement(
      tx,
      user,
      "CANCELLED",
      before,
      after,
      "Vencimento executado; reserva encerrada sem presumir execução desta etapa. " +
        notes,
    );
  }
  await audit(tx, user, "PLAN_COMPLETED", "MaintenanceExecution", {
    execution,
    nextExecution: next,
  });
  return { execution, nextExecution: next };
}
