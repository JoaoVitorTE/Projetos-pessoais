import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// Persiste entre instâncias serverless; não depende da memória da função ou de IP informado pelo cliente.
export async function allowLogin(db: PrismaClient, email: string) {
  const key = createHash("sha256").update(email).digest("hex");
  const rows = await db.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginThrottle" ("id", "attempts", "windowStartedAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE SET
      "attempts" = CASE
        WHEN "LoginThrottle"."windowStartedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 1
        ELSE "LoginThrottle"."attempts" + 1 END,
      "windowStartedAt" = CASE
        WHEN "LoginThrottle"."windowStartedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN CURRENT_TIMESTAMP
        ELSE "LoginThrottle"."windowStartedAt" END
    RETURNING "attempts"`;
  return rows[0].attempts <= 15;
}
