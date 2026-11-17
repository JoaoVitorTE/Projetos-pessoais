import type { PrismaClient } from "@prisma/client";
import { HttpError } from "./helpers.js";
import {
  equipmentWhere,
  overlapMinutes,
  unionMinutes,
  type Filters,
} from "./domain.js";

export async function dashboard(db: PrismaClient, f: Filters) {
  const now = new Date(),
    to = f.to ? new Date(f.to) : now,
    from = f.from ? new Date(f.from) : new Date(to.getTime() - 30 * 86400000);
  if (from > to || to.getTime() - from.getTime() > 366 * 86400000)
    throw new HttpError(400, "Selecione um período válido de até 366 dias");
  const where = equipmentWhere(f);
  const [equipment, interruptions, orders, plans, executions] =
    await Promise.all([
      db.equipment.findMany({
        where,
        select: { id: true, name: true, status: true, criticality: true },
      }),
      db.interruption.findMany({
        where: {
          equipment: where,
          startedAt: { lt: to },
          OR: [{ endedAt: { gt: from } }, { endedAt: null }],
        },
        include: { equipment: { select: { id: true, name: true } } },
      }),
      db.maintenanceOrder.groupBy({
        by: ["status"],
        where: { equipment: where },
        _count: true,
      }),
      db.maintenancePlan.findMany({
        where: { equipment: where, active: true },
        select: { id: true, type: true, nextExecution: true },
      }),
      db.maintenanceExecution.findMany({
        where: {
          plan: { equipment: where },
          scheduledFor: { gte: from, lte: to },
        },
        select: { scheduledFor: true },
      }),
    ]);
  const bins = new Map<
    string,
    {
      date: string;
      minutes: number;
      count: number;
      planned: number;
      done: number;
    }
  >();
  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    bins.set(key, { date: key, minutes: 0, count: 0, planned: 0, done: 0 });
  }
  const finalKey = to.toISOString().slice(0, 10);
  if (!bins.has(finalKey))
    bins.set(finalKey, {
      date: finalKey,
      minutes: 0,
      count: 0,
      planned: 0,
      done: 0,
    });
  const eq = new Map<
      string,
      { name: string; count: number; minutes: number }
    >(),
    causes = new Map<string, number>();
  const grouped = new Map<string, typeof interruptions>();
  for (const i of interruptions) {
    grouped.set(i.equipmentId, [...(grouped.get(i.equipmentId) || []), i]);
    const minutes = overlapMinutes(i.startedAt, i.endedAt, from, to, now);
    const row = eq.get(i.equipmentId) || {
      name: i.equipmentId,
      count: 0,
      minutes: 0,
    };
    row.count++;
    row.minutes += minutes;
    eq.set(i.equipmentId, row);
    causes.set(i.reason, (causes.get(i.reason) || 0) + minutes);
    const startBin = bins.get(i.startedAt.toISOString().slice(0, 10));
    if (startBin && i.startedAt >= from && i.startedAt <= to) startBin.count++;
  }
  // União de intervalos por equipamento evita contar uma parada duas vezes quando registros se sobrepõem.
  for (const [id, intervals] of grouped) {
    eq.get(id)!.minutes = unionMinutes(intervals, from, to, now);
    for (const [key, bin] of bins) {
      const a = new Date(key + "T00:00:00Z"),
        b = new Date(a.getTime() + 86400000);
      bin.minutes += unionMinutes(
        intervals,
        new Date(Math.max(a.getTime(), from.getTime())),
        new Date(Math.min(b.getTime(), to.getTime())),
        now,
      );
    }
  }
  for (const plan of plans) {
    const bin = bins.get(plan.nextExecution.toISOString().slice(0, 10));
    if (bin && plan.nextExecution >= from && plan.nextExecution <= to)
      bin.planned++;
  }
  for (const execution of executions) {
    const bin =
      execution.scheduledFor &&
      bins.get(execution.scheduledFor.toISOString().slice(0, 10));
    if (bin) {
      bin.planned++;
      bin.done++;
    }
  }
  const planned = [...bins.values()].reduce((n, b) => n + b.planned, 0),
    done = executions.length;
  return {
    period: { from, to, groupingTimezone: "UTC" },
    dataMode: "demo",
    indicators: {
      equipment: equipment.length,
      running: equipment.filter((e) => e.status === "RUNNING").length,
      stopped: equipment.filter((e) => e.status !== "RUNNING").length,
      interruptions: interruptions.length,
      downtimeMinutes: Math.round(
        [...eq.values()].reduce((n, row) => n + row.minutes, 0),
      ),
      openOrders: orders
        .filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status))
        .reduce((n, o) => n + o._count, 0),
      overduePlans: plans.filter((p) => p.nextExecution < now).length,
      upcomingPlans: plans.filter(
        (p) =>
          p.nextExecution >= now &&
          p.nextExecution <= new Date(now.getTime() + 7 * 86400000),
      ).length,
      compliancePercent: planned ? Math.round((done / planned) * 100) : null,
      mttr: null,
      mtbf: null,
      oee: null,
    },
    trend: [...bins.values()].map((b) => ({
      ...b,
      minutes: Math.round(b.minutes),
    })),
    failuresByEquipment: [...eq.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    causes: [...causes]
      .map(([name, minutes]) => ({ name, minutes: Math.round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6),
    orderStatus: orders.map((o) => ({ status: o.status, count: o._count })),
    definitions: [
      "Estados de máquinas, OS abertas e vencimentos representam a situação atual; gráficos de interrupções usam o período selecionado.",
      "Parada soma intervalos únicos por equipamento no período, incluindo registros em andamento sem duplicar sobreposições. Não representa a parada da fábrica inteira. Motivos somam os registros informados e podem se sobrepor.",
      "MTTR exige tempos de reparo; MTBF exige horas de operação e falhas confirmadas; OEE exige disponibilidade, desempenho e qualidade. Esses dados ainda não foram cadastrados.",
      "Cumprimento compara execuções com vencimento original no período e planos atualmente previstos no período; não reconstrói planos históricos sem registros.",
    ],
  };
}
