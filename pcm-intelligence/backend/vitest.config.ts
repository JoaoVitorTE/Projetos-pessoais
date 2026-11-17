import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import { existsSync } from "node:fs";

if (!existsSync(".env.test"))
  throw new Error(
    "Copie .env.test.example para .env.test e prepare o PostgreSQL local de testes.",
  );
dotenv.config({ path: ".env.test", override: true });
if (
  process.env.DATA_MODE !== "demo" ||
  !new URL(process.env.DATABASE_URL || "file:///").pathname.endsWith("_test")
) {
  throw new Error("Testes exigem um banco isolado cujo nome termine em _test");
}
export default defineConfig({ test: { fileParallelism: false } });
