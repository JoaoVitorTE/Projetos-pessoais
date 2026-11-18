import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createApp } from "../src/app.js";
import {
  fits,
  firstSlot,
  workIntervals,
  minutes,
  subtract,
} from "../src/modules/scheduling/intervals.js";
const db = new PrismaClient(),
  app = createApp(db),
  origin = process.env.FRONTEND_ORIGIN!,
  tag = "QA-SCH-" + randomUUID().slice(0, 7).toUpperCase();
const equipment = [tag + "-A", tag + "-B"];
let admin: string[], planner: string[], viewer: string[], technician: string[];
const orders: string[] = [],
  plans: string[] = [],
  assignments: string[] = [],
  windows: string[] = [],
  absences: string[] = [];
let first: any, stage: any, plan: any;
const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  at = (time: string) =>
    fromZonedTime(day + "T" + time, "America/Sao_Paulo").toISOString(),
  from = new Date(Date.now() - 3600000).toISOString(),
  to = new Date(Date.now() + 7 * 86400000).toISOString(),
  params = "from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
function call(
  method: "get" | "post" | "patch",
  path: string,
  body?: unknown,
  cookie = admin,
) {
  const r = request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);
  return body === undefined ? r : r.send(body);
}
async function makeOrder(gear = equipment[0], priority = 2) {
  const r = await call("post", "/orders", {
    equipmentId: gear,
    technicianId: "TEC-1",
    type: "CORRECTIVE",
    description: "Atividade fictícia " + tag,
    priority,
    scheduledAt: new Date(Date.now() - 86400000).toISOString(),
    notes: null,
    sapReference: null,
  });
  expect(r.status).toBe(201);
  orders.push(r.body.id);
  return r.body;
}
async function getOrder(id: string) {
  return (await call("get", "/orders/" + id)).body;
}
async function book(
  id: string,
  start = at("09:00"),
  end = at("10:00"),
  tech = "TEC-1",
  kind = "ORDER",
) {
  const source =
    kind === "ORDER"
      ? await getOrder(id)
      : (await call("get", "/plans/" + id)).body;
  const body = {
    kind,
    targetId: id,
    targetVersion: source.version,
    technicianId: tech,
    startsAt: start,
    endsAt: end,
    notes: "Reserva revisada no teste isolado",
    reviewConfirmed: true,
  };
  const r = await call("post", "/scheduling/assignments", body);
  if (r.status === 201) assignments.push(r.body.id);
  return r;
}
async function detail(id: string) {
  const r = await call("get", "/scheduling/assignments/" + id);
  expect(r.status).toBe(200);
  return r.body;
}
async function action(
  id: string,
  kind: string,
  extra: any = {},
  cookie = admin,
) {
  const a = await detail(id);
  return call(
    "post",
    "/scheduling/assignments/" + id + "/" + kind,
    {
      version: a.version,
      targetVersion: a.targetVersion,
      notes: "Apontamento humano fictício " + tag,
      ...extra,
    },
    cookie,
  );
}
beforeAll(async () => {
  await db.loginThrottle.deleteMany();
  [admin, planner, viewer, technician] = await Promise.all(
    ["admin", "planner", "viewer", "technician"].map(async (role) => {
      const r = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({
          email: role + "@pcm.demo",
          password: process.env.SEED_PASSWORD,
        });
      expect(r.status).toBe(200);
      return r.headers["set-cookie"] as unknown as string[];
    }),
  );
  for (let i = 0; i < equipment.length; i++)
    expect(
      (
        await call("post", "/equipment", {
          id: equipment[i],
          tag: equipment[i],
          name: "Equipamento fictício " + tag,
          sectorId: "SEC-" + (i + 1),
          criticality: i === 0 ? 3 : 1,
          status: "UNKNOWN",
        })
      ).status,
    ).toBe(201);
});
afterAll(async () => {
  await db.$transaction(async (tx) => {
    await tx.assignmentHistory.deleteMany({
      where: { assignmentId: { in: assignments } },
    });
    await tx.technicianAssignment.deleteMany({
      where: { id: { in: assignments } },
    });
    await tx.technicianWorkWindow.deleteMany({
      where: { id: { in: windows } },
    });
    await tx.technicianAbsence.deleteMany({ where: { id: { in: absences } } });
    await tx.maintenanceExecution.deleteMany({
      where: { planId: { in: plans } },
    });
    await tx.maintenancePlan.deleteMany({ where: { id: { in: plans } } });
    await tx.orderHistory.deleteMany({ where: { orderId: { in: orders } } });
    await tx.maintenanceOrder.deleteMany({ where: { id: { in: orders } } });
    await tx.interruption.deleteMany({
      where: { equipmentId: { in: equipment } },
    });
    await tx.equipment.deleteMany({ where: { id: { in: equipment } } });
  });
  await db.$disconnect();
});
describe("Intervalos, jornadas e limites de turno", () => {
  it("respeita pausas e intervalos adjacentes sem duplicar capacidade", () => {
    const a = new Date("2026-11-18T11:00:00Z"),
      b = new Date("2026-11-18T20:00:00Z");
    const work = workIntervals(
      [
        { weekday: 3, startMinute: 480, endMinute: 720, active: true },
        { weekday: 3, startMinute: 780, endMinute: 1020, active: true },
      ],
      a,
      b,
    );
    expect(minutes(work)).toBe(480);
    expect(
      fits(
        {
          start: new Date("2026-11-18T14:00Z").getTime(),
          end: new Date("2026-11-18T17:00Z").getTime(),
        },
        work,
      ),
    ).toBe(false);
    expect(
      firstSlot(
        work,
        [{ start: a.getTime(), end: new Date("2026-11-18T15:00Z").getTime() }],
        60,
        a.getTime(),
      )?.start,
    ).toBe(new Date("2026-11-18T16:00Z").getTime());
  });
  it("combina jornadas noturnas de dias diferentes em São Paulo", () => {
    const a = new Date("2026-11-22T02:00Z"),
      b = new Date("2026-11-22T05:00Z");
    expect(
      fits(
        { start: a.getTime(), end: b.getTime() },
        workIntervals(
          [
            { weekday: 6, startMinute: 1260, endMinute: 1440, active: true },
            { weekday: 0, startMinute: 0, endMinute: 360, active: true },
          ],
          a,
          b,
        ),
      ),
    ).toBe(true);
  });
  it("não conta intervalos vazios e subtrai ausências sobrepostas uma vez", () => {
    expect(
      minutes(
        subtract(
          [{ start: 0, end: 3600000 }],
          [
            { start: 600000, end: 1800000 },
            { start: 1200000, end: 2400000 },
          ],
        ),
      ),
    ).toBe(30);
  });
});
describe("Disponibilidade e programação", () => {
  it("protege escrita de visualizador e técnico e exige período limitado", async () => {
    expect(
      (await call("post", "/scheduling/work-windows", {}, viewer)).status,
    ).toBe(403);
    expect(
      (await call("post", "/scheduling/assignments", {}, technician)).status,
    ).toBe(403);
    expect(
      (
        await call(
          "get",
          "/scheduling?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z",
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("get", "/scheduling?" + params, undefined, viewer)).status,
    ).toBe(200);
  });
  it("não presume jornada e configura explicitamente janelas semanais", async () => {
    first = await makeOrder();
    const denied = await book(first.id);
    expect(denied.status).toBe(409);
    expect(denied.body.error).toContain("jornada");
    for (const tech of ["TEC-1", "TEC-2"])
      for (let weekday = 0; weekday < 7; weekday++) {
        const r = await call(
          "post",
          "/scheduling/work-windows",
          {
            technicianId: tech,
            weekday,
            startMinute: 0,
            endMinute: 1440,
            active: true,
          },
          planner,
        );
        expect(r.status).toBe(201);
        windows.push(r.body.id);
      }
    expect(
      (
        await call("post", "/scheduling/work-windows", {
          technicianId: "TEC-1",
          weekday: 1,
          startMinute: 480,
          endMinute: 1020,
          active: true,
        })
      ).status,
    ).toBe(409);
  });
  it("reserva horário e mantém OS e histórico vinculados", async () => {
    const r = await book(first.id);
    expect(r.status).toBe(201);
    stage = r.body;
    expect(stage.orderId).toBe(first.id);
    expect(stage.targetVersion).toBeGreaterThan(first.version);
    expect((await getOrder(first.id)).status).toBe("SCHEDULED");
    const d = await detail(stage.id);
    expect(d.history[0].action).toBe("CREATED");
    expect(d.history[0].user.name).toBeTruthy();
  });
  it("bloqueia conflito de técnico entre setores e conflito de equipamento", async () => {
    const other = await makeOrder(equipment[1]);
    expect((await book(other.id)).status).toBe(409);
    const same = await makeOrder(equipment[0]);
    const r = await book(same.id, at("09:00"), at("10:00"), "TEC-2");
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Equipamento");
    const adjacent = await book(other.id, at("10:00"), at("11:00"));
    expect(adjacent.status).toBe(201);
  });
  it("não permite mudar responsável/data da OS por fora da agenda", async () => {
    const o = await getOrder(first.id);
    expect(
      (
        await call("patch", "/orders/" + o.id, {
          version: o.version,
          scheduledAt: at("12:00"),
          changeNote: "Tentativa de alterar reserva",
        })
      ).status,
    ).toBe(409);
  });
  it("reduzir jornada, incluir ausência ou inativar técnico exige resolver reservas", async () => {
    const weekday = new Date(day + "T12:00Z").getUTCDay(),
      w = await db.technicianWorkWindow.findFirstOrThrow({
        where: { technicianId: "TEC-1", weekday, id: { in: windows } },
      });
    expect(
      (
        await call("patch", "/scheduling/work-windows/" + w.id, {
          technicianId: "TEC-1",
          weekday,
          startMinute: 0,
          endMinute: 480,
          active: true,
          version: w.version,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("post", "/scheduling/absences", {
          technicianId: "TEC-1",
          startsAt: at("09:30"),
          endsAt: at("11:30"),
          reason: "Treinamento fictício",
          active: true,
        })
      ).status,
    ).toBe(409);
    const tech = await db.technician.findUniqueOrThrow({
      where: { id: "TEC-1" },
    });
    expect(
      (
        await call("patch", "/admin/technicians/TEC-1", {
          name: tech.name,
          specialty: tech.specialty,
          active: false,
        })
      ).status,
    ).toBe(409);
  });
  it("ausência registrada impede reserva e pode ser desativada com versão", async () => {
    const r = await call("post", "/scheduling/absences", {
      technicianId: "TEC-1",
      startsAt: at("13:00"),
      endsAt: at("14:00"),
      reason: "Treinamento fictício",
      active: true,
    });
    expect(r.status).toBe(201);
    absences.push(r.body.id);
    const o = await makeOrder();
    expect((await book(o.id, at("13:00"), at("14:00"))).status).toBe(409);
    expect(
      (
        await call("patch", "/scheduling/absences/" + r.body.id, {
          technicianId: "TEC-1",
          startsAt: at("13:00"),
          endsAt: at("14:00"),
          reason: "Treinamento cancelado",
          active: false,
          version: r.body.version,
        })
      ).status,
    ).toBe(200);
    expect((await book(o.id, at("13:00"), at("14:00"))).status).toBe(201);
  });
  it("confirmação exige revisão humana e preview não cria reserva", async () => {
    const o = await makeOrder(equipment[1]),
      body = {
        kind: "ORDER",
        targetId: o.id,
        targetVersion: o.version,
        technicianId: "TEC-2",
        startsAt: at("14:00"),
        endsAt: at("15:00"),
      };
    const count = await db.technicianAssignment.count();
    expect((await call("post", "/scheduling/check", body)).body.available).toBe(
      true,
    );
    expect(await db.technicianAssignment.count()).toBe(count);
    expect(
      (
        await call("post", "/scheduling/assignments", {
          ...body,
          notes: "Sem confirmação",
          reviewConfirmed: false,
        })
      ).status,
    ).toBe(400);
  });
  it("duas confirmações simultâneas não reservam o mesmo técnico", async () => {
    const a = await makeOrder(),
      b = await makeOrder(equipment[1]);
    const replies = await Promise.all([
      book(a.id, at("15:00"), at("16:00")),
      book(b.id, at("15:00"), at("16:00")),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it("protege reprogramação contra versão antiga e registra antes/depois", async () => {
    const a = await detail(stage.id),
      body = {
        kind: "ORDER",
        targetId: first.id,
        targetVersion: a.targetVersion,
        technicianId: "TEC-1",
        startsAt: at("11:00"),
        endsAt: at("12:00"),
        notes: "Reprogramação revisada",
        reviewConfirmed: true,
        version: a.version,
      };
    const r = await call("patch", "/scheduling/assignments/" + a.id, body);
    expect(r.status).toBe(200);
    expect(
      (await call("patch", "/scheduling/assignments/" + a.id, body)).status,
    ).toBe(409);
    const d = await detail(a.id);
    expect(d.history[0].action).toBe("RESCHEDULED");
    expect(d.history[0].before.startsAt).toBe(at("09:00"));
  });
  it("capacidade considera reservas em outros setores", async () => {
    const r = await call(
      "get",
      "/scheduling?" + params + "&sectorId=SEC-2&technicianId=TEC-1",
    );
    expect(r.status).toBe(200);
    const t = r.body.capacity[0];
    expect(t.bookedMinutes).toBeGreaterThan(60);
    expect(t.freeMinutes).toBeLessThan(t.capacityMinutes);
  });
  it("recusa começar reserva futura", async () => {
    expect((await action(stage.id, "start")).status).toBe(409);
  });
});
describe("Execução, etapas e sincronização", () => {
  it("técnico só inicia sua atividade e registra conclusão parcial", async () => {
    const o = await makeOrder(equipment[1]);
    const b = await book(
      o.id,
      new Date(Date.now() - 60000).toISOString(),
      new Date(Date.now() + 1800000).toISOString(),
      "TEC-2",
    );
    expect(b.status).toBe(201);
    expect((await action(b.body.id, "start", {}, technician)).status).toBe(403);
    expect((await action(b.body.id, "start")).status).toBe(200);
    expect(
      (await action(b.body.id, "complete", { finishTarget: false })).status,
    ).toBe(200);
    expect((await getOrder(o.id)).status).toBe("IN_PROGRESS");
    expect((await detail(b.body.id)).status).toBe("COMPLETED");
  });
  it("concluir OS pela agenda cancela reservas futuras sem inventar execução", async () => {
    const o = await makeOrder();
    const future = await book(o.id, at("18:00"), at("19:00"));
    expect(future.status).toBe(201);
    const b = await book(
      o.id,
      new Date(Date.now() - 60000).toISOString(),
      new Date(Date.now() + 1800000).toISOString(),
    );
    expect(b.status).toBe(201);
    expect((await action(b.body.id, "start", {}, technician)).status).toBe(200);
    expect(
      (await action(b.body.id, "complete", { finishTarget: true }, technician))
        .status,
    ).toBe(200);
    expect((await getOrder(o.id)).status).toBe("COMPLETED");
    expect((await detail(future.body.id)).status).toBe("CANCELLED");
    expect(
      (await action(b.body.id, "complete", { finishTarget: true })).status,
    ).toBe(409);
  });
  it("registra preventiva pela agenda com vencimento e técnico efetivo", async () => {
    const r = await call("post", "/plans", {
      title: "Plano fictício " + tag,
      equipmentId: equipment[0],
      technicianId: "TEC-1",
      type: "LUBRICATION",
      intervalDays: 7,
      nextExecution: new Date(Date.now() - 86400000).toISOString(),
      active: true,
    });
    expect(r.status).toBe(201);
    plan = r.body;
    plans.push(plan.id);
    const b = await book(
      plan.id,
      new Date(Date.now() - 60000).toISOString(),
      new Date(Date.now() + 1800000).toISOString(),
      "TEC-1",
      "PLAN",
    );
    expect(b.status).toBe(201);
    expect((await action(b.body.id, "start", {}, technician)).status).toBe(200);
    expect(
      (await action(b.body.id, "complete", { finishTarget: true }, technician))
        .status,
    ).toBe(200);
    const p = (await call("get", "/plans/" + plan.id)).body;
    expect(p.executions).toHaveLength(1);
    expect(p.executions[0].scheduledFor).toBe(plan.nextExecution);
    expect(new Date(p.nextExecution) > new Date()).toBe(true);
  });
  it("encerramento externo da OS sincroniza a reserva e preserva histórico", async () => {
    const o = await makeOrder(equipment[1]);
    const b = await book(o.id, at("20:00"), at("21:00"));
    expect(b.status).toBe(201);
    const fresh = await getOrder(o.id);
    expect(
      (
        await call("patch", "/orders/" + o.id, {
          version: fresh.version,
          status: "CANCELLED",
          changeNote: "Cancelamento autorizado em teste",
        })
      ).status,
    ).toBe(200);
    expect((await detail(b.body.id)).status).toBe("CANCELLED");
  });
  it("cancelar reserva não cancela a OS e libera o horário", async () => {
    const a = await detail(stage.id);
    expect((await action(a.id, "cancel")).status).toBe(200);
    expect((await getOrder(first.id)).status).not.toBe("CANCELLED");
    expect((await detail(a.id)).history[0].action).toBe("CANCELLED");
  });
  it("aguardar peça bloqueia a reserva e mantém o histórico da OS", async () => {
    const o = await makeOrder(equipment[1]),
      b = await book(
        o.id,
        new Date(Date.now() - 60000).toISOString(),
        new Date(Date.now() + 1800000).toISOString(),
      );
    expect(b.status).toBe(201);
    expect((await action(b.body.id, "start")).status).toBe(200);
    const fresh = await getOrder(o.id);
    expect(
      (
        await call("patch", "/orders/" + o.id, {
          version: fresh.version,
          status: "WAITING_PART",
          changeNote: "Peça pendente em teste",
        })
      ).status,
    ).toBe(200);
    expect((await detail(b.body.id)).status).toBe("BLOCKED");
    expect((await action(b.body.id, "start")).status).toBe(409);
    expect((await action(b.body.id, "cancel")).status).toBe(200);
    expect((await getOrder(o.id)).status).toBe("WAITING_PART");
  });
  it("o módulo preventivo protege a data reservada e encerra reservas quando a execução é registrada fora da agenda", async () => {
    const b = await book(plan.id, at("21:00"), at("22:00"), "TEC-1", "PLAN");
    expect(b.status).toBe(201);
    const p = (await call("get", "/plans/" + plan.id)).body;
    expect(
      (
        await call("patch", "/plans/" + p.id, {
          title: p.title,
          equipmentId: p.equipmentId,
          technicianId: p.technicianId,
          type: p.type,
          intervalDays: p.intervalDays,
          nextExecution: at("23:00"),
          active: p.active,
          version: p.version,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("post", "/plans/" + p.id + "/complete", {
          version: p.version,
          executedAt: new Date().toISOString(),
          notes: "Execução antecipada confirmada em teste",
        })
      ).status,
    ).toBe(201);
    expect((await detail(b.body.id)).status).toBe("CANCELLED");
  });
  it("uma execução que ultrapassou o horário impede começar outra para o mesmo técnico", async () => {
    const o = await makeOrder(),
      b = await book(
        o.id,
        new Date(Date.now() - 60000).toISOString(),
        new Date(Date.now() + 1800000).toISOString(),
      );
    expect(b.status).toBe(201);
    expect((await action(b.body.id, "start")).status).toBe(200);
    // Simula uma reserva iniciada no passado que ainda não foi encerrada.
    await db.technicianAssignment.update({
      where: { id: b.body.id },
      data: {
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
        actualStartedAt: new Date(Date.now() - 7200000),
        version: { increment: 1 },
      },
    });
    const other = await makeOrder(equipment[1]),
      next = await book(
        other.id,
        new Date(Date.now() - 60000).toISOString(),
        new Date(Date.now() + 1800000).toISOString(),
      );
    expect(next.status).toBe(201);
    expect((await action(next.body.id, "start")).status).toBe(409);
    expect(
      (await action(b.body.id, "complete", { finishTarget: false })).status,
    ).toBe(200);
    expect((await action(next.body.id, "cancel")).status).toBe(200);
  });
});
describe("Sugestões explicáveis e consultas", () => {
  it("prioriza fatos, considera dependências e não grava propostas", async () => {
    const urgent = await makeOrder(equipment[0], 3),
      waiting = await makeOrder(equipment[1], 3);
    let o = await getOrder(waiting.id);
    expect(
      (
        await call("patch", "/orders/" + o.id, {
          version: o.version,
          status: "IN_PROGRESS",
          changeNote: "Início fictício",
        })
      ).status,
    ).toBe(200);
    o = await getOrder(o.id);
    expect(
      (
        await call("patch", "/orders/" + o.id, {
          version: o.version,
          status: "WAITING_PART",
          changeNote: "Peça indisponível informada",
        })
      ).status,
    ).toBe(200);
    const count = await db.technicianAssignment.count();
    const r = await call(
      "get",
      "/scheduling/suggestions?" +
        params +
        "&equipmentId=" +
        equipment[0] +
        "&durationMinutes=60",
    );
    expect(r.status).toBe(200);
    expect(r.body.method).toContain("Não é probabilidade");
    const candidate = r.body.items.find((p: any) => p.id === urgent.id);
    expect(candidate.evidence.criticality).toBe(3);
    expect(candidate.evidence.priority).toBe(3);
    expect(candidate.slot).toBeTruthy();
    const blockedResponse = await call(
      "get",
      "/scheduling/suggestions?" + params + "&equipmentId=" + equipment[1],
    );
    const blocked = blockedResponse.body.items.find(
      (p: any) => p.id === waiting.id,
    );
    expect(blocked.slot).toBeNull();
    expect(blocked.reason).toContain("peça");
    expect(await db.technicianAssignment.count()).toBe(count);
    expect(
      (
        await call(
          "get",
          "/scheduling/suggestions?" + params,
          undefined,
          viewer,
        )
      ).status,
    ).toBe(403);
  });
  it("assistente consulta reservas de amanhã com período e sem alterações", async () => {
    const r = await call("post", "/assistant/query", {
      question: "O que está programado para amanhã?",
    });
    expect(r.status).toBe(200);
    expect(r.body.intent).toBe("TOMORROW");
    expect(r.body.facts[0]).toContain("Reservas confirmadas");
    expect(
      r.body.items.every((i: any) => i.startsAt && i.endsAt && i.technician),
    ).toBe(true);
  });
});
