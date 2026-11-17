import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import {
  overlapMinutes,
  unionMinutes,
} from "../src/modules/operations/domain.js";
const db = new PrismaClient(),
  app = createApp(db),
  origin = process.env.FRONTEND_ORIGIN!;
const equipmentId = "QA-" + randomUUID().slice(0, 8).toUpperCase();
let admin: string[], planner: string[], viewer: string[], technician: string[];
let order: any, otherOrder: any, plan: any, service: any, requirement: any;
const orderIds: string[] = [],
  planIds: string[] = [],
  serviceIds: string[] = [],
  requirementIds: string[] = [];
function call(
  method: "get" | "post" | "patch",
  path: string,
  cookie = admin,
  body?: unknown,
) {
  const r = request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", cookie);
  return body === undefined ? r : r.send(body);
}
const baseOrder = () => ({
  equipmentId,
  technicianId: "TEC-1",
  type: "CORRECTIVE",
  description: "Inspeção de demonstração para teste",
  priority: 3,
  scheduledAt: new Date(Date.now() - 86400000).toISOString(),
  notes: null,
  sapReference: null,
});
const baseService = () => ({
  provider: "Prestador de teste isolado",
  description: "Serviço fictício de teste",
  executedAt: new Date(Date.now() - 3600000).toISOString(),
  internalOwner: "Responsável de teste",
  orderId: otherOrder.id,
  purchaseReference: null,
  pendingNotes: null,
});
beforeAll(async () => {
  await db.loginThrottle.deleteMany();
  async function login(role: string) {
    const r = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: role + "@pcm.demo", password: process.env.SEED_PASSWORD });
    expect(r.status).toBe(200);
    return r.headers["set-cookie"] as unknown as string[];
  }
  [admin, planner, viewer, technician] = await Promise.all(
    ["admin", "planner", "viewer", "technician"].map(login),
  );
});
afterAll(async () => {
  await db.$transaction(async (tx) => {
    await tx.thirdPartyDocument.deleteMany({
      where: { serviceId: { in: serviceIds } },
    });
    await tx.thirdPartyMovement.deleteMany({
      where: { serviceId: { in: serviceIds } },
    });
    await tx.thirdPartyService.deleteMany({
      where: { id: { in: serviceIds } },
    });
    await tx.documentRequirement.deleteMany({
      where: { id: { in: requirementIds } },
    });
    await tx.maintenanceExecution.deleteMany({
      where: { planId: { in: planIds } },
    });
    await tx.maintenancePlan.deleteMany({ where: { id: { in: planIds } } });
    await tx.orderHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.maintenanceOrder.deleteMany({ where: { id: { in: orderIds } } });
    await tx.interruption.deleteMany({ where: { equipmentId } });
    await tx.equipment.deleteMany({ where: { id: equipmentId } });
  });
  await db.$disconnect();
});
describe("Equipamentos e interrupções", () => {
  it("nega escrita ao visualizador e valida entradas", async () => {
    expect(
      (await call("post", "/equipment", viewer, { id: equipmentId })).status,
    ).toBe(403);
    expect(
      (await call("post", "/equipment", admin, { id: equipmentId })).status,
    ).toBe(400);
  });
  it("cadastra equipamento e filtra por setor e criticidade", async () => {
    const r = await call("post", "/equipment", admin, {
      id: equipmentId,
      name: "Equipamento QA fictício",
      sectorId: "SEC-1",
      criticality: 3,
      status: "RUNNING",
    });
    expect(r.status).toBe(201);
    const list = await call(
      "get",
      "/equipment?sectorId=SEC-1&criticality=3&q=" + equipmentId,
      viewer,
    );
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(equipmentId);
  });
  it("identifica código duplicado e referência inválida", async () => {
    const body = {
      id: equipmentId,
      name: "Equipamento QA fictício",
      sectorId: "SEC-1",
      criticality: 3,
      status: "RUNNING",
    };
    expect((await call("post", "/equipment", admin, body)).status).toBe(409);
    expect(
      (
        await call("patch", "/equipment/" + equipmentId, admin, {
          name: body.name,
          sectorId: "not-found",
          version: 1,
          criticality: 3,
          status: "RUNNING",
        })
      ).status,
    ).toBe(400);
  });
  it("rejeita interrupção de duração negativa", async () => {
    const now = new Date();
    expect(
      (
        await call("post", "/interruptions", admin, {
          equipmentId,
          startedAt: now.toISOString(),
          endedAt: new Date(now.getTime() - 60000).toISOString(),
          type: "UNPLANNED",
          reason: "Motivo teste",
          description: "Descrição de teste",
        })
      ).status,
    ).toBe(400);
  });
  it("calcula duração e identifica recorrência por dias distintos", async () => {
    for (let i = 1; i <= 3; i++) {
      const t = Date.now() - i * 86400000;
      const r = await call("post", "/interruptions", technician, {
        equipmentId,
        startedAt: new Date(t).toISOString(),
        endedAt: new Date(t + 600000).toISOString(),
        type: "UNPLANNED",
        reason: "Motivo recorrente QA",
        description: "Ocorrência de demonstração",
      });
      expect(r.status).toBe(201);
      expect(r.body.durationMinutes).toBe(10);
    }
    const r = await call(
      "get",
      "/interruptions/recurrence?equipmentId=" + equipmentId,
    );
    expect(r.body.items[0].occurrences).toBe(3);
    expect(r.body.items[0].days).toBe(3);
    expect(r.body.rule).toContain("não representa diagnóstico");
  });
  it("mantém interrupção sem término em andamento", async () => {
    const r = await call("post", "/interruptions", admin, {
      equipmentId,
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      endedAt: null,
      type: "UNPLANNED",
      reason: "Acompanhamento em teste",
      description: "Registro aberto de demonstração",
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("OPEN");
    expect(r.body.durationMinutes).toBeNull();
  });
});
describe("Ordens locais, histórico e concorrência", () => {
  it("cria OS interna e registra histórico", async () => {
    let r = await call("post", "/orders", planner, baseOrder());
    expect(r.status).toBe(201);
    order = r.body;
    orderIds.push(order.id);
    expect(order.id).toMatch(/^OS-LOCAL-/);
    r = await call("get", "/orders/" + order.id, viewer);
    expect(r.body.history).toHaveLength(1);
    expect(r.body.history[0].action).toBe("CREATED");
    const other = await call("post", "/orders", admin, {
      ...baseOrder(),
      technicianId: "TEC-2",
    });
    expect(other.status).toBe(201);
    otherOrder = other.body;
    orderIds.push(otherOrder.id);
  });
  it("detecta atraso e exporta somente o filtro solicitado", async () => {
    const r = await call(
      "get",
      "/orders?q=" + order.id + "&overdue=true",
      viewer,
    );
    expect(r.body.total).toBe(1);
    expect(r.body.items[0].overdue).toBe(true);
    const csv = await call("get", "/orders/export.csv?q=" + order.id, viewer);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain(order.id);
    expect(csv.text).not.toContain(otherOrder.id);
  });
  it("bloqueia alteração fora da atribuição técnica", async () => {
    const r = await call("patch", "/orders/" + otherOrder.id, technician, {
      version: otherOrder.version,
      status: "IN_PROGRESS",
      changeNote: "Tentativa sem vínculo",
    });
    expect(r.status).toBe(403);
  });
  it("nega salto de status e mutação de cadastro por técnico", async () => {
    expect(
      (
        await call("patch", "/orders/" + order.id, technician, {
          version: order.version,
          status: "COMPLETED",
          changeNote: "Salto de status",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("patch", "/orders/" + order.id, technician, {
          version: order.version,
          priority: 1,
          status: "IN_PROGRESS",
          changeNote: "Tentativa de mudar prioridade",
        })
      ).status,
    ).toBe(403);
  });
  it("protege alterações simultâneas e permite apontamento técnico", async () => {
    const replies = await Promise.all([
      call("patch", "/orders/" + order.id, planner, {
        version: order.version,
        status: "ANALYSIS",
        changeNote: "Analisar solicitação",
      }),
      call("patch", "/orders/" + order.id, planner, {
        version: order.version,
        status: "SCHEDULED",
        changeNote: "Programar solicitação",
      }),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
    order = replies.find((r) => r.status === 200)!.body;
    const run = await call("patch", "/orders/" + order.id, technician, {
      version: order.version,
      status: "IN_PROGRESS",
      changeNote: "Início da execução",
    });
    expect(run.status).toBe(200);
    order = run.body;
  });
  it("conclui e mantém histórico imutável de transições", async () => {
    const r = await call("patch", "/orders/" + order.id, technician, {
      version: order.version,
      status: "COMPLETED",
      changeNote: "Execução concluída em teste",
    });
    expect(r.status).toBe(200);
    order = r.body;
    expect(order.completedAt).toBeTruthy();
    expect(
      (
        await call("patch", "/orders/" + order.id, planner, {
          version: order.version,
          status: "OPEN",
          changeNote: "Reabrir sem autorização",
        })
      ).status,
    ).toBe(409);
    const detail = await call("get", "/orders/" + order.id);
    expect(detail.body.history).toHaveLength(4);
  });
});
describe("Planos, calendário e execução", () => {
  it("cria plano com periodicidade validada", async () => {
    const body = {
      title: "Lubrificação QA",
      equipmentId,
      technicianId: "TEC-1",
      type: "LUBRICATION",
      intervalDays: 7,
      nextExecution: new Date(Date.now() - 86400000).toISOString(),
      active: true,
    };
    expect((await call("post", "/plans", viewer, body)).status).toBe(403);
    expect(
      (await call("post", "/plans", planner, { ...body, intervalDays: 0 }))
        .status,
    ).toBe(400);
    const r = await call("post", "/plans", planner, body);
    expect(r.status).toBe(201);
    plan = r.body;
    planIds.push(plan.id);
  });
  it("registra conclusão uma única vez e avança vencimento", async () => {
    const body = {
      version: plan.version,
      executedAt: new Date().toISOString(),
      notes: "Lubrificação realizada no teste",
    };
    const r = await call(
      "post",
      "/plans/" + plan.id + "/complete",
      technician,
      body,
    );
    expect(r.status).toBe(201);
    expect(new Date(r.body.nextExecution).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(
      (await call("post", "/plans/" + plan.id + "/complete", technician, body))
        .status,
    ).toBe(409);
    const detail = await call("get", "/plans/" + plan.id);
    expect(detail.body.executions).toHaveLength(1);
    expect(detail.body.executions[0].scheduledFor).toBe(plan.nextExecution);
    plan = detail.body;
  });
  it("filtra vencimentos por intervalo do calendário", async () => {
    const from = new Date(Date.now() - 86400000).toISOString(),
      to = new Date(Date.now() + 10 * 86400000).toISOString();
    const r = await call(
      "get",
      "/plans?equipmentId=" +
        equipmentId +
        "&from=" +
        encodeURIComponent(from) +
        "&to=" +
        encodeURIComponent(to),
    );
    expect(r.body.items.some((p: any) => p.id === plan.id)).toBe(true);
  });
});
describe("Terceiros e checklist configurado pelo administrador", () => {
  it("restringe consulta técnica e configuração de requisitos", async () => {
    expect((await call("get", "/third-parties", technician)).status).toBe(403);
    expect(
      (
        await call("post", "/document-requirements", planner, {
          name: "Requisito QA",
        })
      ).status,
    ).toBe(403);
    const r = await call("post", "/document-requirements", admin, {
      name: "Requisito QA " + equipmentId,
    });
    expect(r.status).toBe(201);
    requirement = r.body;
    requirementIds.push(requirement.id);
  });
  it("cria processo e protege valores financeiros", async () => {
    expect(
      (
        await call("post", "/third-parties", planner, {
          ...baseService(),
          amount: 100,
        })
      ).status,
    ).toBe(403);
    const r = await call("post", "/third-parties", admin, {
      ...baseService(),
      amount: 123.45,
    });
    expect(r.status).toBe(201);
    service = r.body;
    serviceIds.push(service.id);
    const read = await call("get", "/third-parties/" + service.id, planner);
    expect(read.body).not.toHaveProperty("amount");
    expect(read.body.missingRequirements).toHaveLength(1);
  });
  it("impede saltos de etapa e avança somente em sequência", async () => {
    expect(
      (
        await call(
          "post",
          "/third-parties/" + service.id + "/transition",
          planner,
          {
            version: service.version,
            status: "FINISHED",
            notes: "Pular etapas",
          },
        )
      ).status,
    ).toBe(409);
    for (const status of ["EXECUTED", "DOCUMENTS_RECEIVED", "CHECKING"]) {
      const r = await call(
        "post",
        "/third-parties/" + service.id + "/transition",
        planner,
        {
          version: service.version,
          status,
          notes: "Movimentação de teste revisada",
        },
      );
      expect(r.status).toBe(200);
      service = r.body;
    }
  });
  it("exige documentos conferidos para preparar a regularização", async () => {
    expect(
      (
        await call(
          "post",
          "/third-parties/" + service.id + "/transition",
          planner,
          {
            version: service.version,
            status: "PREPARED",
            notes: "Teste sem documentos",
          },
        )
      ).status,
    ).toBe(409);
    const r = await call(
      "post",
      "/third-parties/" + service.id + "/documents",
      planner,
      {
        version: service.version,
        name: "Documento fictício de teste",
        reference: "Referência local QA-001",
        requirementId: requirement.id,
        verified: false,
      },
    );
    expect(r.status).toBe(201);
    let detail = await call("get", "/third-parties/" + service.id);
    expect(detail.body.missingRequirements).toHaveLength(1);
    service = detail.body;
    const check = await call(
      "patch",
      "/third-parties/" + service.id + "/documents/" + r.body.id,
      planner,
      { version: service.version, verified: true },
    );
    expect(check.status).toBe(200);
    detail = await call("get", "/third-parties/" + service.id);
    service = detail.body;
    expect(service.missingRequirements).toHaveLength(0);
  });
  it("reserva validação e finalização ao gestor", async () => {
    let r = await call(
      "post",
      "/third-parties/" + service.id + "/transition",
      planner,
      {
        version: service.version,
        status: "PREPARED",
        notes: "Documentos revisados pelo planejador",
      },
    );
    expect(r.status).toBe(200);
    service = r.body;
    expect(
      (
        await call(
          "post",
          "/third-parties/" + service.id + "/transition",
          planner,
          {
            version: service.version,
            status: "VALIDATED",
            notes: "Validação não autorizada",
          },
        )
      ).status,
    ).toBe(403);
    for (const status of [
      "VALIDATED",
      "SENT_TO_CENTRAL",
      "FINANCE",
      "FINISHED",
    ]) {
      r = await call(
        "post",
        "/third-parties/" + service.id + "/transition",
        admin,
        {
          version: service.version,
          status,
          notes: "Revisão humana para demonstração",
        },
      );
      expect(r.status).toBe(200);
      service = r.body;
    }
    const detail = await call("get", "/third-parties/" + service.id, admin);
    expect(detail.body.movements).toHaveLength(9);
    expect(detail.body.draftMessage).toContain("Nenhum envio ou aprovação");
  });
  it("não permite alterar documentos de processo finalizado", async () => {
    expect(
      (
        await call(
          "post",
          "/third-parties/" + service.id + "/documents",
          admin,
          {
            version: service.version,
            name: "Teste indevido",
            reference: "Referência indevida",
            requirementId: null,
            verified: false,
          },
        )
      ).status,
    ).toBe(409);
  });
});
describe("Filtros combinados", () => {
  it("não ignora status encerrado ao filtrar atrasos", async () => {
    const orders = await call("get", "/orders?status=COMPLETED&overdue=true");
    expect(orders.body.total).toBe(0);
    const services = await call(
      "get",
      "/third-parties?status=FINISHED&overdue=true",
    );
    expect(services.body.total).toBe(0);
  });
});
describe("Solicitação sem execução", () => {
  it("não exige uma data fictícia antes de executar o serviço", async () => {
    const r = await call("post", "/third-parties", planner, {
      ...baseService(),
      executedAt: null,
    });
    expect(r.status).toBe(201);
    serviceIds.push(r.body.id);
    expect(
      (
        await call(
          "post",
          "/third-parties/" + r.body.id + "/transition",
          planner,
          {
            version: r.body.version,
            status: "EXECUTED",
            notes: "Ainda não executado",
          },
        )
      ).status,
    ).toBe(409);
  });
});
describe("Indicadores fundamentados", () => {
  it("calcula somente dados do equipamento filtrado", async () => {
    const r = await call("get", "/dashboard?equipmentId=" + equipmentId);
    expect(r.status).toBe(200);
    expect(r.body.indicators.equipment).toBe(1);
    expect(r.body.indicators.interruptions).toBe(4);
    expect(r.body.indicators.downtimeMinutes).toBeGreaterThanOrEqual(60);
    expect(r.body.indicators.mttr).toBeNull();
    expect(r.body.indicators.mtbf).toBeNull();
    expect(r.body.indicators.oee).toBeNull();
  });
  it("não duplica minutos de registros sobrepostos", () => {
    const intervals = [
      {
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T01:00:00Z"),
      },
      {
        startedAt: new Date("2026-01-01T00:30:00Z"),
        endedAt: new Date("2026-01-01T01:30:00Z"),
      },
    ];
    expect(
      unionMinutes(
        intervals,
        new Date("2026-01-01"),
        new Date("2026-01-02"),
        new Date("2026-01-03"),
      ),
    ).toBe(90);
  });
  it("rejeita intervalos maiores que um ano", async () => {
    const r = await call(
      "get",
      "/dashboard?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z",
    );
    expect(r.status).toBe(400);
  });
  it("recorta duração corretamente ao cruzar o período", () => {
    expect(
      overlapMinutes(
        new Date("2026-01-01T23:30:00Z"),
        new Date("2026-01-02T01:00:00Z"),
        new Date("2026-01-02T00:00:00Z"),
        new Date("2026-01-03T00:00:00Z"),
        new Date("2026-01-04T00:00:00Z"),
      ),
    ).toBe(60);
  });
});
