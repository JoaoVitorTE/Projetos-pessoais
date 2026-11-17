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
  Handshake,
  Timer,
  Search,
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
  { id: "plans", label: "Preventivas e lubrificação", icon: CalendarDays },
  { id: "third", label: "Serviços de terceiros", icon: Handshake },
];
const descriptions: Record<string, string> = {
  dashboard: "Visão calculada da manutenção e do planejamento.",
  equipment: "Cadastro e situação dos equipamentos industriais.",
  interruptions: "Histórico de paradas e recorrência dos motivos informados.",
  orders: "Ordens locais, execução, prazos e histórico.",
  plans: "Planos de manutenção, calendário e registros de execução.",
  third: "Da solicitação ao tratamento financeiro, com revisão humana.",
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
    { security: "Minha senha", users: "Usuários e perfis", audit: "Auditoria" }[
      tab
    ];
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
            Unidade demonstrativa<small>Operação com dados fictícios</small>
          </div>
        </div>
        <p className="nav-label">MANUTENÇÃO E PLANEJAMENTO</p>
        {menu
          .filter((x) => x.id !== "third" || user.role !== "TECHNICIAN")
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
        {user.role === "ADMIN" && (
          <button
            className={tab === "users" ? "nav active" : "nav"}
            onClick={() => navigate("users")}
          >
            <ShieldCheck size={18} />
            Usuários e perfis
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
        <p className="nav-label">PRÓXIMAS FASES</p>
        {[
          "Assistente PCM e alertas",
          "Importações e ar comprimido",
          "Relatórios PDF / Excel",
        ].map((x) => (
          <div className="future" key={x}>
            <LockKeyhole size={14} />
            {x}
            <small>Futuro</small>
          </div>
        ))}
        <div className="aside-bottom">
          <span className="status-dot" />
          Demonstração · Nenhum sistema industrial conectado
          <p>PCM Intelligence · v0.2.0</p>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            Plataforma / <strong>{title}</strong>
          </span>
          <div>
            <span className="badge">DEMONSTRAÇÃO</span>
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
              Dados fictícios. Ordens e processos são registros locais, sem
              integração com SAP ou SKA.
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
                ) : tab === "plans" ? (
                  <PlansPage user={user} lookups={lookups.data} search={q} />
                ) : tab === "third" ? (
                  <ThirdPartiesPage user={user} search={q} />
                ) : tab === "security" ? (
                  <PasswordForm
                    required={false}
                    onChanged={onPasswordChanged}
                  />
                ) : (
                  <SystemPage tab={tab === "users" ? "users" : "audit"} />
                )}
              </div>
            </Suspense>
          )}
          <footer>
            PCM Intelligence
            <span>Fase 2 · Planejamento e controle com revisão humana</span>
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

const SystemPage = lazy(() =>
  import("../pages/System").then((module) => ({ default: module.SystemPage })),
);
