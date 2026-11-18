import { Router } from "express";
import { z } from "zod";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import {
  actor,
  audit,
  HttpError,
  must,
  pageResponse,
  requireRole,
  run,
} from "../operations/helpers.js";
import { planners, snapshot } from "../operations/domain.js";
import { adapter } from "./adapters.js";
import {
  choices,
  fields,
  mappingSchema,
  optionsSchema,
  targets,
  type Target,
} from "./specs.js";
import { applyChunk, planImport } from "./engine.js";
import { undoChunk, undoPreview } from "./undo.js";
async function purgeExpired(db: PrismaClient) {
  await db.importBatch.updateMany({
    where: {
      status: { in: ["UPLOADED", "PREVIEW"] },
      expiresAt: { lt: new Date() },
    },
    data: {
      status: "EXPIRED",
      preview: { expired: true },
      payload: { expired: true },
    },
  });
}
export function importsRouter(db: PrismaClient) {
  const r = Router();
  r.use((req, res, next) => {
    try {
      requireRole(res, planners);
      next();
    } catch (e) {
      next(e);
    }
  });
  r.get(
    "/specs",
    run(async (_req, res) =>
      res.json({
        fields,
        choices,
        limits: { bytes: 3 * 1024 * 1024, rows: 1000, columns: 60 },
        automaticSap: false,
      }),
    ),
  );
  r.get(
    "/sources",
    run(async (_req, res) =>
      res.json(await db.importSource.findMany({ orderBy: { name: "asc" } })),
    ),
  );
  r.post(
    "/sources",
    run(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(3).max(120),
          system: z.enum(["SAP", "SKA", "GENERIC"]),
          scope: z.string().trim().min(2).max(100),
          target: z.enum(targets),
          isDemo: z.boolean(),
        })
        .strict()
        .parse(req.body);
      const source = await db.$transaction(async (tx) => {
        const source = await tx.importSource.create({ data });
        await audit(
          tx,
          actor(res),
          "IMPORT_SOURCE_CREATED",
          "ImportSource",
          source,
        );
        return source;
      });
      res.status(201).json(source);
    }),
  );
  r.get(
    "/sample/:target",
    run(async (req, res) => {
      const target = z.enum(targets).parse(req.params.target);
      const samples: Record<Target, string[][]> = {
        EQUIPMENT: [
          [
            "TAG",
            "Número do equipamento",
            "Nome",
            "Setor",
            "Criticidade",
            "Estado",
          ],
          [
            "0011",
            "9000001",
            "Equipamento fictício A",
            "Setor fictício A",
            "2",
            "UNKNOWN",
          ],
          [
            "0011",
            "",
            "Equipamento fictício B",
            "Setor fictício B",
            "2",
            "UNKNOWN",
          ],
        ],
        ORDERS: [
          [
            "OS",
            "Equipamento",
            "Descrição",
            "Tipo",
            "Status",
            "Prioridade",
            "Programação",
            "Setor",
            "Criticidade",
          ],
          [
            "00001234",
            "DEMO-EQ-001",
            "Ordem fictícia",
            "PREVENTIVE",
            "OPEN",
            "2",
            "2026-12-01 08:00",
            "Setor fictício",
            "2",
          ],
        ],
        PLANS: [
          [
            "Plano",
            "Equipamento",
            "Nome",
            "Tipo",
            "Dias",
            "Vencimento",
            "Técnico",
            "Setor",
            "Criticidade",
            "Lista de tarefas",
            "Operação",
            "Descrição da tarefa",
            "Minutos",
          ],
          [
            "PLANO-DEMO-001",
            "0011",
            "Preventiva fictícia",
            "PREVENTIVE",
            "30",
            "2026-12-01 08:00",
            "Técnico fictício",
            "Setor fictício A",
            "2",
            "LISTA-DEMO-01",
            "0010",
            "Inspecionar conexões conforme procedimento autorizado",
            "15",
          ],
          [
            "PLANO-DEMO-001",
            "0011",
            "Preventiva fictícia",
            "PREVENTIVE",
            "30",
            "2026-12-01 08:00",
            "Técnico fictício",
            "Setor fictício A",
            "2",
            "LISTA-DEMO-01",
            "0020",
            "Conferir fixações conforme procedimento autorizado",
            "20",
          ],
          [
            "PLANO-DEMO-002",
            "0011",
            "Lubrificação fictícia",
            "LUBRICATION",
            "7",
            "2026-12-02 08:00",
            "Técnico fictício",
            "Setor fictício B",
            "2",
            "LISTA-DEMO-02",
            "0010",
            "Lubrificar conforme plano e instruções autorizadas",
            "10",
          ],
        ],
        INTERRUPTIONS: [
          [
            "Ocorrência",
            "Equipamento",
            "Início",
            "Término",
            "Tipo",
            "Motivo",
            "Descrição",
            "Setor",
            "Criticidade",
          ],
          [
            "INT-DEMO-001",
            "DEMO-EQ-001",
            "2026-11-01 08:00",
            "2026-11-01 09:00",
            "UNPLANNED",
            "Motivo fictício",
            "Ocorrência fictícia para teste",
            "Setor fictício",
            "2",
          ],
        ],
      };
      if (req.query.format === "xlsx") {
        const wb = new ExcelJS.Workbook(),
          sheet = wb.addWorksheet("Exemplo fictício");
        samples[target].forEach((row) => sheet.addRow(row));
        sheet.getRow(1).font = { bold: true };
        sheet.columns.forEach((c) => (c.width = 24));
        res
          .set({
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="exemplo-ficticio-${target}.xlsx"`,
          })
          .send(Buffer.from(await wb.xlsx.writeBuffer()));
      } else
        res
          .set({
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="exemplo-ficticio-${target}.csv"`,
          })
          .send(
            "\uFEFF" +
              samples[target]
                .map((row) =>
                  row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(";"),
                )
                .join("\r\n"),
          );
    }),
  );
  r.post(
    "/upload",
    run(async (req, res) => {
      await purgeExpired(db);
      const data = z
        .object({
          sourceId: z.string(),
          filename: z.string().min(1).max(180),
          base64: z.string().max(4194400),
          sheet: z.string().max(100).optional(),
          headerRow: z.number().int().min(1).max(20).default(1),
          delimiter: z.enum([",", ";", "\t"]).optional(),
        })
        .strict()
        .parse(req.body);
      const source = must(
        await db.importSource.findUnique({ where: { id: data.sourceId } }),
      );
      if (!source.active) throw new HttpError(409, "Origem inativa");
      const buffer = Buffer.from(data.base64, "base64");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))
        throw new HttpError(400, "Arquivo inválido");
      const parsed = await adapter(source.system).parse(
        buffer,
        data.filename,
        data,
      );
      const hash = createHash("sha256").update(buffer).digest("hex");
      const previous = await db.importBatch.findFirst({
        where: {
          sourceConfigId: source.id,
          fileHash: hash,
          status: { in: ["APPLIED", "PARTIAL"] },
        },
        select: { id: true, createdAt: true },
      });
      const batch = await db.$transaction(async (tx) => {
        const batch = await tx.importBatch.create({
          data: {
            source: source.system,
            sourceConfigId: source.id,
            actorId: actor(res).id,
            filename: data.filename,
            fileHash: hash,
            status: "UPLOADED",
            rowCount: parsed.rows.length,
            errors: [],
            preview: snapshot(parsed),
            expiresAt: new Date(Date.now() + 3600000),
            isDemo: source.isDemo,
          },
        });
        await audit(tx, actor(res), "IMPORT_UPLOADED", "ImportBatch", {
          id: batch.id,
          filename: data.filename,
          rows: parsed.rows.length,
          sourceId: source.id,
        });
        return batch;
      });
      res.status(201).json({
        id: batch.id,
        ...parsed,
        rows: parsed.rows.slice(0, 15),
        values: Object.fromEntries(
          parsed.headers.map((h, i) => [
            h,
            [
              ...new Set(parsed.rows.map((row) => row[i]).filter(Boolean)),
            ].slice(0, 150),
          ]),
        ),
        totalRows: parsed.rows.length,
        previousIdenticalFile: previous,
        mapping: source.mapping,
        options: source.options,
      });
    }),
  );
  r.post(
    "/:id/preview",
    run(async (req, res) => {
      const data = z
        .object({
          mapping: mappingSchema,
          options: optionsSchema,
          saveMapping: z.boolean().default(true),
        })
        .strict()
        .parse(req.body);
      const batch = must(
        await db.importBatch.findUnique({
          where: { id: req.params.id },
          include: { sourceConfig: true },
        }),
      );
      if (
        !["UPLOADED", "PREVIEW"].includes(batch.status) ||
        !batch.expiresAt ||
        batch.expiresAt < new Date()
      )
        throw new HttpError(
          409,
          "A prévia expirou ou o lote já foi processado. Envie o arquivo novamente.",
        );
      const rows = await planImport(
        db,
        must(batch.sourceConfig),
        batch.preview as any,
        data.mapping,
        data.options,
      );
      const counts = rows.reduce(
        (all, row) => ({ ...all, [row.action]: (all[row.action] || 0) + 1 }),
        {} as Record<string, number>,
      );
      await db.$transaction(async (tx) => {
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "PREVIEW",
            mapping: data.mapping,
            options: snapshot(data.options),
            payload: snapshot({
              rows,
              options: data.options,
              confirmed: false,
              formatVersion: 2,
            }),
            errors: rows
              .filter((r) => ["INVALID", "CONFLICT"].includes(r.action))
              .map((r) => ({
                row: r.rowNumber,
                key: r.externalKey,
                error: r.reason,
              })),
          },
        });
        if (data.saveMapping)
          await tx.importSource.update({
            where: { id: batch.sourceConfigId! },
            data: { mapping: data.mapping, options: snapshot(data.options) },
          });
        await audit(tx, actor(res), "IMPORT_PREVIEWED", "ImportBatch", {
          id: batch.id,
          counts,
        });
      });
      res.json({
        id: batch.id,
        rows: rows.slice(0, 200).map(({ data, hash, ...row }) => row),
        counts,
        totalRows: rows.length,
        truncated: rows.length > 200,
      });
    }),
  );
  r.post(
    "/:id/confirm",
    run(async (req, res) => {
      const data = z
        .object({
          acceptValidOnly: z.boolean(),
          confirmation: z.literal("IMPORTAR"),
        })
        .strict()
        .parse(req.body);
      const batch = must(
        await db.importBatch.findUnique({ where: { id: req.params.id } }),
      );
      if (
        batch.status !== "PREVIEW" ||
        !batch.expiresAt ||
        batch.expiresAt < new Date()
      )
        throw new HttpError(409, "Gere uma prévia válida antes de confirmar");
      const payload = batch.payload as any;
      if (
        payload.rows.some((r: any) =>
          ["INVALID", "CONFLICT"].includes(r.action),
        ) &&
        !data.acceptValidOnly
      )
        throw new HttpError(
          400,
          "Há linhas inválidas. Corrija ou autorize importar somente as válidas",
        );
      if (
        !payload.rows.some((r: any) =>
          ["CREATE", "UPDATE", "SKIP", "DUPLICATE"].includes(r.action),
        )
      )
        throw new HttpError(400, "Não há linhas válidas para importar");
      await db.$transaction(async (tx) => {
        await tx.importBatch.update({
          where: { id: batch.id },
          data: { payload: { ...payload, confirmed: true }, status: "RUNNING" },
        });
        await audit(tx, actor(res), "IMPORT_CONFIRMED", "ImportBatch", {
          id: batch.id,
          acceptValidOnly: data.acceptValidOnly,
        });
      });
      res.json({ id: batch.id, status: "RUNNING" });
    }),
  );
  r.post(
    "/:id/process",
    run(async (req, res) => {
      try {
        const result = await applyChunk(db, req.params.id, actor(res));
        res.json({
          id: result.id,
          status: result.status,
          processed: result.processed,
          total: result.rowCount,
          counts: result.counts,
          errors: result.errors,
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          409,
          "O trecho não foi aplicado. Revise referências ou tente retomar. Trechos anteriores permanecem registrados.",
        );
      }
    }),
  );
  r.post(
    "/:id/stop",
    run(async (req, res) => {
      z.object({ confirmation: z.literal("ENCERRAR") })
        .strict()
        .parse(req.body);
      await db.$transaction(async (tx) => {
        const lock = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(739104,1) AS locked`;
        if (!lock[0].locked)
          throw new HttpError(
            409,
            "Um trecho está em processamento. Aguarde e tente novamente.",
          );
        const batch = must(
          await tx.importBatch.findUnique({ where: { id: req.params.id } }),
        );
        if (batch.status !== "RUNNING")
          throw new HttpError(409, "O lote não está em processamento");
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "PARTIAL",
            preview: { stopped: true },
            payload: { stopped: true },
          },
        });
        await audit(tx, actor(res), "IMPORT_STOPPED", "ImportBatch", {
          id: batch.id,
          processed: batch.processed,
          total: batch.rowCount,
        });
      });
      res.json({ status: "PARTIAL" });
    }),
  );
  r.get(
    "/",
    run(async (req, res) => {
      const page = z.coerce
          .number()
          .int()
          .min(1)
          .default(1)
          .parse(req.query.page),
        limit = 20;
      const [items, total] = await Promise.all([
        db.importBatch.findMany({
          select: {
            id: true,
            status: true,
            filename: true,
            createdAt: true,
            rowCount: true,
            processed: true,
            counts: true,
            source: true,
            sourceConfig: { select: { name: true, target: true } },
            actor: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.importBatch.count(),
      ]);
      res.json(pageResponse(items, total, page, limit));
    }),
  );
  r.get(
    "/:id",
    run(async (req, res) => {
      const batch = must(
        await db.importBatch.findUnique({
          where: { id: req.params.id },
          include: { sourceConfig: true, actor: { select: { name: true } } },
        }),
      );
      res.json({
        id: batch.id,
        status: batch.status,
        filename: batch.filename,
        createdAt: batch.createdAt,
        total: batch.rowCount,
        processed: batch.processed,
        counts: batch.counts,
        errors: batch.errors,
        source: batch.sourceConfig,
        actor: batch.actor,
        canResume: batch.status === "RUNNING",
      });
    }),
  );
  r.get(
    "/:id/errors.csv",
    run(async (req, res) => {
      const batch = must(
        await db.importBatch.findUnique({ where: { id: req.params.id } }),
      );
      const cell = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@\-\t\r]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const errors = Array.isArray(batch.errors) ? (batch.errors as any[]) : [];
      res
        .set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="erros-importacao.csv"',
        })
        .send(
          "\uFEFFLinha;Chave;Erro\r\n" +
            errors
              .map((e) => [e.row, e.key, e.error].map(cell).join(";"))
              .join("\r\n"),
        );
    }),
  );
  r.get(
    "/:id/undo-preview",
    run(async (req, res) => res.json(await undoPreview(db, req.params.id))),
  );
  r.post(
    "/:id/undo",
    run(async (req, res) => {
      z.object({ confirmation: z.literal("DESFAZER") })
        .strict()
        .parse(req.body);
      const preview = await undoPreview(db, req.params.id);
      if (!preview.canUndo)
        throw new HttpError(409, preview.blockers.join("; "));
      const batch = await undoChunk(db, req.params.id, actor(res));
      res.json({ status: batch.status });
    }),
  );
  return r;
}
