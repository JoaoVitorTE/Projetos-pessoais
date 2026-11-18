import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { actor, audit, must, run } from "../operations/helpers.js";
import { ACTIVE } from "../scheduling/intervals.js";
export function experienceRouter(db: PrismaClient) {
  const r = Router();
  r.post(
    "/onboarding",
    run(async (req, res) => {
      const body = z
          .object({
            version: z.literal(1),
            action: z.enum(["COMPLETE", "DISMISS"]),
          })
          .strict()
          .parse(req.body),
        user = actor(res);
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.user.findUnique({
            where: { id: user.id },
            select: { onboardingVersion: true, onboardingCompletedAt: true },
          }),
        );
        const after = await tx.user.update({
          where: { id: user.id },
          data: {
            onboardingVersion: body.version,
            ...(body.action === "COMPLETE"
              ? {
                  onboardingCompletedAt:
                    before.onboardingCompletedAt || new Date(),
                }
              : {}),
          },
          select: { onboardingVersion: true, onboardingCompletedAt: true },
        });
        await audit(
          tx,
          user,
          body.action === "COMPLETE"
            ? "ONBOARDING_COMPLETED"
            : "ONBOARDING_DISMISSED",
          "User",
          { userId: user.id, before, after },
        );
        return after;
      });
      res.json(row);
    }),
  );
  r.get(
    "/home",
    run(async (_req, res) => {
      const user = actor(res),
        canThird = user.role.name !== "TECHNICIAN",
        canAudit = ["ADMIN", "MANAGER"].includes(user.role.name),
        canSetup = ["ADMIN", "MANAGER", "PLANNER"].includes(user.role.name),
        now = new Date(),
        date = formatInTimeZone(now, "America/Sao_Paulo", "yyyy-MM-dd"),
        start = fromZonedTime(date + "T00:00:00", "America/Sao_Paulo"),
        end = new Date(start.getTime() + 86400000),
        week = new Date(now.getTime() + 7 * 86400000),
        stalledBefore = new Date(now.getTime() - 7 * 86400000),
        openOrder = { status: { notIn: ["COMPLETED", "CANCELLED"] } };
      const attentionWhere = {
        status: { in: ACTIVE },
        OR: [{ status: "BLOCKED" }, { endsAt: { lt: now } }],
      };
      const [
        equipment,
        sectors,
        technicians,
        configured,
        users,
        openOrders,
        lateOrderCount,
        latePlanCount,
        upcomingPlanCount,
        thirdCount,
        stalledCount,
        attentionCount,
        lateOrders,
        latePlans,
        stalled,
        attention,
        today,
        totalToday,
        upcoming,
        recent,
      ] = await Promise.all([
        db.equipment.count({ where: { deletedAt: null } }),
        canSetup ? db.sector.count() : Promise.resolve(0),
        canSetup
          ? db.technician.count({ where: { active: true } })
          : Promise.resolve(0),
        canSetup
          ? db.technicianWorkWindow
              .groupBy({
                by: ["technicianId"],
                where: { active: true, technician: { active: true } },
              })
              .then((rows) => rows.length)
          : Promise.resolve(0),
        user.role.name === "ADMIN"
          ? db.user.count({ where: { active: true } })
          : Promise.resolve(null),
        db.maintenanceOrder.count({ where: openOrder }),
        db.maintenanceOrder.count({
          where: { ...openOrder, scheduledAt: { lt: now } },
        }),
        db.maintenancePlan.count({
          where: { active: true, nextExecution: { lt: now } },
        }),
        db.maintenancePlan.count({
          where: { active: true, nextExecution: { gte: now, lte: week } },
        }),
        canThird
          ? db.thirdPartyService.count({
              where: { status: { not: "FINISHED" } },
            })
          : Promise.resolve(null),
        canThird
          ? db.thirdPartyService.count({
              where: {
                status: { not: "FINISHED" },
                stageEnteredAt: { lt: stalledBefore },
              },
            })
          : Promise.resolve(0),
        db.technicianAssignment.count({ where: attentionWhere }),
        db.maintenanceOrder.findMany({
          where: { ...openOrder, scheduledAt: { lt: now } },
          select: {
            id: true,
            sapReference: true,
            description: true,
            equipmentId: true,
            priority: true,
            scheduledAt: true,
          },
          orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
          take: 3,
        }),
        db.maintenancePlan.findMany({
          where: { active: true, nextExecution: { lt: now } },
          select: {
            id: true,
            title: true,
            equipmentId: true,
            nextExecution: true,
          },
          orderBy: { nextExecution: "asc" },
          take: 3,
        }),
        canThird
          ? db.thirdPartyService.findMany({
              where: {
                status: { not: "FINISHED" },
                stageEnteredAt: { lt: stalledBefore },
              },
              select: {
                id: true,
                provider: true,
                status: true,
                stageEnteredAt: true,
              },
              orderBy: { stageEnteredAt: "asc" },
              take: 2,
            })
          : Promise.resolve([]),
        db.technicianAssignment.findMany({
          where: attentionWhere,
          select: {
            id: true,
            endsAt: true,
            status: true,
            order: {
              select: { id: true, sapReference: true, equipmentId: true },
            },
            plan: { select: { id: true, equipmentId: true } },
          },
          orderBy: { endsAt: "asc" },
          take: 3,
        }),
        db.technicianAssignment.findMany({
          where: {
            status: { in: ACTIVE },
            startsAt: { lt: end },
            endsAt: { gt: start },
          },
          include: {
            technician: { select: { name: true } },
            order: {
              select: {
                id: true,
                sapReference: true,
                equipmentId: true,
                description: true,
              },
            },
            plan: { select: { id: true, equipmentId: true, title: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 5,
        }),
        db.technicianAssignment.count({
          where: {
            status: { in: ACTIVE },
            startsAt: { lt: end },
            endsAt: { gt: start },
          },
        }),
        db.maintenancePlan.findMany({
          where: { active: true, nextExecution: { gte: now, lte: week } },
          select: {
            id: true,
            title: true,
            equipmentId: true,
            nextExecution: true,
            type: true,
          },
          orderBy: { nextExecution: "asc" },
          take: 4,
        }),
        canAudit
          ? db.auditLog.findMany({
              select: {
                id: true,
                action: true,
                entity: true,
                createdAt: true,
                user: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
              take: 4,
            })
          : Promise.resolve([]),
      ]);
      const alerts = [
        ...lateOrders.map((o) => ({
          id: "order-" + o.id,
          level: o.priority === 3 ? "critical" : "warning",
          title: (o.sapReference || o.id) + " · ordem atrasada",
          description: o.equipmentId + " · " + o.description,
          dueAt: o.scheduledAt,
          module: "orders",
          recordId: o.id,
          overdue: true,
        })),
        ...latePlans.map((p) => ({
          id: "plan-" + p.id,
          level: "warning",
          title: "Plano de manutenção vencido",
          description: p.equipmentId + " · " + p.title,
          dueAt: p.nextExecution,
          module: "plans",
          recordId: p.id,
          overdue: true,
        })),
        ...attention.map((a) => ({
          id: "schedule-" + a.id,
          level: a.status === "BLOCKED" ? "warning" : "critical",
          title:
            a.status === "BLOCKED"
              ? "Reserva bloqueada"
              : "Término da reserva ultrapassado",
          description:
            (a.order?.equipmentId || a.plan?.equipmentId || "") +
            " · " +
            (a.order?.sapReference || a.order?.id || a.plan?.id),
          dueAt: a.endsAt,
          module: "scheduling",
          recordId: a.id,
          overdue: true,
        })),
        ...stalled.map((s) => ({
          id: "third-" + s.id,
          level: "warning",
          title: "Processo sem movimentação há mais de sete dias",
          description: s.provider + " · " + s.id,
          dueAt: s.stageEnteredAt,
          module: "third",
          recordId: s.id,
          overdue: true,
        })),
      ]
        .sort(
          (a, b) =>
            Number(b.level === "critical") - Number(a.level === "critical") ||
            new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime(),
        )
        .slice(0, 8);
      res.json({
        asOf: now,
        day: { from: start, to: end, timezone: "America/Sao_Paulo" },
        mode: process.env.DATA_MODE,
        counts: {
          equipment,
          openOrders,
          overdueOrders: lateOrderCount,
          overduePlans: latePlanCount,
          upcomingPlans: upcomingPlanCount,
          thirdPartyOpen: thirdCount,
          stalledServices: stalledCount,
          scheduleAttention: attentionCount,
          todayReservations: totalToday,
          alerts:
            lateOrderCount + latePlanCount + stalledCount + attentionCount,
        },
        alerts,
        today: today.map((a) => ({
          id: a.id,
          reference: a.order?.sapReference || a.orderId || a.planId,
          title: a.order?.description || a.plan?.title,
          equipmentId: a.order?.equipmentId || a.plan?.equipmentId,
          technician: a.technician.name,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          status: a.status,
        })),
        upcoming,
        recentActivity: recent,
        setup: canSetup
          ? {
              sectors,
              equipment,
              technicians,
              configuredTechnicians: configured,
              users,
            }
          : null,
      });
    }),
  );
  return r;
}
