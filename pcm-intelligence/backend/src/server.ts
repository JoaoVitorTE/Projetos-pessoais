import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp, logger } from "./app.js";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");
if (process.env.DATA_MODE !== "demo")
  throw new Error(
    "Esta versão aceita apenas DATA_MODE=demo; dados reais ainda não habilitados",
  );
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
