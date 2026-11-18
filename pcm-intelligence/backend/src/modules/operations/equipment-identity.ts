import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "./helpers.js";
export const tagSchema = z
  .string()
  .trim()
  .min(1, "Informe a TAG")
  .max(80)
  .regex(/^[^\u0000-\u001f\u007f]+$/, "TAG contém caracteres inválidos")
  .transform((v) => v.toUpperCase());
export const numberSchema = z
  .string()
  .trim()
  .max(80)
  .regex(/^[^\u0000-\u001f\u007f]*$/)
  .nullable()
  .optional()
  .transform((v) => v || null);
export async function assertActiveEquipment(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
) {
  const equipment = await db.equipment.findUnique({ where: { id } });
  if (!equipment || equipment.deletedAt)
    throw new HttpError(
      409,
      "Equipamento indisponível. Confira o cadastro e a área de excluídos.",
    );
  return equipment;
}
export function equipmentCaption(e: {
  id: string;
  tag?: string | null;
  equipmentNumber?: string | null;
}) {
  return e.tag || "TAG pendente · ref. " + e.id;
}
export function resolveEquipment<
  T extends {
    id: string;
    tag: string | null;
    equipmentNumber: string | null;
    sectorId: string;
    deletedAt: Date | null;
  },
>(rows: T[], key: string, sectorId?: string) {
  const normalized = key.trim().toUpperCase();
  const matches = rows.filter(
    (e) =>
      (!sectorId || e.sectorId === sectorId) &&
      [e.id, e.tag, e.equipmentNumber].some(
        (v) => v?.toUpperCase() === normalized,
      ),
  );
  if (matches.length > 1)
    throw Error(
      "TAG ou referência ambígua. Mapeie o setor para identificar o equipamento.",
    );
  if (matches[0]?.deletedAt)
    throw Error(
      "Equipamento excluído. Restaure o cadastro antes de importar atividades.",
    );
  return matches[0];
}
