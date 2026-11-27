import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// Persiste entre instâncias serverless; não depende da memória da função ou de IP informado pelo cliente.
const loginKey = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function allowLogin(
  db: PrismaClient,
  identity: string,
  limit = 5,
) {
  const key = loginKey(identity);
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
  return rows[0].attempts <= limit;
}

export function clearLoginAttempts(db: PrismaClient, email: string) {
  return db.loginThrottle.deleteMany({ where: { id: loginKey(email) } });
}
