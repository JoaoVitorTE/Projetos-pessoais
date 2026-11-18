import { useDeferredValue, useState, lazy, Suspense } from "react";
import {
  Activity,
  Factory,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Database,
  LockKeyhole,
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  CalendarClock,
  Handshake,
  Timer,
  Search,
  FileInput,
  FileBarChart,
  Bot,
  Bell,
  Users,
} from "lucide-react";
import type { User, Lookups } from "../types/operations";
import { useResource } from "../hooks/useResource";
import { State } from "./OperationalUI";
import { PasswordForm } from "./PasswordForm";
const menu = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "equipment", label: "Equipamentos", icon: Factory },
  { id: "interruptions", label: "Interrupções", icon: Timer },
  { id: "orders", label: "Ordens de serviço", icon: ClipboardList },
  { id: "scheduling", label: "Agenda inteligente", icon: CalendarClock },
  { id: "plans", label: "Preventivas e lubrificação", icon: CalendarDays },
  { id: "third", label: "Serviços de terceiros", icon: Handshake },
  { id: "imports", label: "Importações SAP / planilhas", icon: FileInput },
  { id: "reports", label: "Relatório de preventivas", icon: FileBarChart },
  { id: "assistant", label: "Assistente PCM", icon: Bot },
  { id: "alerts", label: "Alertas", icon: Bell },
];
const descriptions: Record<string, string> = {
  dashboard: "Visão calculada da manutenção e do planejamento.",
  equipment: "Cadastro e situação dos equipamentos industriais.",
  interruptions: "Histórico de paradas e recorrência dos motivos informados.",
  orders: "Ordens locais, execução, prazos e histórico.",
  plans: "Planos de manutenção, calendário e registros de execução.",
  scheduling:
    "Reservas de horário, disponibilidade e priorização para revisão humana.",
  third: "Da solicitação ao tratamento financeiro, com revisão humana.",
  imports:
    "Importe arquivos autorizados, revise alterações e reconheça repetidos.",
  reports: "Preventivas e lubrificações abertas, responsáveis e vencimentos.",
  assistant: "Perguntas respondidas com os registros disponíveis.",
  alerts: "Prazos e pendências que merecem acompanhamento.",
  administration: "Usuários, técnicos e setores com controle de acesso.",
  security: "Controle da sua senha de acesso.",
  users: "Usuários e seus perfis de acesso.",
  audit: "Rastreabilidade das alterações e dos acessos.",
};
export function OperationalShell({
  user,
  dark,
  onTheme,
  onLogout,
  onPasswordChanged,
}: {
  user: User;
  dark: boolean;
  onTheme: () => void;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void;
}) {
  const [tab, setTab] = useState("dashboard"),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  const q = useDeferredValue(search),
    lookups = useResource<Lookups>("/lookups");
  const navigate = (id: string) => {
    setTab(id);
    setSearch("");
    setError("");
  };
  const title =
    menu.find((x) => x.id === tab)?.label ||
    {
      security: "Minha senha",
      administration: "Cadastros e acessos",
      audit: "Auditoria",
    }[tab];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <Activity /> PCM <b>INTELLIGENCE</b>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Factory size={21} />
          </span>
          <div>
            {lookups.data?.mode === "demo"
              ? "Unidade demonstrativa"
              : "Manutenção industrial"}
            <small>
              {lookups.data?.mode === "demo"
                ? "Operação com dados fictícios"
                : "Planejamento e controle"}
            </small>
          </div>
        </div>
        <p className="nav-label">MANUTENÇÃO E PLANEJAMENTO</p>
        {menu
          .filter(
            (x) =>
              (x.id !== "third" || user.role !== "TECHNICIAN") &&
              (x.id !== "imports" ||
                ["ADMIN", "MANAGER", "PLANNER"].includes(user.role)),
          )
          .map((x) => (
            <button
              key={x.id}
              className={tab === x.id ? "nav active" : "nav"}
              onClick={() => navigate(x.id)}
            >
              <x.icon size={18} />
              {x.label}
            </button>
          ))}
        <p className="nav-label">CONTA E CONTROLE</p>
        <button
          className={tab === "security" ? "nav active" : "nav"}
          onClick={() => navigate("security")}
        >
          <LockKeyhole size={18} />
          Minha senha
        </button>
        {["ADMIN", "MANAGER", "PLANNER"].includes(user.role) && (
          <button
            className={tab === "administration" ? "nav active" : "nav"}
            onClick={() => navigate("administration")}
          >
            <ShieldCheck size={18} />
            Cadastros e acessos
          </button>
        )}
        {["ADMIN", "MANAGER"].includes(user.role) && (
          <button
            className={tab === "audit" ? "nav active" : "nav"}
            onClick={() => navigate("audit")}
          >
            <Database size={18} />
            Auditoria
          </button>
        )}
        <div className="future">
          <LockKeyhole size={14} />
          Sincronização SAP automática<small>Futura</small>
        </div>
        <div className="aside-bottom">
          <span className="status-dot" />
          {lookups.data?.mode === "demo"
            ? "Demonstração"
            : "Registros locais"}{" "}
          · Sem conexão a máquinas
          <p>PCM Intelligence · v0.4.0</p>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Plataforma / <strong>{title}</strong>
          </span>
          <div>
            <span className="badge">
              {lookups.data?.mode === "demo" ? "DEMONSTRAÇÃO" : "PCM"}
            </span>
            <button
              className="icon"
              aria-label="Alternar tema"
              onClick={onTheme}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span className="user">
              {user.name}
              <small>{user.role}</small>
            </span>
            <button
              className="icon"
              aria-label="Sair"
              onClick={async () => {
                try {
                  await onLogout();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-title">
            <div>
              <span className="eyebrow">PCM INTELLIGENCE / OPERAÇÃO</span>
              <h1>{title}</h1>
              <p>{descriptions[tab]}</p>
            </div>
            {[
              "equipment",
              "interruptions",
              "orders",
              "plans",
              "third",
            ].includes(tab) && (
              <label className="search-box">
                <Search size={17} />
                <input
                  aria-label="Pesquisar no módulo"
                  type="search"
                  placeholder="Pesquisar neste módulo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="notice compact-notice">
            <ShieldCheck size={19} />
            <p>
              {lookups.data?.mode === "demo" ? "Dados fictícios. " : ""}
              Registros locais e cópias de arquivos importados. Alterações aqui
              não atualizam o SAP.
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <State error={lookups.error} loading={lookups.loading} />
          {lookups.data && (
            <Suspense
              fallback={
                <p role="status" className="muted">
                  Carregando módulo…
                </p>
              }
            >
              <div key={tab}>
                {tab === "dashboard" ? (
                  <Dashboard lookups={lookups.data} />
                ) : tab === "equipment" ? (
                  <EquipmentPage
                    user={user}
                    lookups={lookups.data}
                    search={q}
                    onChanged={lookups.refresh}
                  />
                ) : tab === "interruptions" ? (
                  <InterruptionsPage
                    user={user}
                    lookups={lookups.data}
                    search={q}
                  />
                ) : tab === "orders" ? (
                  <OrdersPage user={user} lookups={lookups.data} search={q} />
                ) : tab === "scheduling" ? (
                  <SchedulingPage
                    user={user}
                    lookups={lookups.data}
                    onChanged={lookups.refresh}
                  />
                ) : tab === "plans" ? (
                  <PlansPage user={user} lookups={lookups.data} search={q} />
                ) : tab === "third" ? (
                  <ThirdPartiesPage user={user} search={q} />
                ) : tab === "security" ? (
                  <PasswordForm
                    required={false}
                    onChanged={onPasswordChanged}
                  />
                ) : tab === "imports" ? (
                  <ImportsPage
                    lookups={lookups.data}
                    onChanged={lookups.refresh}
                  />
                ) : tab === "reports" ? (
                  <ReportsPage lookups={lookups.data} />
                ) : tab === "assistant" ? (
                  <AssistantPage />
                ) : tab === "alerts" ? (
                  <AlertsPage />
                ) : tab === "administration" ? (
                  <AdministrationPage user={user} onChanged={lookups.refresh} />
                ) : (
                  <AuditPage />
                )}
              </div>
            </Suspense>
          )}
          <footer>
            PCM Intelligence
            <span>Importações, planejamento e controle com revisão humana</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

const Dashboard = lazy(() =>
  import("../pages/Dashboard").then((module) => ({
    default: module.Dashboard,
  })),
);

const EquipmentPage = lazy(() =>
  import("../pages/Equipment").then((module) => ({
    default: module.EquipmentPage,
  })),
);

const InterruptionsPage = lazy(() =>
  import("../pages/Interruptions").then((module) => ({
    default: module.InterruptionsPage,
  })),
);

const OrdersPage = lazy(() =>
  import("../pages/Orders").then((module) => ({ default: module.OrdersPage })),
);

const PlansPage = lazy(() =>
  import("../pages/Plans").then((module) => ({ default: module.PlansPage })),
);

const ThirdPartiesPage = lazy(() =>
  import("../pages/ThirdParties").then((module) => ({
    default: module.ThirdPartiesPage,
  })),
);

const ImportsPage = lazy(() =>
  import("../pages/Imports").then((m) => ({ default: m.ImportsPage })),
);
const ReportsPage = lazy(() =>
  import("../pages/Reports").then((m) => ({ default: m.ReportsPage })),
);
const AssistantPage = lazy(() =>
  import("../pages/Intelligence").then((m) => ({ default: m.AssistantPage })),
);
const AlertsPage = lazy(() =>
  import("../pages/Intelligence").then((m) => ({ default: m.AlertsPage })),
);
const AdministrationPage = lazy(() =>
  import("../pages/Administration").then((m) => ({
    default: m.AdministrationPage,
  })),
);
const AuditPage = lazy(() =>
  import("../pages/Audit").then((m) => ({ default: m.AuditPage })),
);

const SchedulingPage = lazy(() =>
  import("../pages/Scheduling").then((m) => ({ default: m.SchedulingPage })),
);
