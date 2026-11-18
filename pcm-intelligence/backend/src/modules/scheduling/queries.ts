import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import { HttpError } from "../operations/helpers.js";
import { unionMinutes } from "../operations/domain.js";
import {
  ACTIVE,
  TIMEZONE,
  asRange,
  firstSlot,
  minutes,
  subtract,
  workIntervals,
  type Range,
} from "./intervals.js";
export const rangeQuery = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    technicianId: z.string().max(100).optional(),
    equipmentId: z.string().max(100).optional(),
    sectorId: z.string().max(100).optional(),
    status: z
      .enum(["SCHEDULED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"])
      .optional(),
  })
  .refine(
    (f) =>
      new Date(f.to) > new Date(f.from) &&
      new Date(f.to).getTime() - new Date(f.from).getTime() <= 42 * 86400000,
    "Selecione um período positivo de até 42 dias",
  );
export type Query = z.infer<typeof rangeQuery>;
const equipmentFilter = (f: Query) => ({
  ...(f.equipmentId ? { id: f.equipmentId } : {}),
  ...(f.sectorId ? { sectorId: f.sectorId } : {}),
});
export const assignmentInclude = {
  technician: {
    select: { id: true, name: true, specialty: true, active: true },
  },
  order: { include: { equipment: { include: { sector: true } } } },
  plan: { include: { equipment: { include: { sector: true } } } },
} satisfies Prisma.TechnicianAssignmentInclude;
export function assignmentView(
  a: Prisma.TechnicianAssignmentGetPayload<{
    include: typeof assignmentInclude;
  }>,
) {
  const source = a.order || a.plan;
  return {
    ...a,
    kind: a.orderId ? "ORDER" : "PLAN",
    targetId: a.orderId || a.planId,
    targetVersion: source?.version,
    title: a.order ? a.order.description : a.plan?.title,
    equipmentId: source?.equipmentId,
    equipment: source?.equipment,
    type: source?.type,
    reference: a.order?.sapReference || a.orderId || a.planId,
    blockedReason:
      a.order && ["WAITING_PART", "WAITING_VENDOR"].includes(a.order.status)
        ? "Dependência informada na OS: " + a.order.status
        : null,
    overdue: ACTIVE.includes(a.status) && a.endsAt < new Date(),
    dueAt: a.plan ? a.scheduledFor : a.order?.scheduledAt,
  };
}
export async function overview(db: PrismaClient, f: Query) {
  const from = new Date(f.from),
    to = new Date(f.to),
    gear = equipmentFilter(f);
  const rows = await db.technicianAssignment.findMany({
    where: {
      startsAt: { lt: to },
      endsAt: { gt: from },
      ...(f.technicianId ? { technicianId: f.technicianId } : {}),
      ...(f.status ? { status: f.status } : {}),
      OR: [{ order: { equipment: gear } }, { plan: { equipment: gear } }],
    },
    include: assignmentInclude,
    orderBy: { startsAt: "asc" },
    take: 501,
  });
  if (rows.length > 500)
    throw new HttpError(
      400,
      "Restrinja os filtros para visualizar até 500 reservas",
    );
  const [technicians, windows, absences, busy] = await Promise.all([
    db.technician.findMany({
      where: { ...(f.technicianId ? { id: f.technicianId } : {}) },
      select: { id: true, name: true, specialty: true, active: true },
      orderBy: { name: "asc" },
    }),
    db.technicianWorkWindow.findMany({
      where: {
        active: true,
        ...(f.technicianId ? { technicianId: f.technicianId } : {}),
      },
    }),
    db.technicianAbsence.findMany({
      where: {
        active: true,
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(f.technicianId ? { technicianId: f.technicianId } : {}),
      },
    }),
    db.technicianAssignment.findMany({
      where: {
        status: { in: ACTIVE },
        startsAt: { lt: to },
        endsAt: { gt: from },
        ...(f.technicianId ? { technicianId: f.technicianId } : {}),
      },
      select: {
        technicianId: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    }),
  ]);
  const capacity = technicians.map((t) => {
    const configured = workIntervals(
      windows.filter((w) => w.technicianId === t.id),
      from,
      to,
    );
    const net = t.active
      ? subtract(
          configured,
          absences.filter((a) => a.technicianId === t.id).map(asRange),
        )
      : [];
    const booked = busy.filter((a) => a.technicianId === t.id).map(asRange);
    return {
      ...t,
      configured: windows.some((w) => w.technicianId === t.id),
      capacityMinutes: minutes(net),
      freeMinutes: minutes(
        subtract(
          net.map((r) => ({
            start: Math.max(Date.now(), r.start),
            end: r.end,
          })),
          booked,
        ),
      ),
      bookedMinutes: minutes(
        booked.map((b) => ({
          start: Math.max(from.getTime(), b.start),
          end: Math.min(to.getTime(), b.end),
        })),
      ),
    };
  });
  return {
    period: { from, to, timezone: TIMEZONE },
    items: rows.map(assignmentView),
    capacity,
    summary: {
      total: rows.length,
      scheduled: rows.filter((a) => a.status === "SCHEDULED").length,
      inProgress: rows.filter((a) => a.status === "IN_PROGRESS").length,
      blocked: rows.filter((a) => a.status === "BLOCKED").length,
      overdue: rows.filter(
        (a) => ACTIVE.includes(a.status) && a.endsAt < new Date(),
      ).length,
    },
    note: "Capacidade calculada pelas jornadas e indisponibilidades cadastradas. As reservas do técnico em outros setores também ocupam sua disponibilidade.",
  };
}
export async function targets(db: PrismaClient, f: Query) {
  const gear = equipmentFilter(f),
    to = new Date(f.to);
  const [orders, plans, reservations] = await Promise.all([
    db.maintenanceOrder.findMany({
      where: {
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        equipment: gear,
        OR: [{ scheduledAt: null }, { scheduledAt: { lt: to } }],
      },
      include: {
        equipment: { include: { sector: true } },
        technician: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
      take: 251,
    }),
    db.maintenancePlan.findMany({
      where: { active: true, equipment: gear, nextExecution: { lt: to } },
      include: {
        equipment: { include: { sector: true } },
        technician: { select: { id: true, name: true } },
      },
      orderBy: { nextExecution: "asc" },
      take: 251,
    }),
    db.technicianAssignment.findMany({
      where: { status: { in: ACTIVE } },
      select: { orderId: true, planId: true, scheduledFor: true },
    }),
  ]);
  if (orders.length + plans.length > 500)
    throw new HttpError(
      400,
      "Restrinja setor ou equipamento para consultar até 500 atividades",
    );
  return [
    ...orders.map((o) => ({
      kind: "ORDER" as const,
      id: o.id,
      version: o.version,
      reference: o.sapReference || o.id,
      title: o.description,
      equipmentId: o.equipmentId,
      equipment: o.equipment,
      type: o.type,
      technicianId: o.technicianId,
      technician: o.technician?.name || null,
      dueAt: o.scheduledAt,
      priority: o.priority,
      status: o.status,
      reservationCount: reservations.filter((r) => r.orderId === o.id).length,
      blocked: ["WAITING_PART", "WAITING_VENDOR"].includes(o.status),
    })),
    ...plans.map((p) => ({
      kind: "PLAN" as const,
      id: p.id,
      version: p.version,
      reference: p.id,
      title: p.title,
      equipmentId: p.equipmentId,
      equipment: p.equipment,
      type: p.type,
      technicianId: p.technicianId,
      technician: p.technician.name,
      dueAt: p.nextExecution,
      priority: null,
      status: p.nextExecution < new Date() ? "OVERDUE" : "PLANNED",
      reservationCount: reservations.filter(
        (r) =>
          r.planId === p.id &&
          r.scheduledFor?.getTime() === p.nextExecution.getTime(),
      ).length,
      blocked: false,
    })),
  ];
}
export async function suggestions(
  db: PrismaClient,
  f: Query,
  duration: number,
) {
  const now = new Date(),
    from = new Date(f.from),
    to = new Date(f.to),
    historyFrom = new Date(now.getTime() - 30 * 86400000);
  const jobs = (await targets(db, f)).filter((t) => !t.reservationCount);
  const gearIds = [...new Set(jobs.map((j) => j.equipmentId))];
  const [technicians, windows, absences, bookings, interruptions] =
    await Promise.all([
      db.technician.findMany({
        where: {
          active: true,
          ...(f.technicianId ? { id: f.technicianId } : {}),
        },
        orderBy: { id: "asc" },
      }),
      db.technicianWorkWindow.findMany({ where: { active: true } }),
      db.technicianAbsence.findMany({
        where: { active: true, startsAt: { lt: to }, endsAt: { gt: from } },
      }),
      db.technicianAssignment.findMany({
        where: {
          status: { in: ACTIVE },
          startsAt: { lt: to },
          endsAt: { gt: from },
        },
        include: {
          order: { select: { equipmentId: true } },
          plan: { select: { equipmentId: true } },
        },
      }),
      db.interruption.findMany({
        where: {
          equipmentId: { in: gearIds },
          startedAt: { lt: now },
          OR: [{ endedAt: null }, { endedAt: { gt: historyFrom } }],
        },
        take: 10001,
        select: { equipmentId: true, startedAt: true, endedAt: true },
      }),
    ]);
  if (interruptions.length > 10000)
    throw new HttpError(
      400,
      "Restrinja o equipamento: há mais de 10.000 interrupções nos últimos 30 dias para esta consulta.",
    );
  const ranked = jobs
    .map((j) => {
      const occurrences = interruptions.filter(
          (i) => i.equipmentId === j.equipmentId,
        ),
        downtime = Math.round(unionMinutes(occurrences, historyFrom, now)),
        daysLate = j.dueAt
          ? Math.max(
              0,
              Math.floor((now.getTime() - j.dueAt.getTime()) / 86400000),
            )
          : 0;
      const parts = {
        criticality: j.equipment.criticality * 10,
        urgency: (j.priority || 0) * 10,
        overdue: Math.min(daysLate, 30),
        downtime: Math.min(Math.floor(downtime / 60), 20),
        recurrence: Math.min(occurrences.length, 10),
      };
      return {
        ...j,
        score: Object.values(parts).reduce((n, v) => n + v, 0),
        scoreParts: parts,
        evidence: {
          criticality: j.equipment.criticality,
          priority: j.priority,
          daysLate,
          interruptionCount: occurrences.length,
          downtimeMinutes: downtime,
          historyFrom,
          historyTo: now,
        },
        durationMinutes: duration,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 10);
  const virtual: { technicianId: string; equipmentId: string; range: Range }[] =
    bookings.map((a) => ({
      technicianId: a.technicianId,
      equipmentId: a.order?.equipmentId || a.plan?.equipmentId || "",
      range: asRange(a),
    }));
  const proposed = ranked.map((j) => {
    if (j.blocked)
      return {
        ...j,
        slot: null,
        reason:
          "OS aguardando peça ou terceiro; resolva a dependência antes de reservar.",
      };
    const candidates = technicians
      .map((t) => {
        const work = workIntervals(
          windows.filter((w) => w.technicianId === t.id),
          from,
          to,
        );
        const busy = [
          ...absences.filter((a) => a.technicianId === t.id).map(asRange),
          ...virtual
            .filter(
              (v) => v.technicianId === t.id || v.equipmentId === j.equipmentId,
            )
            .map((v) => v.range),
        ];
        return {
          technician: t,
          slot: firstSlot(work, busy, duration, now.getTime()),
        };
      })
      .filter((c) => c.slot)
      .sort(
        (a, b) =>
          a.slot!.start - b.slot!.start ||
          Number(b.technician.id === j.technicianId) -
            Number(a.technician.id === j.technicianId) ||
          a.technician.id.localeCompare(b.technician.id),
      );
    const best = candidates[0];
    if (!best?.slot)
      return {
        ...j,
        slot: null,
        reason:
          "Não há janela livre configurada no período para a duração informada.",
      };
    virtual.push({
      technicianId: best.technician.id,
      equipmentId: j.equipmentId,
      range: best.slot,
    });
    return {
      ...j,
      slot: {
        technicianId: best.technician.id,
        technicianName: best.technician.name,
        specialty: best.technician.specialty,
        startsAt: new Date(best.slot.start),
        endsAt: new Date(best.slot.end),
      },
      reason:
        "Janela livre nas jornadas cadastradas. Qualificação do técnico e dependências precisam de revisão humana.",
    };
  });
  return {
    generatedAt: now,
    period: { from, to, timezone: TIMEZONE },
    items: proposed,
    method:
      "Regras transparentes: criticidade × 10; prioridade da OS × 10; atraso até 30 pontos; parada acumulada até 20 pontos; ocorrências até 10 pontos. Não é probabilidade de falha.",
    note: "Propostas simuladas, sem gravação. A duração foi escolhida por você. Uma confirmação altera a disponibilidade: gere novamente as sugestões após aprovar uma reserva.",
  };
}
