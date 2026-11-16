import "dotenv/config";
import { PrismaClient, RoleName } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
const password = process.env.SEED_PASSWORD;
if (process.env.DATA_MODE !== "demo" || !password || password.length < 12)
  throw new Error(
    "Seed exige DATA_MODE=demo e SEED_PASSWORD com pelo menos 12 caracteres.",
  );
const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 86400000);
async function main() {
  await db.$transaction(
    async (tx) => {
      for (const name of Object.values(RoleName)) {
        const role = await tx.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        await tx.user.upsert({
          where: { email: `${name.toLowerCase()}@pcm.demo` },
          update: {},
          create: {
            name: `Demonstração ${name}`,
            email: `${name.toLowerCase()}@pcm.demo`,
            passwordHash: await hash(password!, 12),
            roleId: role.id,
          },
        });
      }
      for (let i = 1; i <= 5; i++)
        await tx.sector.upsert({
          where: { id: `SEC-${i}` },
          update: {},
          create: {
            id: `SEC-${i}`,
            name: [
              "Usinagem",
              "Montagem",
              "Estamparia",
              "Pintura",
              "Utilidades",
            ][i - 1],
          },
        });
      for (let i = 1; i <= 30; i++) {
        const id = `EQ-${String(i).padStart(3, "0")}`;
        await tx.equipment.upsert({
          where: { id },
          update: {},
          create: {
            id,
            name: `${["Centro de usinagem", "Prensa", "Transportador", "Cabine", "Compressor"][(i - 1) % 5]} ${i}`,
            sectorId: `SEC-${((i - 1) % 5) + 1}`,
            criticality: (i % 3) + 1,
            status: i % 7 === 0 ? "STOPPED" : "RUNNING",
          },
        });
      }
      for (let i = 1; i <= 12; i++)
        await tx.technician.upsert({
          where: { id: `TEC-${i}` },
          update: {},
          create: {
            id: `TEC-${i}`,
            name: `Técnico fictício ${i}`,
            specialty: i % 2 ? "Mecânica" : "Elétrica",
          },
        });
      for (let i = 1; i <= 200; i++) {
        const start = days(i > 140 ? -((i % 7) + 1) : -((i % 49) + 8));
        start.setUTCHours(i % 24, 0, 0, 0);
        const duration = 20 + ((i * 17) % 160);
        const id = `INT-${i}`;
        await tx.interruption.upsert({
          where: { id },
          update: {},
          create: {
            id,
            equipmentId:
              i > 140
                ? "EQ-014"
                : `EQ-${String((i % 30) + 1).padStart(3, "0")}`,
            startedAt: start,
            endedAt: new Date(start.getTime() + duration * 60000),
            durationMinutes: duration,
            type: "UNPLANNED",
            reason: [
              "Inspeção necessária",
              "Falha registrada",
              "Ajuste operacional",
            ][i % 3],
            description: "Ocorrência fictícia para demonstração",
          },
        });
      }
      for (let i = 1; i <= 100; i++) {
        const id = `OS-${String(i).padStart(4, "0")}`;
        await tx.maintenanceOrder.upsert({
          where: { id },
          update: {},
          create: {
            id,
            equipmentId: `EQ-${String((i % 30) + 1).padStart(3, "0")}`,
            technicianId: `TEC-${(i % 12) + 1}`,
            type: [
              "CORRECTIVE",
              "PREVENTIVE",
              "PREDICTIVE",
              "LUBRICATION",
              "INSPECTION",
            ][i % 5],
            description: `Atividade fictícia ${i}: inspeção e manutenção`,
            priority: (i % 3) + 1,
            status: [
              "OPEN",
              "ANALYSIS",
              "SCHEDULED",
              "IN_PROGRESS",
              "WAITING_PART",
              "WAITING_VENDOR",
              "COMPLETED",
              "CANCELLED",
            ][i % 8],
            openedAt: days(-30),
            scheduledAt: i % 8 === 6 ? days(-2) : days((i % 20) - 10),
            completedAt: i % 8 === 6 ? days(-1) : null,
          },
        });
      }
      for (let i = 1; i <= 70; i++) {
        const id = `PLAN-${i}`;
        await tx.maintenancePlan.upsert({
          where: { id },
          update: {},
          create: {
            id,
            equipmentId: `EQ-${String((i % 30) + 1).padStart(3, "0")}`,
            technicianId: `TEC-${(i % 12) + 1}`,
            type: i <= 40 ? "PREVENTIVE" : "LUBRICATION",
            intervalDays: i <= 40 ? 30 : 7,
            nextExecution: days((i % 21) - 5),
          },
        });
      }
      const stages = [
        "REQUESTED",
        "EXECUTED",
        "DOCUMENTS_RECEIVED",
        "CHECKING",
        "PENDING",
        "PREPARED",
        "VALIDATED",
        "SENT_TO_CENTRAL",
        "FINANCE",
        "FINISHED",
      ];
      for (let i = 1; i <= 25; i++) {
        const id = `TER-${i}`;
        await tx.thirdPartyService.upsert({
          where: { id },
          update: {},
          create: {
            id,
            provider: `Prestador fictício ${(i % 6) + 1}`,
            description: `Serviço de manutenção demonstrativo ${i}`,
            executedAt: days(-20),
            internalOwner: "Responsável fictício PCM",
            orderId: `OS-${String(i).padStart(4, "0")}`,
            status: stages[i % 10],
            pendingNotes:
              i % 10 === 4 ? "Requisito a definir pelo administrador" : null,
            stageEnteredAt: days(-(i % 15)),
            movements: {
              create: {
                status: stages[i % 10],
                occurredAt: days(-(i % 15)),
                actor: "Seed de demonstração",
                notes: "Estado inicial fictício",
              },
            },
          },
        });
      }
      for (let i = 0; i < 336; i++)
        await tx.compressedAirReading.upsert({
          where: { id: `AIR-${i}` },
          update: {},
          create: {
            id: `AIR-${i}`,
            compressor: `COMP-${(i % 2) + 1}`,
            sector: "Utilidades",
            pressure: 6.5 + (i % 8) / 10,
            flow: 110 + (i % 17) * 3,
            energyKwh: 18 + (i % 9),
            measuredAt: new Date(now.getTime() - i * 3600000),
            operatingState: "RUNNING",
          },
        });
    },
    { timeout: 120000 },
  );
  console.log(
    "Demonstração carregada: 5 usuários, 30 equipamentos, 12 técnicos, 200 interrupções, 100 OS, 70 planos, 25 processos e 336 leituras.",
  );
}
main().finally(() => db.$disconnect());
