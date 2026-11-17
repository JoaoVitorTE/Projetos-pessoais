import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
// Operação administrativa única. Nunca é chamada pelo build, servidor ou migration.
const flag = (name: string) =>
  process.argv
    .find((a) => a.startsWith("--" + name + "="))
    ?.split("=")
    .slice(1)
    .join("=");
const adminId = flag("admin-user"),
  backupBranch = flag("backup-branch");
if (
  process.env.DATA_MODE !== "operational" ||
  flag("confirm") !== "ZERAR-DADOS-OPERACIONAIS" ||
  !adminId ||
  !backupBranch?.startsWith("br-")
)
  throw Error(
    "Exige DATA_MODE=operational, --confirm=ZERAR-DADOS-OPERACIONAIS, --admin-user e --backup-branch. Faça e verifique a cópia de segurança antes.",
  );
const db = new PrismaClient();
export const businessTables = [
  "ImportChange",
  "ExternalRecord",
  "ImportBatch",
  "ImportSource",
  "ThirdPartyDocument",
  "ThirdPartyMovement",
  "ThirdPartyService",
  "DocumentRequirement",
  "TechnicianAssignment",
  "MaintenanceExecution",
  "OrderHistory",
  "MaintenanceOrder",
  "MaintenancePlan",
  "Interruption",
  "CompressedAirReading",
  "LeakInspection",
  "Alert",
  "Equipment",
  "Technician",
  "Sector",
];
try {
  const result = await db.$transaction(
    async (tx) => {
      const owner = await tx.user.findUnique({
        where: { id: adminId },
        include: { role: true },
      });
      if (!owner?.active || owner.role.name !== "ADMIN")
        throw Error("Administrador de preservação inválido");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(739104,1)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(739104,2)`;
      await tx.$executeRawUnsafe(
        "LOCK TABLE " +
          businessTables.map((t) => '"' + t + '"').join(",") +
          " IN ACCESS EXCLUSIVE MODE",
      );
      const before = await tx.$queryRawUnsafe<Record<string, number>[]>(
        "SELECT " +
          businessTables
            .map(
              (t) => '(SELECT count(*)::int FROM "' + t + '") AS "' + t + '"',
            )
            .join(","),
      );
      await tx.user.updateMany({
        where: { technicianId: { not: null } },
        data: { technicianId: null },
      });
      for (const table of businessTables)
        await tx.$executeRawUnsafe('DELETE FROM "' + table + '"');
      const demoIds = [
        "USER-DEMO-MANAGER",
        "USER-DEMO-PLANNER",
        "USER-DEMO-TECHNICIAN",
        "USER-DEMO-VIEWER",
      ].filter((id) => id !== adminId);
      await tx.session.deleteMany({ where: { userId: { in: demoIds } } });
      await tx.user.updateMany({
        where: { id: { in: demoIds }, email: { endsWith: "@pcm.demo" } },
        data: { active: false },
      });
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          userId: adminId,
          action: "OPERATIONAL_DATA_CLEARED",
          entity: "Workspace",
          metadata: {
            backupBranch,
            countsBefore: before[0],
            preserved: ["User", "Role", "AuditLog", "Admin Session"],
            reason:
              "Limpeza dos dados de demonstração solicitada pelo responsável para iniciar seus cadastros.",
          },
        },
      });
      const after = await tx.user.findUniqueOrThrow({ where: { id: adminId } });
      if (
        after.passwordHash !== owner.passwordHash ||
        after.mustChangePassword !== owner.mustChangePassword ||
        !after.active
      )
        throw Error("Verificação de preservação falhou");
      return { cleared: before[0], backupBranch, adminAccessPreserved: true };
    },
    { timeout: 30000 },
  );
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
