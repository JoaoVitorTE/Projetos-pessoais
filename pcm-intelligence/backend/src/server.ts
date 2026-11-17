import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp, logger } from "./app.js";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");
if (!["demo", "operational"].includes(process.env.DATA_MODE || ""))
  throw new Error("Configure DATA_MODE=demo ou operational");
const db = new PrismaClient();
await db.$connect();
const server = createApp(db).listen(
  Number(process.env.PORT || 3001),
  "127.0.0.1",
  () => logger.info("PCM API disponível em http://localhost:3001"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      db.$disconnect().finally(() => process.exit(0));
    });
  });
