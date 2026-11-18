import type { PrismaClient, Prisma } from "@prisma/client";
import { HttpError, must } from "../operations/helpers.js";
import { ACTIVE, asRange, fits, workIntervals } from "./intervals.js";
type DB = PrismaClient | Prisma.TransactionClient;
export async function target(db: DB, kind: "ORDER" | "PLAN", id: string) {
  if (kind === "ORDER") {
    const row = must(
      await db.maintenanceOrder.findUnique({
        where: { id },
        include: { equipment: { include: { sector: true } } },
      }),
    );
    if (["COMPLETED", "CANCELLED"].includes(row.status))
      throw new HttpError(409, "A ordem já foi encerrada");
    return row;
  }
  const row = must(
    await db.maintenancePlan.findUnique({
      where: { id },
      include: { equipment: { include: { sector: true } } },
    }),
  );
  if (!row.active) throw new HttpError(409, "O plano está inativo");
  return row;
}
export async function inspectSlot(
  db: DB,
  technicianId: string,
  equipmentId: string,
  startsAt: Date,
  endsAt: Date,
  excludeId?: string,
) {
  const [technician, windows, absences, assignments] = await Promise.all([
    db.technician.findUnique({ where: { id: technicianId } }),
    db.technicianWorkWindow.findMany({ where: { technicianId, active: true } }),
    db.technicianAbsence.findMany({
      where: {
        technicianId,
        active: true,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    }),
    db.technicianAssignment.findMany({
      where: {
        status: { in: ACTIVE },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [
          { technicianId },
          { order: { equipmentId } },
          { plan: { equipmentId } },
        ],
      },
      include: {
        order: { select: { equipmentId: true } },
        plan: { select: { equipmentId: true } },
      },
    }),
  ]);
  const conflicts: { code: string; message: string; id?: string }[] = [];
  if (!technician?.active)
    conflicts.push({
      code: "INACTIVE",
      message: "Técnico inexistente ou inativo",
    });
  if (
    !fits(
      asRange({ startsAt, endsAt }),
      workIntervals(windows, startsAt, endsAt),
    )
  )
    conflicts.push({
      code: "OUTSIDE_WORK_WINDOW",
      message:
        "Horário fora da jornada configurada ou jornada ainda não cadastrada",
    });
  absences.forEach((a) =>
    conflicts.push({
      code: "ABSENCE",
      id: a.id,
      message: "Técnico indisponível no intervalo informado",
    }),
  );
  assignments.forEach((a) =>
    conflicts.push({
      code:
        a.technicianId === technicianId
          ? "TECHNICIAN_OVERLAP"
          : "EQUIPMENT_OVERLAP",
      id: a.id,
      message:
        a.technicianId === technicianId
          ? "Técnico já reservado nesse horário"
          : "Equipamento já reservado nesse horário",
    }),
  );
  const [running, runningOrders] = await Promise.all([
    db.technicianAssignment.count({
      where: {
        technicianId,
        status: "IN_PROGRESS",
        endsAt: { lt: new Date() },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    }),
    db.maintenanceOrder.count({
      where: { technicianId, status: "IN_PROGRESS" },
    }),
  ]);
  return {
    available: !conflicts.length,
    conflicts,
    warnings: [
      ...(running
        ? [
            "Há uma atividade em execução com término previsto ultrapassado; revise antes de iniciar outra.",
          ]
        : []),
      ...(runningOrders
        ? [
            `${runningOrders} OS em execução estão atribuídas a este técnico. Confirme a disponibilidade real, pois o status da OS não informa a duração restante.`,
          ]
        : []),
    ],
  };
}
