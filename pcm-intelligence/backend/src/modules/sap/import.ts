import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import { scheduleLock } from "../scheduling/lifecycle.js";
import { tagSchema, numberSchema } from "../operations/equipment-identity.js";
import { planners, snapshot } from "../operations/domain.js";
import { HttpError } from "../operations/helpers.js";
import {
  sapDate,
  sapHours,
  workbookPreview,
  mappingSchema,
  type Mapping,
  type Tab,
  type WorkbookRow,
} from "./workbook.js";

type Context = {
  filename: string;
  source: "manual" | "microsoft365";
  actorId?: string;
  revision?: Date;
  fileId?: string;
};
type SheetResult = {
  tab: Tab;
  rows: number;
  processed: number;
  issues: string[];
  errors: { line: number; message: string; fields: WorkbookRow["columns"] }[];
};
const hash = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
const text = (value?: string) => value || null;

class Review extends Error {}
const validate = <T>(parse: () => T): T => {
  try {
    return parse();
  } catch (error) {
    throw new Review((error as Error).message);
  }
};

export async function importWorkbook(
  db: PrismaClient,
  buffer: Buffer,
  context: Context,
  manualMapping?: Mapping,
) {
  const settings = await db.sapWorkbookSettings.findUnique({
    where: { id: 1 },
  });
  const mapping = manualMapping ?? mappingSchema.parse(settings?.mapping ?? {});
  const actorId = context.actorId ?? settings?.actorId;
  const digest = hash(hash(buffer) + JSON.stringify(mapping));
  const run = await db.sapWorkbookRun.create({
    data: {
      filename: context.filename,
      source: context.source,
      fileId: context.fileId,
      revision: context.revision,
      digest,
      result: { status: "received" },
    },
  });

  const finish = async (result: Prisma.InputJsonObject) =>
    db.sapWorkbookRun.update({ where: { id: run.id }, data: { result } });
  try {
    if (!actorId || (context.source === "microsoft365" && !settings))
      return finish({
        status: "rejected",
        error: "Configuração pendente. Salve o mapeamento manualmente.",
      });
    const sheets = await workbookPreview(buffer, mapping);
    const results: SheetResult[] = sheets.map(({ tab, issues, rows }) => ({
      tab,
      issues,
      rows: rows.length,
      processed: 0,
      errors: [],
    }));
    if (results.some((sheet) => sheet.issues.length))
      return finish({ status: "rejected", sheets: results });
    if (results.every((sheet) => !sheet.rows))
      return finish({ status: "empty", sheets: results });

    return await db.$transaction(
      async (tx) => {
        await scheduleLock(tx);
        const user = await tx.user.findUnique({
          where: { id: actorId },
          include: { role: true },
        });
        if (
          !user?.active ||
          user.mustChangePassword ||
          !planners.includes(user.role.name)
        )
          throw new HttpError(
            403,
            "O responsável pelo mapeamento precisa de acesso ativo de PCM.",
          );
        if (context.revision) {
          const latest = await tx.sapWorkbookRun.findFirst({
            where: {
              source: "microsoft365",
              fileId: context.fileId,
              updatedAt: { not: null },
              revision: { not: null },
            },
            orderBy: [{ revision: "desc" }, { updatedAt: "desc" }],
          });
          if (
            latest?.revision &&
            context.revision.getTime() === latest.revision.getTime() &&
            latest.digest === digest &&
            (latest.result as { status: string }).status === "updated"
          ) {
            return tx.sapWorkbookRun.update({
              where: { id: run.id },
              data: { result: { status: "unchanged" } },
            });
          }
          if (latest?.revision && context.revision < latest.revision) {
            return tx.sapWorkbookRun.update({
              where: { id: run.id },
              data: { result: { status: "obsolete" } },
            });
          }
        }

        const equipment = await tx.equipment.findMany();
        const sectors = await tx.sector.findMany();
        const mode = process.env.DATA_MODE !== "operational";
        const log = (action: string, entity: string, metadata: unknown) =>
          tx.auditLog.create({
            data: {
              userId: actorId,
              action,
              entity,
              metadata: snapshot(metadata),
            },
          });
        function sector(value?: string) {
          if (!value) return;
          const matches = sectors.filter((row) =>
            [row.id, row.name].some(
              (code) => code.toUpperCase() === value.toUpperCase(),
            ),
          );
          if (matches.length !== 1)
            throw new Review(`Setor ausente ou ambíguo: ${value}`);
          return matches[0].id;
        }
        function gear(values: WorkbookRow["values"], legacy = false) {
          const sectorId = sector(values.sector);
          const byTag = values.tag
            ? equipment.filter(
                (item) =>
                  (!sectorId || item.sectorId === sectorId) &&
                  (item.tag?.toUpperCase() === values.tag.toUpperCase() ||
                    (legacy &&
                      !item.tag &&
                      item.id.toUpperCase() === values.tag.toUpperCase())),
              )
            : [];
          const byNumber = values.equipmentNumber
            ? equipment.find(
                (item) => item.equipmentNumber === values.equipmentNumber,
              )
            : undefined;
          const candidates = equipment.filter(
            (item) => byTag.includes(item) || item === byNumber,
          );
          if (
            candidates.length > 1 ||
            (byNumber &&
              ((sectorId && byNumber.sectorId !== sectorId) ||
                (values.tag &&
                  byNumber.tag &&
                  byNumber.tag.toUpperCase() !== values.tag.toUpperCase())))
          )
            throw new Review(
              "TAG, setor e número SAP apontam para cadastros diferentes ou ambíguos.",
            );
          return candidates[0];
        }

        function keys(tab: Tab, column: string) {
          const sheet = sheets.find((item) => item.tab === tab)!;
          return [
            ...new Set(
              sheet.rows.map((row) => row.values[column]).filter(Boolean),
            ),
          ];
        }
        const orderNumbers = keys("Ordens", "orderNumber");
        const priorOrders = new Map(
          (
            await tx.sapOrder.findMany({
              where: { number: { in: orderNumbers } },
            })
          ).map((order) => [order.number, order]),
        );
        const localOrders = await tx.maintenanceOrder.findMany({
          where: {
            sapReference: {
              in: orderNumbers.filter(
                (number) => !priorOrders.get(number)?.localOrderId,
              ),
            },
          },
          select: {
            id: true,
            sapReference: true,
            equipmentId: true,
            sapOrder: { select: { number: true } },
          },
        });
        const priorNotes = new Map(
          (
            await tx.sapNote.findMany({
              where: { number: { in: keys("Notas", "noteNumber") } },
            })
          ).map((note) => [note.number, note]),
        );
        const existingConfirmations = await tx.sapConfirmation.findMany({
          where: { orderNumber: { in: keys("Apontamentos", "orderNumber") } },
        });
        const confirmationByKey = new Map(
          existingConfirmations.map((item) => [item.key, item]),
        );
        const newConfirmations: Prisma.SapConfirmationCreateManyInput[] = [];
        const previousGroups = new Map<string, typeof existingConfirmations>();
        for (const item of existingConfirmations) {
          if (item.supersededBy) continue;
          const group = previousGroups.get(item.groupKey) ?? [];
          group.push(item);
          previousGroups.set(item.groupKey, group);
        }
        const seen = new Set<string>();
        const duplicate = (key: string) => {
          if (seen.has(key))
            throw new Review(
              "Identificador repetido na mesma aba. Confira as linhas de origem.",
            );
          seen.add(key);
        };
        const orderColumns = (row: WorkbookRow) => ({
          ...row.values,
          columns: row.columns,
        });

        for (const [index, sheet] of sheets.entries()) {
          const output = results[index];
          const rows =
            sheet.tab === "Apontamentos"
              ? [...sheet.rows].sort(
                  (a, b) =>
                    Number(Boolean(b.values.confirmationId)) -
                    Number(Boolean(a.values.confirmationId)),
                )
              : sheet.rows;
          const observed = new Set<string>();
          const timings = new Map<string, number>();
          const timingKey = (v: WorkbookRow["values"]) =>
            JSON.stringify([
              v.orderNumber,
              v.personnelNumber,
              v.date || "",
              v.startTime || "",
              v.endTime || "",
            ]);
          if (sheet.tab === "Apontamentos")
            for (const { values } of rows) {
              if (!values.confirmationId) {
                const key = timingKey(values);
                timings.set(key, (timings.get(key) ?? 0) + 1);
              }
            }
          for (const row of rows) {
            const v = row.values;
            const fields = orderColumns(row);
            const messages: string[] = [];
            try {
              switch (sheet.tab) {
                case "Máquinas": {
                  const tag = validate(() => tagSchema.parse(v.tag));
                  const sectorId = sector(v.sector);
                  if (
                    !sectorId ||
                    v.name?.length < 3 ||
                    !v.name ||
                    v.name.length > 120
                  )
                    throw new Review(
                      "Informe nome de 3 a 120 caracteres e um setor cadastrado.",
                    );
                  duplicate(JSON.stringify(["equipment", sectorId, tag]));
                  const before = gear({ ...v, tag }, true);
                  if (before?.deletedAt)
                    throw new Review(
                      "Máquina arquivada. Reative o cadastro para importar alterações.",
                    );
                  const criticality = v.criticality
                    ? Number(v.criticality)
                    : (before?.criticality ?? 2);
                  const rawStatus = v.status?.toUpperCase();
                  const translated: Record<string, string> = {
                    OPERANDO: "RUNNING",
                    PARADO: "STOPPED",
                    "EM MANUTENÇÃO": "MAINTENANCE",
                    DESCONHECIDO: "UNKNOWN",
                  };
                  const status = rawStatus
                    ? translated[rawStatus] || rawStatus
                    : (before?.status ?? "UNKNOWN");
                  if (
                    ![1, 2, 3].includes(criticality) ||
                    !["RUNNING", "STOPPED", "MAINTENANCE", "UNKNOWN"].includes(
                      status,
                    )
                  )
                    throw new Review("Criticidade ou situação inválida.");
                  const equipmentNumber =
                    validate(() => numberSchema.parse(v.equipmentNumber)) ??
                    before?.equipmentNumber ??
                    null;
                  const data = {
                    tag,
                    sectorId,
                    name: v.name,
                    equipmentNumber,
                    criticality,
                    status,
                  };
                  if (
                    !before ||
                    Object.entries(data).some(
                      ([key, value]) =>
                        before[key as keyof typeof before] !== value,
                    )
                  ) {
                    const after = before
                      ? await tx.equipment.update({
                          where: { id: before.id },
                          data: { ...data, version: { increment: 1 } },
                        })
                      : await tx.equipment.create({
                          data: {
                            ...data,
                            id: "EQ-" + randomUUID(),
                            isDemo: mode,
                          },
                        });
                    if (before)
                      equipment.splice(equipment.indexOf(before), 1, after);
                    else equipment.push(after);
                    await log(
                      before ? "EQUIPMENT_UPDATED" : "EQUIPMENT_CREATED",
                      "Equipment",
                      {
                        entityId: after.id,
                        before,
                        after,
                        workbookRun: run.id,
                      },
                    );
                  }
                  break;
                }
                case "Ordens": {
                  if (!v.orderNumber)
                    throw new Review("Informe o número da ordem.");
                  duplicate("order:" + v.orderNumber);
                  const baseDate = validate(() => sapDate(v.baseDate));
                  const entryDate = validate(() => sapDate(v.entryDate));
                  const before = priorOrders.get(v.orderNumber);
                  let selected;
                  try {
                    selected = gear(v);
                  } catch (error) {
                    if (!(error instanceof Review)) throw error;
                    messages.push(error.message);
                  }
                  let localOrderId = before?.localOrderId ?? null;
                  if (
                    localOrderId &&
                    selected &&
                    before?.equipmentId &&
                    before.equipmentId !== selected.id
                  )
                    messages.push(
                      "O equipamento SAP diverge do vínculo anterior. Confira a OS no PCM.",
                    );
                  if (!localOrderId) {
                    const matches = localOrders.filter(
                      (order) => order.sapReference === v.orderNumber,
                    );
                    if (
                      matches.length > 1 ||
                      matches[0]?.sapOrder ||
                      (matches[0] &&
                        selected &&
                        matches[0].equipmentId !== selected.id)
                    )
                      messages.push(
                        "A referência SAP aponta para ordens locais ou equipamentos divergentes.",
                      );
                    if (matches.length === 1 && !messages.length)
                      localOrderId = matches[0].id;
                    const types: Record<string, string> = {
                      CORR: "CORRECTIVE",
                      LUBR: "LUBRICATION",
                      PREV: "PREVENTIVE",
                      INSP: "INSPECTION",
                      PRED: "PREDICTIVE",
                    };
                    const type = types[v.orderType?.toUpperCase()];
                    if (
                      !matches.length &&
                      selected &&
                      !selected.deletedAt &&
                      !messages.length &&
                      !type
                    )
                      messages.push(
                        "Ordem SAP guardada. Classifique o tipo ao vincular uma OS local com a mesma referência SAP.",
                      );
                    if (
                      !matches.length &&
                      selected &&
                      !selected.deletedAt &&
                      !messages.length &&
                      type
                    ) {
                      const order = await tx.maintenanceOrder.create({
                        data: {
                          id: "OS-SAP-" + randomUUID(),
                          sapReference: v.orderNumber,
                          equipmentId: selected.id,
                          description:
                            v.description || "Ordem SAP " + v.orderNumber,
                          type,
                          priority: v.importance === "A" ? 3 : 2,
                          status: "OPEN",
                          openedAt: entryDate ?? baseDate,
                          isDemo: mode,
                        },
                      });
                      localOrderId = order.id;
                      await tx.orderHistory.create({
                        data: {
                          orderId: order.id,
                          userId: actorId,
                          action: "CREATED",
                          after: snapshot(order),
                          notes: "Importação de ordem SAP",
                        },
                      });
                    }
                    if (!localOrderId && !messages.length)
                      messages.push(
                        "Ordem SAP guardada. Confira o cadastro da máquina para abrir a OS no PCM.",
                      );
                  }
                  const data = {
                    localOrderId,
                    equipmentId: selected?.id ?? before?.equipmentId ?? null,
                    noteNumber:
                      text(v.noteNumber) ?? before?.noteNumber ?? null,
                    baseDate,
                    entryDate,
                    workCenter: text(v.workCenter),
                    orderType: text(v.orderType),
                    fields,
                  };
                  if (
                    !before ||
                    Object.entries(data).some(
                      ([key, value]) =>
                        !isDeepStrictEqual(
                          before[key as keyof typeof before],
                          value,
                        ),
                    )
                  ) {
                    const after = before
                      ? await tx.sapOrder.update({
                          where: { number: v.orderNumber },
                          data,
                        })
                      : await tx.sapOrder.create({
                          data: { number: v.orderNumber, ...data },
                        });
                    await log("SAP_ORDER_IMPORTED", "SapOrder", {
                      entityId: after.number,
                      before,
                      after,
                      workbookRun: run.id,
                    });
                  }
                  break;
                }
                case "Notas": {
                  if (!v.noteNumber)
                    throw new Review("Informe o número da nota.");
                  duplicate("note:" + v.noteNumber);
                  const date = validate(() => sapDate(v.date));
                  let equipmentId: string | undefined;
                  try {
                    equipmentId = gear(v)?.id;
                  } catch (error) {
                    if (!(error instanceof Review)) throw error;
                    messages.push(error.message);
                  }
                  const before = priorNotes.get(v.noteNumber);
                  const data = {
                    orderNumber:
                      text(v.orderNumber) ?? before?.orderNumber ?? null,
                    equipmentId: equipmentId ?? before?.equipmentId ?? null,
                    date,
                    fields,
                  };
                  if (
                    !before ||
                    Object.entries(data).some(
                      ([key, value]) =>
                        !isDeepStrictEqual(
                          before[key as keyof typeof before],
                          value,
                        ),
                    )
                  ) {
                    const after = before
                      ? await tx.sapNote.update({
                          where: { number: v.noteNumber },
                          data,
                        })
                      : await tx.sapNote.create({
                          data: { number: v.noteNumber, ...data },
                        });
                    await log("SAP_NOTE_IMPORTED", "SapNote", {
                      entityId: after.number,
                      before,
                      after,
                      workbookRun: run.id,
                    });
                  }
                  break;
                }
                case "Apontamentos": {
                  if (!v.orderNumber || !v.personnelNumber)
                    throw new Review("Informe a ordem e a matrícula.");
                  let date: Date | null = null;
                  let dateIssue: string | null = null;
                  try {
                    date = sapDate(v.date);
                  } catch (error) {
                    dateIssue = (error as Error).message;
                  }
                  const hours = sapHours(v.hours);
                  const groupKey = JSON.stringify([
                    v.orderNumber,
                    v.personnelNumber,
                    date?.toISOString() ?? v.date ?? "",
                  ]);
                  const fingerprint = hash(
                    JSON.stringify([
                      groupKey,
                      v.startTime || "",
                      v.endTime || "",
                      hours?.toString() ?? v.hours ?? "",
                      v.confirmationText || "",
                      v.registeredBy || "",
                    ]),
                  );
                  const external = Boolean(v.confirmationId);
                  const key = external
                    ? "sap:" +
                      JSON.stringify([v.confirmationId, v.counter || ""])
                    : "payload:" + fingerprint;
                  duplicate("confirmation:" + key);
                  // An official confirmation key can survive a correction to the order number.
                  const before =
                    confirmationByKey.get(key) ??
                    (external
                      ? await tx.sapConfirmation.findUnique({ where: { key } })
                      : undefined);
                  if (before?.supersededBy) break;
                  if (!external && observed.has(fingerprint))
                    throw new Review(
                      "Linha repetida com identificador de confirmação informado em outra linha.",
                    );
                  if (external) observed.add(fingerprint);
                  const previous = previousGroups.get(groupKey) ?? [];
                  const exact = previous.find(
                    (item) =>
                      item.key.startsWith("payload:") &&
                      item.fingerprint === fingerprint,
                  );
                  const identified = previous.some(
                    (item) =>
                      item.key.startsWith("sap:") &&
                      !item.review &&
                      item.fingerprint === fingerprint,
                  );
                  if (!external && identified) break;
                  const sameWorkbook = (timings.get(timingKey(v)) ?? 0) > 1;
                  const reconciled = Boolean(
                    before?.reviewedAt || (before && !before.review),
                  );
                  const ambiguous =
                    !reconciled &&
                    (external
                      ? !exact &&
                        previous.some((item) => item.key.startsWith("payload:"))
                      : previous.some((item) => item.key !== key) ||
                        sameWorkbook);
                  const review =
                    dateIssue ||
                    (v.counter && !external
                      ? "Contador SAP sem identificador de confirmação."
                      : !hours
                        ? "Horas trabalhadas ausentes ou inválidas."
                        : ambiguous
                          ? "Apontamento ambíguo. Confirme se é novo ou se corrige um registro anterior."
                          : null);
                  if (review) messages.push(review);
                  const data = {
                    orderNumber: v.orderNumber,
                    personnelNumber: v.personnelNumber,
                    technicianName: text(v.technicianName),
                    date,
                    hours: review ? null : hours,
                    review,
                    fingerprint,
                    groupKey,
                    workCenter: text(v.workCenter),
                    orderType: text(v.orderType),
                    fields,
                  };
                  if (!before) newConfirmations.push({ key, ...data });
                  else if (
                    before.fingerprint !== fingerprint ||
                    before.review !== review ||
                    !isDeepStrictEqual(before.fields, fields)
                  ) {
                    const after = await tx.sapConfirmation.update({
                      where: { key },
                      data,
                    });
                    if (before.fingerprint !== fingerprint)
                      await log("SAP_CONFIRMATION_UPDATED", "SapConfirmation", {
                        entityId: key,
                        before,
                        after,
                        workbookRun: run.id,
                      });
                  }
                  if (external && exact && !review) {
                    await tx.sapConfirmation.update({
                      where: { key: exact.key },
                      data: { supersededBy: key },
                    });
                    await log(
                      "SAP_CONFIRMATION_IDENTIFIED",
                      "SapConfirmation",
                      {
                        entityId: key,
                        previousKey: exact.key,
                        workbookRun: run.id,
                      },
                    );
                  }
                  break;
                }
              }
              output.processed++;
            } catch (error) {
              if (!(error instanceof Review)) throw error;
              messages.push(error.message);
            }
            if (messages.length)
              output.errors.push({
                line: row.line,
                message: messages.join(" "),
                fields: row.columns,
              });
          }
        }
        if (newConfirmations.length)
          await tx.sapConfirmation.createMany({ data: newConfirmations });
        const errors = results.some((sheet) => sheet.errors.length);
        const processed = results.some((sheet) => sheet.processed);
        const status = errors
          ? processed
            ? "partial"
            : "rejected"
          : "updated";
        await log("SAP_WORKBOOK_IMPORTED", "SapWorkbookRun", {
          entityId: run.id,
          source: context.source,
          status,
        });
        return tx.sapWorkbookRun.update({
          where: { id: run.id },
          data: {
            updatedAt: processed || !errors ? new Date() : null,
            result: { status, sheets: snapshot(results) },
          },
        });
      },
      { timeout: 50000 },
    );
  } catch (error) {
    if (error instanceof HttpError)
      return finish({ status: "rejected", error: error.message });
    await finish({
      status: "failed",
      error: "Falha ao atualizar os dados. Tente novamente.",
    });
    throw error;
  }
}
