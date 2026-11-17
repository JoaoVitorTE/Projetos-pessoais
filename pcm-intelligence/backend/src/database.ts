import { PrismaClient } from "@prisma/client";

const shared = globalThis as typeof globalThis & { pcmDatabase?: PrismaClient };
export function getDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL não configurada");
  return (shared.pcmDatabase ??= new PrismaClient());
}
