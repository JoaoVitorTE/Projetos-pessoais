import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  date,
  filters,
  managers,
  optionalText,
  planners,
  SERVICE_STAGES,
  serviceTransitions,
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
const reads = ["ADMIN", "MANAGER", "PLANNER", "VIEWER"] as const;
const form = z
  .object({
    provider: z.string().trim().min(3).max(160),
    description: text,
    executedAt: date.nullable(),
    internalOwner: z.string().trim().min(3).max(120),
    orderId: z.string().min(1),
    purchaseReference: z.string().trim().max(100).nullable().optional(),
    amount: z
      .number()
      .finite()
      .min(0)
      .max(9999999999.99)
      .multipleOf(0.01)
      .nullable()
      .optional(),
    pendingNotes: optionalText,
  })
  .strict();
function visible<T extends { amount: unknown }>(row: T, role: string) {
  if (!["ADMIN", "MANAGER"].includes(role)) {
    const { amount, ...rest } = row;
    return rest;
  }
  return row;
}
export function thirdPartiesRouter(db: PrismaClient) {
  const r = Router();
  r.get(
    "/document-requirements",
    run(async (_req, res) => {
      requireRole(res, [...reads]);
      res.json(
        await db.documentRequirement.findMany({ orderBy: { name: "asc" } }),
      );
    }),
  );
  r.post(
    "/document-requirements",
    run(async (req, res) => {
      requireRole(res, ["ADMIN"]);
      const data = z
        .object({ name: z.string().trim().min(3).max(160) })
        .strict()
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const row = await tx.documentRequirement.create({ data });
        await audit(
          tx,
          actor(res),
          "REQUIREMENT_CREATED",
          "DocumentRequirement",
          row,
        );
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/document-requirements/:id",
    run(async (req, res) => {
      requireRole(res, ["ADMIN"]);
      const data = z.object({ active: z.boolean() }).strict().parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const row = await tx.documentRequirement.update({
          where: { id: req.params.id },
          data,
        });
        await audit(
          tx,
          actor(res),
          "REQUIREMENT_UPDATED",
          "DocumentRequirement",
          row,
        );
        return row;
      });
      res.json(row);
    }),
  );
  r.get(
    "/third-parties",
    run(async (req, res) => {
      requireRole(res, [...reads]);
      const f = filters.parse(req.query),
        where: Prisma.ThirdPartyServiceWhereInput = {
          ...(f.status ? { status: f.status } : {}),
          ...(f.provider
            ? { provider: { contains: f.provider, mode: "insensitive" } }
            : {}),
          ...(f.overdue === "true"
            ? {
                stageEnteredAt: { lt: new Date(Date.now() - 7 * 86400000) },
                AND: [{ status: { not: "FINISHED" } }],
              }
            : {}),
          ...(f.q
            ? {
                OR: [
                  { id: { contains: f.q, mode: "insensitive" } },
                  { provider: { contains: f.q, mode: "insensitive" } },
                  { description: { contains: f.q, mode: "insensitive" } },
                ],
              }
            : {}),
        };
      const [items, total] = await Promise.all([
        db.thirdPartyService.findMany({
          where,
          include: { documents: true },
          orderBy: { stageEnteredAt: "asc" },
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
        db.thirdPartyService.count({ where }),
      ]);
      res.json(
        pageResponse(
          items.map((row) => ({
            ...visible(row, actor(res).role.name),
            daysInStage: Math.max(
              0,
              Math.floor(
                (Date.now() - row.stageEnteredAt.getTime()) / 86400000,
              ),
            ),
          })),
          total,
          f.page,
          f.limit,
        ),
      );
    }),
  );
  r.get(
    "/third-parties/:id",
    run(async (req, res) => {
      requireRole(res, [...reads]);
      const row = must(
        await db.thirdPartyService.findUnique({
          where: { id: req.params.id },
          include: {
            documents: {
              include: { requirement: true },
              orderBy: { receivedAt: "desc" },
            },
            movements: { orderBy: { occurredAt: "asc" } },
            order: { select: { id: true, description: true } },
          },
        }),
      );
      const requirements = await db.documentRequirement.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });
      const missing = requirements.filter(
        (requirement) =>
          !row.documents.some(
            (d) => d.requirementId === requirement.id && d.verified,
          ),
      );
      res.json({
        ...visible(row, actor(res).role.name),
        requirements,
        missingRequirements: missing,
        daysInStage: Math.max(
          0,
          Math.floor((Date.now() - row.stageEnteredAt.getTime()) / 86400000),
        ),
        draftMessage: `Assunto: Acompanhamento ${row.id} — ${row.provider}\nServiço: ${row.description}\nOS interna: ${row.orderId}\nEtapa atual: ${row.status}\nResponsável: ${row.internalOwner}\nPendências: ${row.pendingNotes || "Nenhuma observação registrada"}\nRequisitos ainda sem conferência: ${missing.map((d) => d.name).join(", ") || "Nenhum requisito ativo pendente"}\nMensagem preparada para revisão humana. Nenhum envio ou aprovação de pagamento foi realizado.`,
      });
    }),
  );
  r.post(
    "/third-parties",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = form.parse(req.body);
      if (data.amount !== undefined && !managers.includes(actor(res).role.name))
        throw new HttpError(
          403,
          "Somente administrador ou gestor pode informar valores",
        );
      if (data.executedAt && data.executedAt > new Date())
        throw new HttpError(400, "Data de execução não pode estar no futuro");
      const row = await db.$transaction(async (tx) => {
        const order = must(
          await tx.maintenanceOrder.findUnique({ where: { id: data.orderId } }),
          "OS interna não encontrada",
        );
        if (order.status === "CANCELLED")
          throw new HttpError(409, "Não vincule processos a uma OS cancelada");
        const now = new Date(),
          row = await tx.thirdPartyService.create({
            data: {
              ...data,
              id: "TER-" + randomUUID().slice(0, 8),
              status: "REQUESTED",
              stageEnteredAt: now,
              isDemo: true,
              movements: {
                create: {
                  status: "REQUESTED",
                  occurredAt: now,
                  actor: actor(res).name,
                  notes: "Solicitação local de demonstração",
                },
              },
            },
          });
        await audit(
          tx,
          actor(res),
          "THIRD_PARTY_CREATED",
          "ThirdPartyService",
          row,
        );
        return row;
      });
      res.status(201).json(visible(row, actor(res).role.name));
    }),
  );
  r.patch(
    "/third-parties/:id",
    run(async (req, res) => {
      requireRole(res, planners);
      const { version: expected, ...data } = form
        .extend({ version })
        .parse(req.body);
      if (data.amount !== undefined && !managers.includes(actor(res).role.name))
        throw new HttpError(403, "Sem autorização para informar valores");
      if (data.executedAt && data.executedAt > new Date())
        throw new HttpError(400, "Data de execução não pode estar no futuro");
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.thirdPartyService.findUnique({
            where: { id: req.params.id },
          }),
        );
        if (before.status !== "REQUESTED" && !data.executedAt)
          throw new HttpError(
            409,
            "Processos executados precisam manter uma data de execução",
          );
        if (before.status === "FINISHED")
          throw new HttpError(409, "Processo finalizado não pode ser alterado");
        updated(
          await tx.thirdPartyService.updateMany({
            where: { id: before.id, version: expected },
            data: { ...data, version: { increment: 1 } },
          }),
        );
        const after = must(
          await tx.thirdPartyService.findUnique({ where: { id: before.id } }),
        );
        await audit(
          tx,
          actor(res),
          "THIRD_PARTY_UPDATED",
          "ThirdPartyService",
          { before, after },
        );
        return after;
      });
      res.json(visible(row, actor(res).role.name));
    }),
  );
  r.post(
    "/third-parties/:id/documents",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = z
        .object({
          version,
          name: z.string().trim().min(3).max(160),
          reference: z.string().trim().min(3).max(500),
          requirementId: z.string().min(1).nullable(),
          verified: z.boolean(),
        })
        .strict()
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const service = must(
          await tx.thirdPartyService.findUnique({
            where: { id: req.params.id },
          }),
        );
        if (service.status === "FINISHED")
          throw new HttpError(409, "Processo finalizado");
        const { version: expected, ...document } = data;
        updated(
          await tx.thirdPartyService.updateMany({
            where: { id: service.id, version: expected },
            data: { version: { increment: 1 } },
          }),
        );
        const row = await tx.thirdPartyDocument.create({
          data: { ...document, serviceId: service.id },
        });
        await audit(
          tx,
          actor(res),
          "DOCUMENT_REGISTERED",
          "ThirdPartyDocument",
          row,
        );
        return row;
      });
      res.status(201).json(row);
    }),
  );
  r.patch(
    "/third-parties/:id/documents/:documentId",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = z
        .object({ version, verified: z.boolean() })
        .strict()
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const service = must(
          await tx.thirdPartyService.findUnique({
            where: { id: req.params.id },
          }),
        );
        if (service.status === "FINISHED")
          throw new HttpError(409, "Processo finalizado");
        must(
          await tx.thirdPartyDocument.findFirst({
            where: { id: req.params.documentId, serviceId: service.id },
          }),
        );
        updated(
          await tx.thirdPartyService.updateMany({
            where: { id: service.id, version: data.version },
            data: { version: { increment: 1 } },
          }),
        );
        const row = await tx.thirdPartyDocument.update({
          where: { id: req.params.documentId },
          data: { verified: data.verified },
        });
        await audit(
          tx,
          actor(res),
          "DOCUMENT_REVIEWED",
          "ThirdPartyDocument",
          row,
        );
        return row;
      });
      res.json(row);
    }),
  );
  r.post(
    "/third-parties/:id/transition",
    run(async (req, res) => {
      requireRole(res, planners);
      const data = z
        .object({ version, status: z.enum(SERVICE_STAGES), notes: text })
        .strict()
        .parse(req.body);
      const row = await db.$transaction(async (tx) => {
        const before = must(
          await tx.thirdPartyService.findUnique({
            where: { id: req.params.id },
            include: { documents: true },
          }),
        );
        if (data.status === "EXECUTED" && !before.executedAt)
          throw new HttpError(
            409,
            "Informe a data de execução antes de avançar",
          );
        if (!serviceTransitions[before.status]?.includes(data.status))
          throw new HttpError(409, "Etapa não permitida para o estado atual");
        if (
          ["VALIDATED", "FINISHED"].includes(data.status) &&
          !managers.includes(actor(res).role.name)
        )
          throw new HttpError(
            403,
            "Essa validação exige administrador ou gestor",
          );
        if (
          [
            "PREPARED",
            "VALIDATED",
            "SENT_TO_CENTRAL",
            "FINANCE",
            "FINISHED",
          ].includes(data.status)
        ) {
          const requirements = await tx.documentRequirement.findMany({
            where: { active: true },
          });
          if (
            requirements.some(
              (req) =>
                !before.documents.some(
                  (d) => d.requirementId === req.id && d.verified,
                ),
            )
          )
            throw new HttpError(
              409,
              "Há requisitos documentais ativos sem conferência",
            );
          if (before.pendingNotes?.trim())
            throw new HttpError(
              409,
              "Resolva as pendências registradas antes de avançar",
            );
        }
        if (data.status === "PENDING" && !data.notes.trim())
          throw new HttpError(400, "Descreva a pendência");
        const now = new Date();
        updated(
          await tx.thirdPartyService.updateMany({
            where: { id: before.id, version: data.version },
            data: {
              status: data.status,
              stageEnteredAt: now,
              version: { increment: 1 },
              ...(data.status === "PENDING"
                ? { pendingNotes: data.notes }
                : {}),
            },
          }),
        );
        await tx.thirdPartyMovement.create({
          data: {
            serviceId: before.id,
            status: data.status,
            occurredAt: now,
            actor: actor(res).name,
            notes: data.notes,
          },
        });
        await audit(tx, actor(res), "THIRD_PARTY_MOVED", "ThirdPartyService", {
          id: before.id,
          from: before.status,
          to: data.status,
          notes: data.notes,
        });
        return must(
          await tx.thirdPartyService.findUnique({ where: { id: before.id } }),
        );
      });
      res.json(visible(row, actor(res).role.name));
    }),
  );
  return r;
}
