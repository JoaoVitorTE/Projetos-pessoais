import {
  resolveEquipment,
  tagSchema,
} from "../operations/equipment-identity.js";
import { tasksSchema } from "../operations/plan-tasks.js";
import {
  scheduleLock,
  guardReservedTarget,
  reservedFieldsChanged,
  syncOrderAssignments,
} from "../scheduling/lifecycle.js";
import type { PrismaClient, Prisma, ImportSource } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  fingerprint,
  normalizeRow,
  validateMapping,
  type Target,
  type ImportOptions,
  type Normalized,
} from "./specs.js";
import { audit, HttpError, must, type Actor } from "../operations/helpers.js";
import { snapshot } from "../operations/domain.js";
const delegates: Record<string, string> = {
  EQUIPMENT: "equipment",
  ORDERS: "maintenanceOrder",
  PLANS: "maintenancePlan",
  INTERRUPTIONS: "interruption",
  SECTOR: "sector",
  TECHNICIAN: "technician",
};
export function model(
  db: PrismaClient | Prisma.TransactionClient,
  target: string,
): any {
  if (!delegates[target])
    throw new HttpError(400, "Tipo de importação inválido");
  return (db as any)[delegates[target]];
}
const dates = [
  "startedAt",
  "endedAt",
  "openedAt",
  "scheduledAt",
  "completedAt",
  "nextExecution",
  "createdAt",
  "updatedAt",
  "deletedAt",
];
export function restore(data: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => k !== "version")
      .map(([k, v]) => [k, dates.includes(k) && v !== null ? new Date(v) : v]),
  );
}
export type Planned = Normalized & {
  action:
    | "CREATE"
    | "UPDATE"
    | "SKIP"
    | "INVALID"
    | "DUPLICATE"
    | "CONFLICT"
    | "GROUPED";
  entityId?: string;
  expectedVersion?: number;
  reason?: string;
  changes?: { field: string; before: unknown; after: unknown }[];
};
export function defaults(
  target: Target,
  data: Record<string, any>,
  o: ImportOptions,
) {
  if (target === "EQUIPMENT") {
    const criticality = data.criticality ?? o.defaultCriticality;
    if (!criticality)
      throw Error("Informe criticidade ou configure um padrão explícito");
    return {
      name: data.name || data.equipmentId,
      status: data.status || "UNKNOWN",
      criticality,
    };
  }
  if (target === "ORDERS") {
    const type = data.type || o.defaultType,
      priority = data.priority ?? o.defaultPriority,
      status = data.status || o.defaultStatus;
    if (
      ![
        "CORRECTIVE",
        "PREVENTIVE",
        "PREDICTIVE",
        "LUBRICATION",
        "INSPECTION",
      ].includes(type)
    )
      throw Error("Mapeie tipo de manutenção ou defina um tipo padrão");
    if (!priority) throw Error("Mapeie prioridade ou defina padrão explícito");
    if (
      ![
        "OPEN",
        "ANALYSIS",
        "SCHEDULED",
        "IN_PROGRESS",
        "WAITING_PART",
        "WAITING_VENDOR",
        "COMPLETED",
        "CANCELLED",
      ].includes(status)
    )
      throw Error("Mapeie status ou defina padrão explícito");
    return {
      type,
      priority,
      status,
      description: data.description || "Sem descrição informada",
      openedAt: data.openedAt || null,
      scheduledAt: data.scheduledAt || null,
      completedAt: data.completedAt || null,
      technicianId: null,
      notes: null,
    };
  }
  if (target === "PLANS") {
    const type = data.type || o.defaultType,
      intervalDays = data.intervalDays ?? o.defaultIntervalDays;
    if (!["PREVENTIVE", "LUBRICATION"].includes(type) || !intervalDays)
      throw Error("Mapeie tipo e periodicidade, ou configure os padrões");
    return {
      title: data.title || "Plano importado",
      type,
      intervalDays,
      active: data.active ?? true,
    };
  }
  const type = data.type || o.defaultType;
  if (!["PLANNED", "UNPLANNED"].includes(type))
    throw Error("Mapeie tipo de interrupção ou defina padrão");
  return {
    type,
    description: data.description || "Sem descrição informada",
    endedAt: data.endedAt || null,
  };
}
function patchFor(target: Target, data: Record<string, any>) {
  const allowed: Record<Target, string[]> = {
    EQUIPMENT: ["name", "status", "criticality", "tag", "equipmentNumber"],
    ORDERS: [
      "description",
      "type",
      "status",
      "priority",
      "openedAt",
      "scheduledAt",
      "completedAt",
      "notes",
    ],
    PLANS: [
      "title",
      "type",
      "intervalDays",
      "nextExecution",
      "active",
      "taskListReference",
      "tasks",
    ],
    INTERRUPTIONS: ["startedAt", "endedAt", "type", "reason", "description"],
  };
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed[target].includes(k)),
  );
}
export async function planImport(
  db: PrismaClient,
  source: ImportSource,
  preview: { headers: string[]; rows: string[][]; headerRow: number },
  mapping: Record<string, string>,
  o: ImportOptions,
): Promise<Planned[]> {
  const target = source.target as Target;
  validateMapping(target, mapping, preview.headers, o);
  const normalized = preview.rows.map((row, i) =>
    normalizeRow(
      row,
      preview.headers,
      mapping,
      o,
      target,
      i + preview.headerRow + 1,
    ),
  );
  // SAP/ERP exports may repeat plan metadata once per operation. Consolidate only
  // when every plan field agrees; conflicting headers or operation codes stay invalid.
  if (target === "PLANS") {
    const groups = new Map<string, Normalized[]>();
    for (const row of normalized)
      if (row.externalKey)
        groups.set(row.externalKey, [
          ...(groups.get(row.externalKey) || []),
          row,
        ]);
    for (const group of groups.values())
      if (group.some((r) => r.data.tasks)) {
        if (group.some((r) => r.error)) {
          for (const row of group)
            row.error =
              row.error ||
              "Há uma tarefa inválida neste plano. Corrija todas as operações para importar a lista completa.";
          continue;
        }
        const metadata = (r: Normalized) =>
          fingerprint(
            Object.fromEntries(
              Object.entries(r.data).filter(([k]) => k !== "tasks"),
            ),
          );
        if (new Set(group.map(metadata)).size > 1) {
          group.forEach(
            (r) =>
              (r.error =
                "O mesmo plano/item tem dados diferentes. Revise a chave do plano e a segunda coluna da chave."),
          );
          continue;
        }
        const tasks = new Map<string, any>();
        let conflicting = false;
        for (const row of group)
          for (const task of row.data.tasks || []) {
            const key = task.code.toUpperCase();
            if (
              tasks.has(key) &&
              fingerprint(tasks.get(key)) !== fingerprint(task)
            )
              conflicting = true;
            tasks.set(key, task);
          }
        try {
          if (conflicting)
            throw Error(
              "Código de tarefa repetido com descrições ou tempos diferentes",
            );
          const list = tasksSchema.parse(
            [...tasks.values()].sort((a, b) => a.code.localeCompare(b.code)),
          );
          group[0].data.tasks = list;
          const hash = fingerprint(
            Object.fromEntries(
              Object.entries(group[0].data).filter(
                ([k]) => !["sector", "criticality"].includes(k),
              ),
            ),
          );
          for (const row of group) {
            if (row !== group[0]) {
              delete row.data.tasks;
              row.groupedInto = group[0].rowNumber;
            }
            row.hash = hash;
          }
        } catch (e) {
          group.forEach((r) => (r.error = (e as Error).message));
        }
      }
  }
  const seen = new Map<string, Normalized[]>();
  for (const row of normalized) {
    if (row.error) continue;
    seen.set(row.externalKey, [...(seen.get(row.externalKey) || []), row]);
  }
  const links = await db.externalRecord.findMany({
    where: {
      scope: source.scope,
      entityType: source.target,
      externalKey: { in: normalized.map((r) => r.externalKey) },
    },
  });
  const linkMap = new Map(links.map((l) => [l.externalKey, l]));
  const entities = await model(db, target).findMany({
    where: { id: { in: links.map((l) => l.entityId) } },
  });
  const entityMap = new Map<string, any>(entities.map((e: any) => [e.id, e]));
  const reserved = await db.technicianAssignment.findMany({
    where: {
      status: { in: ["SCHEDULED", "IN_PROGRESS", "BLOCKED"] },
      OR: [
        { orderId: { in: links.map((l) => l.entityId) } },
        { planId: { in: links.map((l) => l.entityId) } },
      ],
    },
    select: { orderId: true, planId: true },
  });
  const protectedIds = new Set(reserved.map((r) => r.orderId || r.planId));

  const [gear, sectors, techs] = await Promise.all([
    db.equipment.findMany({
      where: {
        OR: [
          {
            id: { in: normalized.map((r) => String(r.data.equipmentId || "")) },
          },
          { id: { in: links.map((l) => l.entityId) } },
          {
            tag: {
              in: normalized.map((r) => String(r.data.equipmentId || "")),
              mode: "insensitive",
            },
          },
          {
            equipmentNumber: {
              in: normalized.flatMap((r) => [
                String(r.data.equipmentId || ""),
                String(r.data.equipmentNumber || ""),
              ]),
            },
          },
        ],
      },
    }),
    db.sector.findMany(),
    db.technician.findMany(),
  ]);
  const gearMap = new Map(gear.map((g) => [g.id, g]));
  const sectorMap = new Map(
    sectors.map((s) => [s.name.trim().toLowerCase(), s]),
  );
  const techMap = new Map(techs.map((t) => [t.name.trim().toLowerCase(), t]));
  return normalized.map((row) => {
    if (row.error) return { ...row, action: "INVALID", reason: row.error };
    const dup = seen.get(row.externalKey)!;
    if (dup.length > 1) {
      if (new Set(dup.map((r) => r.hash)).size > 1)
        return {
          ...row,
          action: "CONFLICT",
          reason: "Mesma chave aparece com conteúdos diferentes na planilha",
        };
      if (dup[0] !== row)
        return {
          ...row,
          action:
            target === "PLANS" && row.groupedInto ? "GROUPED" : "DUPLICATE",
          reason:
            target === "PLANS" && row.groupedInto
              ? "Tarefa agrupada no plano da linha " + dup[0].rowNumber
              : "Linha idêntica à linha " + dup[0].rowNumber,
        };
    }
    const link = linkMap.get(row.externalKey),
      entity = link ? entityMap.get(link.entityId) : undefined;
    if (target === "EQUIPMENT" && entity?.deletedAt)
      return {
        ...row,
        action: "CONFLICT",
        entityId: entity.id,
        reason:
          "Equipamento excluído. Restaure o cadastro antes de reimportar.",
      };
    if (link && entity && link.contentHash === row.hash)
      return {
        ...row,
        action: "SKIP",
        entityId: entity.id,
        expectedVersion: entity.version,
        reason: "Já importado; conteúdo sem alteração",
      };
    try {
      const chosenSector = row.data.sector
        ? sectorMap.get(String(row.data.sector).toLowerCase())?.id
        : o.defaultSectorId;
      if (target !== "EQUIPMENT") {
        const raw = String(row.data.equipmentId);
        row.data.referenceTag = raw;
        const found =
          row.data.sector && !chosenSector
            ? undefined
            : resolveEquipment(gear, raw, chosenSector);
        if (found) row.data.equipmentId = found.id;
        else if (gearMap.has(raw))
          row.data.equipmentId =
            "EQ-REF-" +
            fingerprint([raw, row.data.sector || chosenSector]).slice(0, 24);
      }
      if (target === "EQUIPMENT") {
        const sameIdentity = gear.find(
          (g) =>
            g.id !== entity?.id &&
            g.sectorId === chosenSector &&
            g.tag?.toUpperCase() === row.data.tag,
        );
        if (sameIdentity)
          throw Error(
            "TAG já cadastrada neste setor. Edite ou restaure o equipamento existente.",
          );
        if (
          row.data.equipmentNumber &&
          gear.some(
            (g) =>
              g.id !== entity?.id &&
              g.equipmentNumber === row.data.equipmentNumber,
          )
        )
          throw Error("Número do equipamento já utilizado em outro cadastro.");
        const sameFile = normalized.filter(
          (n) =>
            !n.error &&
            n.data.tag === row.data.tag &&
            String(n.data.sector || o.defaultSectorId || "").toUpperCase() ===
              String(
                row.data.sector || o.defaultSectorId || "",
              ).toUpperCase() &&
            n.externalKey !== row.externalKey,
        );
        if (sameFile.length)
          throw Error(
            "A mesma TAG aparece em mais de um equipamento do mesmo setor neste arquivo.",
          );
        if (
          row.data.equipmentNumber &&
          normalized.some(
            (n) =>
              !n.error &&
              n.externalKey !== row.externalKey &&
              n.data.equipmentNumber === row.data.equipmentNumber,
          )
        )
          throw Error("Número do equipamento repetido no arquivo.");
      }
      if (o.defaultSectorId && !sectors.some((s) => s.id === o.defaultSectorId))
        throw Error("Setor padrão não cadastrado");
      if (link && !entity)
        throw Error(
          "O registro vinculado não existe mais. Revise o histórico antes de importar",
        );
      if (target !== "EQUIPMENT" && !gearMap.has(row.data.equipmentId)) {
        if (!o.createReferences)
          throw Error(
            "Equipamento não cadastrado: " +
              row.data.equipmentId +
              ". Importe equipamentos primeiro ou autorize criar referências.",
          );
        if (!row.data.sector && !o.defaultSectorId)
          throw Error(
            "Para criar equipamento, mapeie setor ou selecione um setor padrão",
          );
        if (!row.data.criticality && !o.defaultCriticality)
          throw Error("Para criar equipamento, informe criticidade padrão");
      }
      if (target === "EQUIPMENT" && !row.data.sector && !o.defaultSectorId)
        throw Error("Mapeie setor ou selecione o setor padrão");
      if (
        (target === "EQUIPMENT" || !gearMap.has(row.data.equipmentId)) &&
        row.data.sector &&
        !sectorMap.has(String(row.data.sector).toLowerCase()) &&
        !o.createReferences
      )
        throw Error("Setor não cadastrado: " + row.data.sector);
      if (
        row.data.sector &&
        sectors.filter(
          (s) =>
            s.name.trim().toLowerCase() ===
            String(row.data.sector).toLowerCase(),
        ).length > 1
      )
        throw Error("Nome de setor ambíguo; revise os cadastros");
      if (row.data.technician) {
        if (
          techs.filter(
            (t) =>
              t.name.trim().toLowerCase() ===
              String(row.data.technician).toLowerCase(),
          ).length > 1
        )
          throw Error("Nome de técnico ambíguo; revise os cadastros");
        const tech = techMap.get(String(row.data.technician).toLowerCase());
        if (!tech && !o.createReferences)
          throw Error("Técnico não cadastrado: " + row.data.technician);
        if (tech && !tech.active)
          throw Error("Técnico está inativo: " + row.data.technician);
      }
      if (!entity) defaults(target, row.data, o);
      if (
        link &&
        entity.version !== link.appliedVersion &&
        !o.allowOverwriteModified
      )
        return {
          ...row,
          action: "CONFLICT",
          entityId: entity.id,
          expectedVersion: entity.version,
          reason:
            "Registro foi alterado localmente após a importação. Revise antes de autorizar substituição.",
        };
      if (
        entity &&
        protectedIds.has(entity.id) &&
        (target === "ORDERS" || target === "PLANS")
      ) {
        const patch = {
          ...patchFor(target, row.data),
          equipmentId: row.data.equipmentId,
          ...(row.data.technician
            ? {
                technicianId: techMap.get(
                  String(row.data.technician).toLowerCase(),
                )?.id,
              }
            : {}),
        };
        if (
          reservedFieldsChanged(
            target === "ORDERS" ? "ORDER" : "PLAN",
            entity,
            patch,
          )
        )
          return {
            ...row,
            action: "CONFLICT",
            entityId: entity.id,
            expectedVersion: entity.version,
            reason:
              "Há reservas ativas na agenda. Reprograme ou cancele antes de alterar datas, equipamento ou responsável.",
          };
      }
      const effective = { ...entity, ...row.data };
      if (
        target === "INTERRUPTIONS" &&
        effective.endedAt &&
        new Date(effective.endedAt) < new Date(effective.startedAt)
      )
        throw Error(
          "Término anterior ao início considerando os dados existentes",
        );
      if (
        target === "ORDERS" &&
        effective.completedAt &&
        effective.openedAt &&
        new Date(effective.completedAt) < new Date(effective.openedAt)
      )
        throw Error(
          "Conclusão anterior à abertura considerando os dados existentes",
        );
      const changes = entity
        ? Object.entries({
            ...patchFor(target, row.data),
            ...(target !== "EQUIPMENT"
              ? { equipmentId: row.data.equipmentId }
              : {}),
            ...(row.data.technician
              ? {
                  technicianId:
                    techMap.get(String(row.data.technician).toLowerCase())
                      ?.id || "Novo técnico: " + row.data.technician,
                }
              : {}),
            ...(target === "EQUIPMENT"
              ? {
                  sectorId: row.data.sector
                    ? sectorMap.get(String(row.data.sector).toLowerCase())
                        ?.id || "Novo setor: " + row.data.sector
                    : o.defaultSectorId,
                }
              : {}),
          })
            .filter(
              ([key, value]) =>
                fingerprint(snapshot(entity[key] ?? null)) !==
                fingerprint(snapshot(value)),
            )
            .map(([field, after]) => ({
              field,
              before: entity[field] ?? null,
              after,
            }))
        : [];
      return {
        ...row,
        action: entity ? "UPDATE" : "CREATE",
        entityId: entity?.id,
        expectedVersion: entity?.version,
        changes,
      };
    } catch (e) {
      return { ...row, action: "INVALID", reason: (e as Error).message };
    }
  });
}
async function journal(
  tx: Prisma.TransactionClient,
  batchId: string,
  row: number,
  target: string,
  id: string,
  operation: string,
  before: any,
  after: any,
  link?: any,
) {
  return tx.importChange.create({
    data: {
      batchId,
      rowNumber: row,
      entityType: target,
      entityId: id,
      operation,
      before: before ? snapshot(before) : undefined,
      after: after ? snapshot(after) : undefined,
      beforeLink: link ? snapshot(link) : undefined,
      externalRecordId: link?.id,
    },
  });
}
async function references(
  tx: Prisma.TransactionClient,
  source: ImportSource,
  batchId: string,
  row: Planned,
  o: ImportOptions,
  user: Actor,
) {
  const target = source.target as Target,
    data = row.data;
  let equipment =
    target === "EQUIPMENT"
      ? null
      : await tx.equipment.findUnique({ where: { id: data.equipmentId } });
  if (equipment?.deletedAt)
    throw new HttpError(
      409,
      "Equipamento excluído após a prévia. Gere outra prévia.",
    );
  let sectorId = equipment?.sectorId;
  if (target === "EQUIPMENT" || !equipment) {
    if (data.sector) {
      const name = String(data.sector);
      let sector = await tx.sector.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (!sector) {
        if (!o.createReferences)
          throw new HttpError(409, "Setor não cadastrado");
        sector = await tx.sector.create({
          data: { id: "SEC-IMP-" + randomUUID().slice(0, 8), name },
        });
        await journal(
          tx,
          batchId,
          row.rowNumber,
          "SECTOR",
          sector.id,
          "CREATE",
          null,
          sector,
        );
        await audit(tx, user, "IMPORT_REFERENCE_CREATED", "Sector", {
          batchId,
          after: sector,
        });
      }
      sectorId = sector.id;
    } else sectorId = o.defaultSectorId;
    if (!sectorId) throw new HttpError(409, "Setor não resolvido");
  }
  if (!equipment && target !== "EQUIPMENT") {
    if (!o.createReferences)
      throw new HttpError(409, "Equipamento ainda não cadastrado");
    const tag = tagSchema.parse(data.referenceTag || data.equipmentId);
    equipment = await tx.equipment.findFirst({
      where: { tag, sectorId: sectorId! },
    });
    if (equipment?.deletedAt)
      throw new HttpError(
        409,
        "Equipamento excluído. Restaure antes de importar.",
      );
    if (!equipment)
      equipment = await tx.equipment.create({
        data: {
          id: (await tx.equipment.findUnique({
            where: { id: data.equipmentId },
          }))
            ? "EQ-" + randomUUID()
            : data.equipmentId,
          tag,
          name: data.referenceTag || data.equipmentId,
          sectorId: sectorId!,
          criticality: data.criticality ?? o.defaultCriticality!,
          status: "UNKNOWN",
          isDemo: source.isDemo,
        },
      });
    await journal(
      tx,
      batchId,
      row.rowNumber,
      "EQUIPMENT",
      equipment.id,
      "CREATE",
      null,
      equipment,
    );
    await audit(tx, user, "IMPORT_REFERENCE_CREATED", "Equipment", {
      batchId,
      after: equipment,
    });
  }
  let technicianId: string | undefined;
  if (data.technician) {
    let technician = await tx.technician.findFirst({
      where: { name: { equals: String(data.technician), mode: "insensitive" } },
    });
    if (!technician) {
      if (!o.createReferences)
        throw new HttpError(409, "Técnico não cadastrado");
      technician = await tx.technician.create({
        data: {
          id: "TEC-IMP-" + randomUUID().slice(0, 8),
          name: String(data.technician),
          specialty: "Não informada",
          isDemo: source.isDemo,
          active: true,
        },
      });
      await journal(
        tx,
        batchId,
        row.rowNumber,
        "TECHNICIAN",
        technician.id,
        "CREATE",
        null,
        technician,
      );
      await audit(tx, user, "IMPORT_REFERENCE_CREATED", "Technician", {
        batchId,
        after: technician,
      });
    }
    if (!technician.active) throw new HttpError(409, "Técnico inativo");
    technicianId = technician.id;
  }
  return {
    equipmentId: equipment?.id || data.equipmentId,
    sectorId,
    technicianId,
  };
}
export async function applyChunk(db: PrismaClient, id: string, user: Actor) {
  return db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(739104,1) AS locked`;
      if (!lock[0].locked)
        throw new HttpError(
          409,
          "Outra importação está sendo processada. Tente novamente em alguns segundos.",
        );
      await scheduleLock(tx);
      const batch = must(
        await tx.importBatch.findUnique({
          where: { id },
          include: { sourceConfig: true },
        }),
      );
      if (["APPLIED", "PARTIAL"].includes(batch.status)) return batch;
      if (!["PREVIEW", "RUNNING"].includes(batch.status))
        throw new HttpError(
          409,
          "Gere e confirme uma prévia antes de importar",
        );
      const payload = batch.payload as any;
      if (
        batch.sourceConfig?.target === "EQUIPMENT" &&
        payload?.formatVersion !== 2
      )
        throw new HttpError(
          409,
          "A regra de TAG mudou. Envie o arquivo e gere uma nova prévia.",
        );
      if (!payload?.confirmed)
        throw new HttpError(409, "Confirme a prévia antes de continuar");
      const source = must(batch.sourceConfig);
      if (!source.active) throw new HttpError(409, "Origem inativa");
      const o = payload.options as ImportOptions,
        rows = payload.rows as Planned[],
        counts = {
          created: 0,
          updated: 0,
          unchanged: 0,
          duplicates: 0,
          errors: 0,
          ...((batch.counts as object) || {}),
        } as any;
      const errors = (Array.isArray(batch.errors) ? batch.errors : []) as any[];
      const end = Math.min(batch.processed + 5, rows.length);
      for (const row of rows.slice(batch.processed, end)) {
        if (["INVALID", "CONFLICT"].includes(row.action)) {
          counts.errors++;
          continue;
        }
        if (row.action === "DUPLICATE") {
          counts.duplicates++;
          continue;
        }
        if (row.action === "GROUPED") {
          counts.grouped = (counts.grouped || 0) + 1;
          continue;
        }
        if (row.action === "SKIP") {
          counts.unchanged++;
          continue;
        }
        const link = await tx.externalRecord.findUnique({
          where: {
            scope_entityType_externalKey: {
              scope: source.scope,
              entityType: source.target,
              externalKey: row.externalKey,
            },
          },
        });
        const target = source.target as Target,
          current = link
            ? await model(tx, target).findUnique({
                where: { id: link.entityId },
              })
            : null;
        if (target === "EQUIPMENT" && current?.deletedAt)
          throw new HttpError(
            409,
            "Cadastro excluído após a prévia. Restaure ou gere outra prévia.",
          );
        if (
          (row.action === "CREATE" && link) ||
          (row.action === "UPDATE" &&
            (!current || current.version !== row.expectedVersion))
        ) {
          counts.errors++;
          errors.push({
            row: row.rowNumber,
            key: row.externalKey,
            error:
              "Registro mudou após a prévia; nenhuma substituição foi feita",
          });
          continue;
        }
        if (current && (target === "ORDERS" || target === "PLANS"))
          await guardReservedTarget(
            tx,
            target === "ORDERS" ? "ORDER" : "PLAN",
            current.id,
            current,
            {
              ...patchFor(target, row.data),
              equipmentId: row.data.equipmentId,
              ...(row.data.technician
                ? {
                    technicianId: (
                      await tx.technician.findFirst({
                        where: {
                          name: {
                            equals: String(row.data.technician),
                            mode: "insensitive",
                          },
                        },
                      })
                    )?.id,
                  }
                : {}),
            },
          );
        const refs = await references(tx, source, id, row, o, user);
        const patch = patchFor(target, row.data);
        let data: Record<string, any> = current
          ? patch
          : { ...defaults(target, row.data, o), ...patch };
        if (target === "EQUIPMENT") {
          data.sectorId = refs.sectorId;
        } else {
          data.equipmentId = refs.equipmentId;
          if (refs.technicianId) data.technicianId = refs.technicianId;
        }
        if (target === "ORDERS" && source.system === "SAP")
          data.sapReference = row.externalKey;
        if (target === "INTERRUPTIONS") {
          const start = new Date(data.startedAt || current?.startedAt),
            endDate = data.endedAt
              ? new Date(data.endedAt)
              : current?.endedAt || null;
          data.durationMinutes = endDate
            ? Math.round((endDate.getTime() - start.getTime()) / 60000)
            : null;
          data.status = endDate ? "CLOSED" : "OPEN";
          data.source = source.system + "-EXPORT";
        }
        data = restore(data);
        const delegate = model(tx, target);
        let after: any;
        if (current) {
          const result = await delegate.updateMany({
            where: { id: current.id, version: row.expectedVersion },
            data: { ...data, version: { increment: 1 } },
          });
          if (!result.count)
            throw new HttpError(
              409,
              "Registro alterado durante a importação; retome a partir da prévia",
            );
          after = await delegate.findUnique({ where: { id: current.id } });
          counts.updated++;
        } else {
          const entityId =
            target === "EQUIPMENT"
              ? (await tx.equipment.findUnique({
                  where: { id: String(row.data.equipmentId) },
                }))
                ? "EQ-" + randomUUID()
                : String(row.data.equipmentId)
              : "IMP-" + target.slice(0, 3) + "-" + randomUUID().slice(0, 12);
          after = await delegate.create({
            data: { ...data, id: entityId, isDemo: source.isDemo },
          });
          counts.created++;
        }
        if (current && target === "ORDERS")
          await syncOrderAssignments(
            tx,
            after,
            user,
            "Situação atualizada por importação revisada. Lote " + id,
          );
        const newLink = await tx.externalRecord.upsert({
          where: {
            scope_entityType_externalKey: {
              scope: source.scope,
              entityType: source.target,
              externalKey: row.externalKey,
            },
          },
          create: {
            sourceId: source.id,
            scope: source.scope,
            externalKey: row.externalKey,
            entityType: target,
            entityId: after.id,
            contentHash: row.hash,
            lastApplied: snapshot(after),
            appliedVersion: after.version,
            lastBatchId: id,
          },
          update: {
            sourceId: source.id,
            contentHash: row.hash,
            lastApplied: snapshot(after),
            appliedVersion: after.version,
            lastBatchId: id,
          },
        });
        const change = await journal(
          tx,
          id,
          row.rowNumber,
          target,
          after.id,
          current ? "UPDATE" : "CREATE",
          current,
          after,
          link,
        );
        if (!link)
          await tx.importChange.update({
            where: { id: change.id },
            data: { externalRecordId: newLink.id },
          });
        if (target === "ORDERS")
          await tx.orderHistory.create({
            data: {
              orderId: after.id,
              userId: user.id,
              action: current ? "IMPORTED_UPDATE" : "IMPORTED_CREATE",
              before: current ? snapshot(current) : undefined,
              after: snapshot(after),
              notes:
                "Importação revisada " +
                source.system +
                " · lote " +
                id +
                " · chave " +
                row.externalKey,
            },
          });
        await audit(
          tx,
          user,
          current ? "IMPORT_UPDATED" : "IMPORT_CREATED",
          target,
          { batchId: id, key: row.externalKey, before: current, after },
        );
      }
      const status =
        end === rows.length
          ? counts.errors
            ? "PARTIAL"
            : "APPLIED"
          : "RUNNING";
      const result = await tx.importBatch.update({
        where: { id },
        data: {
          processed: end,
          status,
          counts,
          errors,
          ...(status !== "RUNNING"
            ? { preview: { completed: true }, payload: { completed: true } }
            : {}),
        },
      });
      if (status !== "RUNNING")
        await audit(tx, user, "IMPORT_FINISHED", "ImportBatch", {
          id,
          status,
          counts,
        });
      return result;
    },
    { timeout: 25000, maxWait: 5000 },
  );
}
