import type { Equipment } from "../../types/operations";
export const scheduleLabels: Record<string, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "Em execução",
  BLOCKED: "Bloqueada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};
export type Target = {
  kind: "ORDER" | "PLAN";
  id: string;
  version: number;
  reference: string;
  title: string;
  equipmentId: string;
  equipment: Equipment;
  type: string;
  technicianId: string | null;
  technician: string | null;
  dueAt: string | null;
  priority: number | null;
  status: string;
  reservationCount: number;
  blocked: boolean;
};
export type Assignment = {
  id: string;
  version: number;
  kind: "ORDER" | "PLAN";
  targetId: string;
  targetVersion: number;
  title: string;
  reference: string;
  equipmentId: string;
  equipment: Equipment;
  type: string;
  technicianId: string;
  technician: { id: string; name: string; specialty: string; active: boolean };
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  actualStartedAt: string | null;
  completedAt: string | null;
  overdue: boolean;
  blockedReason: string | null;
  dueAt: string | null;
  order: {
    version: number;
    priority: number;
    scheduledAt: string | null;
    status: string;
  } | null;
  plan: {
    version: number;
    nextExecution: string;
    title: string;
    type: string;
  } | null;
  history?: {
    id: string;
    action: string;
    createdAt: string;
    notes: string;
    user: { name: string };
    before?: { startsAt: string; endsAt: string; technicianId: string };
    after: { startsAt: string; endsAt: string; technicianId: string };
  }[];
};
export type Capacity = {
  id: string;
  name: string;
  specialty: string;
  active: boolean;
  configured: boolean;
  capacityMinutes: number;
  freeMinutes: number;
  bookedMinutes: number;
};
export type Overview = {
  period: { from: string; to: string; timezone: string };
  items: Assignment[];
  capacity: Capacity[];
  summary: {
    total: number;
    scheduled: number;
    inProgress: number;
    blocked: number;
    overdue: number;
  };
  note: string;
};
export type Suggestion = Target & {
  score: number;
  scoreParts: Record<string, number>;
  evidence: {
    criticality: number;
    priority: number | null;
    daysLate: number;
    interruptionCount: number;
    downtimeMinutes: number;
    historyFrom: string;
    historyTo: string;
  };
  durationMinutes: number;
  slot: {
    technicianId: string;
    technicianName: string;
    specialty: string;
    startsAt: string;
    endsAt: string;
  } | null;
  reason: string;
};
export type WorkWindow = {
  id: string;
  version: number;
  technicianId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
};
export type Absence = {
  id: string;
  version: number;
  technicianId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  active: boolean;
};
