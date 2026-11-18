export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  technicianId: string | null;
  mustChangePassword: boolean;
  onboardingVersion: number;
  onboardingCompletedAt: string | null;
};
export type Equipment = {
  version: number;
  id: string;
  name: string;
  sectorId: string;
  criticality: number;
  status: string;
  sector?: { name: string };
};
export type Lookups = {
  mode: "demo" | "operational";
  sectors: { id: string; name: string }[];
  technicians: {
    id: string;
    name: string;
    specialty: string;
    active: boolean;
  }[];
  equipment: Equipment[];
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};
export type Order = {
  id: string;
  version: number;
  equipmentId: string;
  equipment?: Equipment;
  technicianId: string | null;
  technician?: { name: string };
  type: string;
  description: string;
  priority: number;
  status: string;
  openedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  sapReference: string | null;
  overdue?: boolean;
  history?: {
    id: string;
    action: string;
    createdAt: string;
    notes: string;
    user: { name: string };
    before?: { status: string };
    after: { status: string };
  }[];
};
export type Plan = {
  id: string;
  version: number;
  title: string;
  equipmentId: string;
  equipment?: Equipment;
  technicianId: string;
  technician?: { name: string };
  type: string;
  intervalDays: number;
  nextExecution: string;
  active: boolean;
  executions?: {
    id: string;
    executedAt: string;
    scheduledFor: string;
    notes: string;
    technicianName: string;
  }[];
};
export type Interruption = {
  version: number;
  id: string;
  equipmentId: string;
  equipment?: Equipment;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  type: string;
  reason: string;
  description: string;
  status: string;
  source: string;
};
export type Requirement = { id: string; name: string; active: boolean };
export type ThirdParty = {
  id: string;
  version: number;
  provider: string;
  description: string;
  executedAt: string | null;
  internalOwner: string;
  orderId: string;
  purchaseReference?: string | null;
  amount?: string | number | null;
  status: string;
  pendingNotes: string | null;
  stageEnteredAt: string;
  daysInStage: number;
  documents: {
    id: string;
    name: string;
    reference: string;
    verified: boolean;
    requirementId: string | null;
  }[];
  requirements?: Requirement[];
  missingRequirements?: Requirement[];
  movements?: {
    id: string;
    status: string;
    occurredAt: string;
    actor: string;
    notes: string;
  }[];
  draftMessage?: string;
};
export const statusLabel: Record<string, string> = {
  UNKNOWN: "Não informado",
  RUNNING: "Operando",
  STOPPED: "Parada",
  MAINTENANCE: "Em manutenção",
  OPEN: "Aberta",
  CLOSED: "Encerrada",
  ANALYSIS: "Em análise",
  SCHEDULED: "Programada",
  IN_PROGRESS: "Em execução",
  WAITING_PART: "Aguardando peça",
  WAITING_VENDOR: "Aguardando terceiro",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  REQUESTED: "Serviço solicitado",
  EXECUTED: "Serviço executado",
  DOCUMENTS_RECEIVED: "Documentação recebida",
  CHECKING: "Em conferência",
  PENDING: "Pendência identificada",
  PREPARED: "Regularização preparada",
  VALIDATED: "Regularização validada",
  SENT_TO_CENTRAL: "Encaminhado à central",
  FINANCE: "Tratamento financeiro",
  FINISHED: "Finalizado",
};
export const typeLabel: Record<string, string> = {
  CORRECTIVE: "Corretiva",
  PREVENTIVE: "Preventiva",
  PREDICTIVE: "Preditiva",
  LUBRICATION: "Lubrificação",
  INSPECTION: "Inspeção",
  UNPLANNED: "Não planejada",
  PLANNED: "Planejada",
};
export const priorities: Record<number, string> = {
  1: "Baixa",
  2: "Média",
  3: "Alta",
};
export const orderStates = [
  "OPEN",
  "ANALYSIS",
  "SCHEDULED",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
];
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
export const serviceStates = [
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
];
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
export const canPlan = (u: User) =>
  ["ADMIN", "MANAGER", "PLANNER"].includes(u.role);
export const canManage = (u: User) => ["ADMIN", "MANAGER"].includes(u.role);
export const fmt = (value: string | undefined | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
export const day = (value: string) =>
  new Date(value).toLocaleDateString("pt-BR");
export function localDate(value: string | Date = new Date()) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function query(values: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(values))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
}
