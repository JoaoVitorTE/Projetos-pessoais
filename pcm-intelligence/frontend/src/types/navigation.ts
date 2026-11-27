export type ModuleId =
  | "home"
  | "dashboard"
  | "equipment"
  | "interruptions"
  | "orders"
  | "scheduling"
  | "plans"
  | "third"
  | "imports"
  | "reports"
  | "assistant"
  | "alerts"
  | "administration"
  | "audit"
  | "security"
  | "help";
export type NavigationOptions = {
  recordId?: string;
  overdue?: boolean;
  createReminder?: boolean;
  sapFeed?: "IW38" | "IW47";
  interruptionImport?: boolean;
  q?: string;
  adminTab?: "users" | "technicians" | "sectors";
};
export type Navigate = (id: ModuleId, options?: NavigationOptions) => void;
export const roleNames: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  PLANNER: "Planejador PCM",
  TECHNICIAN: "Técnico",
  VIEWER: "Visualizador",
};
export const roleDescriptions: Record<string, string> = {
  ADMIN: "Gerencia acessos, cadastros e todas as rotinas do PCM.",
  MANAGER:
    "Acompanha indicadores, planeja e valida os processos de manutenção.",
  PLANNER: "Organiza equipamentos, ordens, planos, agenda e processos.",
  TECHNICIAN: "Consulta a operação e aponta as atividades atribuídas a ele.",
  VIEWER: "Consulta indicadores e registros, sem alterar os dados.",
};
