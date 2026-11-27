import { z } from "zod";
import type { Prisma, RoleName } from "@prisma/client";

export const ORDER_STATUS = [
  "OPEN",
  "ANALYSIS",
  "SCHEDULED",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
] as const;
export const ORDER_TYPES = [
  "CORRECTIVE",
  "CORRECTIVE_PLANNED",
  "IMPROVEMENT",
  "CORRECTIVE_INDUSTRIAL",
  "PREVENTIVE",
  "PREDICTIVE",
  "LUBRICATION",
  "INSPECTION",
] as const;
export const SERVICE_STAGES = [
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
] as const;
export const planners: RoleName[] = ["ADMIN", "MANAGER", "PLANNER"];
export const managers: RoleName[] = ["ADMIN", "MANAGER"];
export const orderTransitions: Record<string, string[]> = {
  OPEN: ["ANALYSIS", "SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  ANALYSIS: [
    "SCHEDULED",
    "IN_PROGRESS",
    "WAITING_PART",
    "WAITING_VENDOR",
    "CANCELLED",
  ],
  SCHEDULED: ["ANALYSIS", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PART", "WAITING_VENDOR", "COMPLETED", "CANCELLED"],
  WAITING_PART: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  WAITING_VENDOR: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
export const serviceTransitions: Record<string, string[]> = {
  REQUESTED: ["EXECUTED"],
  EXECUTED: ["DOCUMENTS_RECEIVED"],
  DOCUMENTS_RECEIVED: ["CHECKING"],
  CHECKING: ["PENDING", "PREPARED"],
  PENDING: ["CHECKING"],
  PREPARED: ["VALIDATED", "PENDING"],
  VALIDATED: ["SENT_TO_CENTRAL"],
  SENT_TO_CENTRAL: ["FINANCE"],
  FINANCE: ["FINISHED", "PENDING"],
  FINISHED: [],
};
export const filters = z
  .object({
    q: z.string().trim().max(120).optional(),
    deleted:z.enum(["true","false","all"]).optional(),
    tagMissing:z.enum(["true","false"]).optional(),
    sectorId: z.string().max(100).optional(),
    equipmentId: z.string().max(100).optional(),
    criticality: z.coerce.number().int().min(1).max(3).optional(),
    status: z.string().max(40).optional(),
    type: z.string().max(40).optional(),
    provider: z.string().max(120).optional(),
    overdue: z.enum(["true", "false"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (v) =>
      !v.from ||
      !v.to ||
      (new Date(v.to).getTime() >= new Date(v.from).getTime() &&
        new Date(v.to).getTime() - new Date(v.from).getTime() <=
          366 * 86400000),
    "O período deve ter até 366 dias e término posterior ao início",
  );
export type Filters = z.infer<typeof filters>;
export function equipmentWhere(f: Filters): Prisma.EquipmentWhereInput {
  return {
    ...(f.sectorId ? { sectorId: f.sectorId } : {}),
    ...(f.equipmentId ? { id: f.equipmentId } : {}),
    ...(f.criticality ? { criticality: f.criticality } : {}),
  };
}
export const date = z
  .string()
  .datetime()
  .transform((s) => new Date(s));
export const version = z.number().int().positive();
export const text = z.string().trim().min(3).max(2000);
export const optionalText = z.string().trim().max(2000).nullable().optional();
export function snapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}
export function overlapMinutes(
  start: Date,
  end: Date | null,
  from: Date,
  to: Date,
  now = new Date(),
) {
  const a = Math.max(start.getTime(), from.getTime());
  const b = Math.min((end || now).getTime(), to.getTime(), now.getTime());
  return Math.max(0, (b - a) / 60000);
}
export function unionMinutes(
  intervals: { startedAt: Date; endedAt: Date | null }[],
  from: Date,
  to: Date,
  now = new Date(),
) {
  const ranges = intervals
    .map((i) => [
      Math.max(i.startedAt.getTime(), from.getTime()),
      Math.min((i.endedAt || now).getTime(), to.getTime(), now.getTime()),
    ])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    start = 0,
    end = 0;
  for (const [a, b] of ranges) {
    if (!end) {
      start = a;
      end = b;
    } else if (a <= end) {
      end = Math.max(end, b);
    } else {
      total += end - start;
      start = a;
      end = b;
    }
  }
  return (total + (end ? end - start : 0)) / 60000;
}
