import "dotenv/config";
import { PrismaClient, RoleName } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createDemoData } from "./demo-data.js";

const db = new PrismaClient();
const password = process.env.SEED_PASSWORD;
if (
  process.env.DATA_MODE !== "demo" ||
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password) > 72
) {
  throw new Error(
    "Seed exige DATA_MODE=demo e SEED_PASSWORD entre 12 caracteres e 72 bytes.",
  );
}
async function main() {
  const data = createDemoData();
  const sharedTestPassword =
    process.env.SEED_SHARED_TEST_PASSWORD === "true" &&
    process.env.NODE_ENV === "test";
  const passwordHash = await hash(password!, 12);
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
            roleId: role.id,
            passwordHash:
              name === "ADMIN" || sharedTestPassword
                ? passwordHash
                : await hash(randomBytes(24).toString("base64url"), 12),
            mustChangePassword: !sharedTestPassword,
          },
        });
      }
      await tx.sector.createMany({ data: data.sectors, skipDuplicates: true });
      await tx.equipment.createMany({
        data: data.equipment,
        skipDuplicates: true,
      });
      await tx.technician.createMany({
        data: data.technicians,
        skipDuplicates: true,
      });
      await tx.user.updateMany({
        where: { email: "technician@pcm.demo", technicianId: null },
        data: { technicianId: "TEC-1" },
      });
      await tx.interruption.createMany({
        data: data.interruptions,
        skipDuplicates: true,
      });
      await tx.maintenanceOrder.createMany({
        data: data.orders,
        skipDuplicates: true,
      });
      await tx.maintenancePlan.createMany({
        data: data.plans,
        skipDuplicates: true,
      });
      await tx.thirdPartyService.createMany({
        data: data.services,
        skipDuplicates: true,
      });
      await tx.thirdPartyMovement.createMany({
        data: data.movements,
        skipDuplicates: true,
      });
      await tx.compressedAirReading.createMany({
        data: data.readings,
        skipDuplicates: true,
      });
    },
    { timeout: 120000 },
  );
  console.log(
    "Demonstração carregada. O administrador precisa trocar a senha no primeiro acesso; reexecuções preservam senhas e registros existentes.",
  );
}
main()
  .catch(() => {
    console.error(
      "Falha no seed. Confira a conexão e as migrations, sem compartilhar credenciais.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
