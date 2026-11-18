import { scheduleLock } from "../scheduling/lifecycle.js";
import type { PrismaClient, Prisma } from "@prisma/client";
import { model, restore } from "./engine.js";
import { fingerprint } from "./specs.js";
import { audit, HttpError, must, type Actor } from "../operations/helpers.js";
import { snapshot } from "../operations/domain.js";
export async function undoPreview(db: PrismaClient, id: string) {
  const batch = must(await db.importBatch.findUnique({ where: { id } }));
  if (!["APPLIED", "PARTIAL", "REVERTING"].includes(batch.status))
    throw new HttpError(409, "Somente lotes aplicados podem ser desfeitos");
  const changes = await db.importChange.findMany({
    where: { batchId: id, undone: false },
    orderBy: { sequence: "desc" },
  });
  const blockers: string[] = [];
  const groups = new Map<string, string[]>();
  for (const c of changes)
    groups.set(c.entityType, [...(groups.get(c.entityType) || []), c.entityId]);
  const current = new Map<string, any>();
  for (const [type, ids] of groups) {
    for (const row of await model(db, type).findMany({
      where: { id: { in: ids } },
    }))
      current.set(type + ":" + row.id, row);
  }
  for (const c of changes) {
    const row = current.get(c.entityType + ":" + c.entityId),
      after = c.after as any;
    if (!row) {
      blockers.push(c.entityId + ": registro não existe");
      continue;
    }
    if (
      row.version !== undefined
        ? row.version !== after.version
        : fingerprint(snapshot(row)) !== fingerprint(after)
    )
      blockers.push(c.entityId + ": registro alterado depois deste lote");
  }
  const created = (type: string) =>
    changes
      .filter((c) => c.operation === "CREATE" && c.entityType === type)
      .map((c) => c.entityId);
  if (
    await db.thirdPartyService.count({
      where: { orderId: { in: created("ORDERS") } },
    })
  )
    blockers.push("Há processos de terceiros vinculados às ordens criadas");
  if (
    await db.maintenanceExecution.count({
      where: { planId: { in: created("PLANS") } },
    })
  )
    blockers.push("Há execuções de planos criados por este lote");
  if (
    await db.technicianAssignment.count({
      where: {
        OR: [
          { orderId: { in: created("ORDERS") } },
          { planId: { in: created("PLANS") } },
        ],
      },
    })
  )
    blockers.push(
      "Há reservas ou histórico de agenda vinculados aos registros criados",
    );
  const techIds = created("TECHNICIAN"),
    gearIds = created("EQUIPMENT");
  if (
    (await db.technicianWorkWindow.count({
      where: { technicianId: { in: techIds } },
    })) ||
    (await db.technicianAbsence.count({
      where: { technicianId: { in: techIds } },
    }))
  )
    blockers.push(
      "Técnico criado possui jornada ou indisponibilidade cadastrada",
    );
  if (await db.user.count({ where: { technicianId: { in: techIds } } }))
    blockers.push("Técnico criado já foi vinculado a usuário");
  if (
    await db.maintenanceOrder.count({
      where: {
        OR: [
          { equipmentId: { in: gearIds } },
          { technicianId: { in: techIds } },
        ],
        id: { notIn: created("ORDERS") },
      },
    })
  )
    blockers.push("Há ordens posteriores vinculadas aos cadastros criados");
  if (
    await db.maintenancePlan.count({
      where: {
        OR: [
          { equipmentId: { in: gearIds } },
          { technicianId: { in: techIds } },
        ],
        id: { notIn: created("PLANS") },
      },
    })
  )
    blockers.push("Há planos posteriores vinculados aos cadastros criados");
  if (
    await db.interruption.count({
      where: {
        equipmentId: { in: gearIds },
        id: { notIn: created("INTERRUPTIONS") },
      },
    })
  )
    blockers.push(
      "Há interrupções posteriores vinculadas aos equipamentos criados",
    );
  return {
    changes: changes.length,
    blockers: [...new Set(blockers)],
    canUndo: !blockers.length,
  };
}
export async function undoChunk(db: PrismaClient, id: string, user: Actor) {
  return db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(739104,1) AS locked`;
      if (!lock[0].locked)
        throw new HttpError(409, "Outra importação está sendo processada");
      await scheduleLock(tx);
      const batch = must(await tx.importBatch.findUnique({ where: { id } }));
      if (batch.status === "REVERTED") return batch;
      if (!["APPLIED", "PARTIAL", "REVERTING"].includes(batch.status))
        throw new HttpError(409, "Lote não disponível para desfazer");
      const changes = await tx.importChange.findMany({
        where: { batchId: id, undone: false },
        orderBy: { sequence: "desc" },
        take: 15,
      });
      for (const c of changes) {
        const delegate = model(tx, c.entityType),
          current = must(
            await delegate.findUnique({ where: { id: c.entityId } }),
            "Registro do lote não existe mais",
          ),
          after = c.after as any;
        if (
          current.version !== undefined
            ? current.version !== after.version
            : fingerprint(snapshot(current)) !== fingerprint(after)
        )
          throw new HttpError(
            409,
            "Registro alterado depois do lote: " + c.entityId,
          );
        if (
          c.entityType === "TECHNICIAN" &&
          (await tx.user.count({ where: { technicianId: c.entityId } }))
        )
          throw new HttpError(409, "Técnico vinculado a usuário");
        const link = c.externalRecordId
          ? await tx.externalRecord.findUnique({
              where: { id: c.externalRecordId },
            })
          : null;
        if (link && link.lastBatchId !== id)
          throw new HttpError(
            409,
            "O registro já pertence a uma importação posterior",
          );
        if (c.operation === "CREATE") {
          if (c.entityType === "ORDERS")
            await tx.orderHistory.deleteMany({
              where: { orderId: c.entityId },
            });
          if (
            c.entityType === "TECHNICIAN" &&
            ((await tx.maintenanceOrder.count({
              where: { technicianId: c.entityId },
            })) ||
              (await tx.technicianAssignment.count({
                where: { technicianId: c.entityId },
              })))
          )
            throw new HttpError(
              409,
              "Técnico vinculado a atividades posteriores",
            );
          try {
            await delegate.delete({
              where:
                current.version !== undefined
                  ? { id: c.entityId, version: current.version }
                  : current,
            });
          } catch {
            throw new HttpError(
              409,
              "Há registros posteriores vinculados a " +
                c.entityId +
                "; a reversão foi interrompida com segurança",
            );
          }
          if (link) await tx.externalRecord.delete({ where: { id: link.id } });
        } else {
          const before = restore(c.before as any);
          delete before.id;
          const restored = await delegate.update({
            where: { id: c.entityId, version: current.version },
            data: {
              ...before,
              ...(current.version !== undefined
                ? { version: { increment: 1 } }
                : {}),
            },
          });
          if (c.beforeLink) {
            const old = { ...(c.beforeLink as any) };
            delete old.id;
            delete old.updatedAt;
            await tx.externalRecord.update({
              where: { id: c.externalRecordId! },
              data: {
                ...old,
                appliedVersion: restored.version,
                lastApplied: snapshot(restored),
              },
            });
          }
          if (c.entityType === "ORDERS")
            await tx.orderHistory.create({
              data: {
                orderId: c.entityId,
                userId: user.id,
                action: "IMPORT_REVERTED",
                before: snapshot(current),
                after: snapshot(restored),
                notes: "Reversão revisada do lote " + id,
              },
            });
        }
        await tx.importChange.update({
          where: { id: c.id },
          data: { undone: true },
        });
        await audit(tx, user, "IMPORT_REVERTED", c.entityType, {
          batchId: id,
          entityId: c.entityId,
          operation: c.operation,
        });
      }
      const left = await tx.importChange.count({
        where: { batchId: id, undone: false },
      });
      return tx.importBatch.update({
        where: { id },
        data: { status: left ? "REVERTING" : "REVERTED" },
      });
    },
    { timeout: 25000, maxWait: 5000 },
  );
}
