import express, { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient, SapWorkbookRun } from "@prisma/client";
import { z } from "zod";
import { planners } from "../operations/domain.js";
import {
  actor,
  audit,
  HttpError,
  requireRole,
  run,
} from "../operations/helpers.js";
import { scheduleLock } from "../scheduling/lifecycle.js";
import { sapRoutine } from "./routine.js";
import { importWorkbook } from "./import.js";
import {
  mappingSchema,
  sapDate,
  sapHours,
  workbookPreview,
  workbookTemplate,
} from "./workbook.js";

const upload = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .regex(/\.xlsx$/i),
  content: z
    .string()
    .min(4)
    .max(4194304)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  mapping: mappingSchema.optional(),
  feed: z.enum(["IW38", "IW47"]).optional(),
});
const cloudUpload = upload.omit({ mapping: true, feed: true }).extend({
  fileId: z.string().min(1).max(1024),
  modifiedAt: z.string().datetime({ offset: true }),
});
export const workbookJson = express.json({ limit: "4300kb" });
function connection() {
  const {
    PCM_WORKBOOK_SECRET: secret,
    PCM_WORKBOOK_FILE_ID: id,
    PCM_WORKBOOK_FILE_LABEL: label,
  } = process.env;
  return secret && secret.length >= 32 && id && label
    ? { secret, id, label }
    : null;
}
const digest = (value: string) => createHash("sha256").update(value).digest();

export function sapWebhook(db: PrismaClient) {
  const router = Router();
  router.post(
    "/connection",
    (req, _res, next) => {
      const config = connection();
      if (!config) return next(new HttpError(503, "Configuração pendente"));
      const authorization = req.get("authorization") || "";
      if (
        !timingSafeEqual(
          digest(authorization),
          digest("Bearer " + config.secret),
        )
      )
        return next(new HttpError(401, "Credencial da sincronização inválida"));
      next();
    },
    workbookJson,
    run(async (req, res) => {
      const body = cloudUpload.parse(req.body);
      if (body.fileId !== connection()?.id)
        throw new HttpError(403, "Arquivo diferente do arquivo conectado");
      const result = await importWorkbook(
        db,
        Buffer.from(body.content, "base64"),
        {
          filename: body.filename,
          source: "microsoft365",
          fileId: body.fileId,
          revision: new Date(body.modifiedAt),
        },
      );
      const status = (result.result as { status: string }).status;
      res
        .status(status === "rejected" ? 422 : 200)
        .json({ id: result.id, status });
    }),
  );
  return router;
}

type RunResult = {
  status: string;
  error?: string;
  sheets?: {
    tab: string;
    rows: number;
    processed: number;
    issues: string[];
    errors: unknown[];
  }[];
};

function runSummary(run: SapWorkbookRun) {
  const result = run.result as RunResult;
  return {
    id: run.id,
    filename: run.filename,
    source: run.source,
    receivedAt: run.receivedAt,
    updatedAt: run.updatedAt,
    result: {
      ...result,
      sheets: result.sheets?.map(({ errors, ...sheet }) => ({
        ...sheet,
        errorCount: errors.length,
      })),
    },
  };
}

export function workbookRoutes(db: PrismaClient) {
  const router = Router();
  router.use((_req, res, next) => {
    requireRole(res, planners);
    next();
  });
  router.get(
    "/routine",
    run(async (_req, res) => res.json(await sapRoutine(db))),
  );
  router.get(
    "/template.xlsx",
    run(async (_req, res) => {
      res.attachment("PCM-SAP.xlsx").send(await workbookTemplate());
    }),
  );
  router.get(
    "/status",
    run(async (_req, res) => {
      const [settings, runs, lastSuccessful] = await Promise.all([
        db.sapWorkbookSettings.findUnique({ where: { id: 1 } }),
        db.sapWorkbookRun.findMany({
          orderBy: { receivedAt: "desc" },
          take: 10,
        }),
        db.sapWorkbookRun.findFirst({
          where: {
            updatedAt: { not: null },
            result: { path: ["status"], equals: "updated" },
          },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true, filename: true, source: true },
        }),
      ]);
      const config = connection();
      res.json({
        mapping: settings?.mapping ?? {},
        configured: Boolean(config && settings),
        file: config?.label ?? null,
        runs: runs.map(runSummary),
        lastSuccessful,
      });
    }),
  );
  router.post(
    "/preview",
    workbookJson,
    run(async (req, res) => {
      const { content, mapping, feed } = upload.parse(req.body);
      const settings = await db.sapWorkbookSettings.findUnique({
        where: { id: 1 },
      });
      const preview = await workbookPreview(
        Buffer.from(content, "base64"),
        mapping ?? mappingSchema.parse(settings?.mapping ?? {}),
        feed,
      );
      res.json(
        preview.map((sheet) => ({
          ...sheet,
          count: sheet.rows.length,
          rows: sheet.rows.slice(0, 8),
        })),
      );
    }),
  );
  router.put(
    "/mapping",
    run(async (req, res) => {
      const mapping = mappingSchema.parse(req.body);
      await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const existing = await tx.sapWorkbookSettings.findUnique({
          where: { id: 1 },
        });
        const merged = {
          ...mappingSchema.parse(existing?.mapping ?? {}),
          ...mapping,
        };
        await tx.sapWorkbookSettings.upsert({
          where: { id: 1 },
          create: { mapping: merged, actorId: actor(res).id },
          update: { mapping: merged, actorId: actor(res).id },
        });
        await audit(
          tx,
          actor(res),
          "SAP_MAPPING_SAVED",
          "SapWorkbookSettings",
          { entityId: 1, mapping },
        );
      });
      res.status(204).end();
    }),
  );
  router.post(
    "/import",
    workbookJson,
    run(async (req, res) => {
      const body = upload.parse(req.body);
      const result = await importWorkbook(
        db,
        Buffer.from(body.content, "base64"),
        {
          filename: body.filename,
          source: "manual",
          feed: body.feed,
          actorId: actor(res).id,
        },
        body.mapping,
      );
      res.json(runSummary(result));
    }),
  );
  router.get(
    "/runs/:id/errors",
    run(async (req, res) => {
      const query = z
        .object({
          tab: z.string().min(1).max(30),
          offset: z.coerce.number().int().min(0).max(1000).default(0),
        })
        .parse(req.query);
      const run = await db.sapWorkbookRun.findUnique({
        where: { id: req.params.id },
      });
      const errors = (run?.result as RunResult | undefined)?.sheets?.find(
        (sheet) => sheet.tab === query.tab,
      )?.errors;
      if (!errors) throw new HttpError(404, "Aba não encontrada no histórico.");
      res.json({
        items: errors.slice(query.offset, query.offset + 20),
        total: errors.length,
      });
    }),
  );
  router.get(
    "/confirmation-review/:key",
    run(async (req, res) => {
      const record = await db.sapConfirmation.findUnique({
        where: { key: req.params.key },
      });
      if (!record?.review || record.supersededBy)
        throw new HttpError(404, "Apontamento indisponível para revisão.");
      const candidates = await db.sapConfirmation.findMany({
        where: {
          groupKey: record.groupKey,
          supersededBy: null,
          key: { not: record.key },
        },
        select: { key: true, hours: true, fields: true },
      });
      res.json({
        candidates,
        record: {
          key: record.key,
          review: record.review,
          fields: record.fields,
          fingerprint: record.fingerprint,
        },
      });
    }),
  );
  router.post(
    "/confirmation-review/:key",
    run(async (req, res) => {
      const body = z
        .object({
          replace: z.string().max(250).optional(),
          fingerprint: z.string().length(64),
        })
        .parse(req.body);
      await db.$transaction(async (tx) => {
        await scheduleLock(tx);
        const record = await tx.sapConfirmation.findUnique({
          where: { key: req.params.key },
        });
        if (
          !record?.review ||
          record.supersededBy ||
          record.fingerprint !== body.fingerprint
        )
          throw new HttpError(
            409,
            "Apontamento alterado. Atualize o relatório.",
          );
        const fields = record.fields as Record<string, string>;
        const hours = sapHours(fields.hours);
        if (!hours)
          throw new HttpError(
            422,
            "Corrija as horas na planilha antes de confirmar.",
          );
        try {
          sapDate(fields.date);
        } catch {
          throw new HttpError(
            422,
            "Corrija a data na planilha antes de confirmar.",
          );
        }
        if (fields.counter && !fields.confirmationId)
          throw new HttpError(
            422,
            "Informe também a confirmação SAP na planilha.",
          );
        if (body.replace === record.key)
          throw new HttpError(
            422,
            "Selecione outro apontamento para substituir.",
          );
        if (body.replace) {
          const replaced = await tx.sapConfirmation.updateMany({
            where: {
              key: body.replace,
              groupKey: record.groupKey,
              supersededBy: null,
            },
            data: { supersededBy: record.key },
          });
          if (!replaced.count)
            throw new HttpError(
              409,
              "Registro original indisponível. Atualize o relatório.",
            );
        }
        const after = await tx.sapConfirmation.update({
          where: { key: record.key },
          data: { hours, review: null, reviewedAt: new Date() },
        });
        await audit(
          tx,
          actor(res),
          "SAP_CONFIRMATION_REVIEWED",
          "SapConfirmation",
          {
            entityId: record.key,
            before: record,
            after,
            replaced: body.replace,
          },
        );
      });
      res.status(204).end();
    }),
  );
  return router;
}
