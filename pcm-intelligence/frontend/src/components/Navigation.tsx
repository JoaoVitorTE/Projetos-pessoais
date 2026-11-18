import { useEffect, useRef, useState } from "react";
import {
  Home,
  LayoutDashboard,
  Factory,
  Timer,
  ClipboardList,
  CalendarClock,
  CalendarDays,
  Handshake,
  FileInput,
  FileBarChart,
  Bot,
  Bell,
  Users,
  History,
  BookOpen,
  KeyRound,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { User } from "../types/operations";
import type { ModuleId, Navigate } from "../types/navigation";
import { roleNames } from "../types/navigation";
import { Brand } from "./Brand";
type Entry = {
  id: ModuleId;
  label: string;
  description: string;
  icon: LucideIcon;
  roles?: string[];
};
export const navigation: { id: string; label: string; items: Entry[] }[] = [
  {
    id: "overview",
    label: "Visão geral",
    items: [
      {
        id: "home",
        label: "Início",
        description: "Alertas, programação e atalhos",
        icon: Home,
      },
      {
        id: "dashboard",
        label: "Dashboard",
        description: "Indicadores e gráficos da operação",
        icon: LayoutDashboard,
      },
      {
        id: "alerts",
        label: "Alertas",
        description: "Prazos e pendências calculadas",
        icon: Bell,
      },
    ],
  },
  {
    id: "operation",
    label: "Operação",
    items: [
      {
        id: "equipment",
        label: "Equipamentos",
        description: "Cadastro e situação das máquinas",
        icon: Factory,
      },
      {
        id: "interruptions",
        label: "Interrupções",
        description: "Paradas e recorrência",
        icon: Timer,
      },
      {
        id: "orders",
        label: "Ordens de serviço",
        description: "Execução, responsáveis e histórico",
        icon: ClipboardList,
      },
      {
        id: "scheduling",
        label: "Agenda inteligente",
        description: "Horários e disponibilidade da equipe",
        icon: CalendarClock,
      },
      {
        id: "plans",
        label: "Preventivas e lubrificação",
        description: "Planos, vencimentos e execuções",
        icon: CalendarDays,
      },
    ],
  },
  {
    id: "management",
    label: "Gestão",
    items: [
      {
        id: "third",
        label: "Serviços de terceiros",
        description: "Etapas e pendências administrativas",
        icon: Handshake,
        roles: ["ADMIN", "MANAGER", "PLANNER", "VIEWER"],
      },
      {
        id: "imports",
        label: "Importar planilhas",
        description: "Prévia, validação e histórico de arquivos",
        icon: FileInput,
        roles: ["ADMIN", "MANAGER", "PLANNER"],
      },
      {
        id: "reports",
        label: "Relatório de preventivas",
        description: "Vencimentos em PDF e Excel",
        icon: FileBarChart,
      },
      {
        id: "administration",
        label: "Cadastros e acessos",
        description: "Setores, técnicos e contas de acesso",
        icon: Users,
        roles: ["ADMIN", "MANAGER", "PLANNER"],
      },
      {
        id: "audit",
        label: "Auditoria",
        description: "Quem fez o quê e quando",
        icon: History,
        roles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "support",
    label: "Suporte",
    items: [
      {
        id: "assistant",
        label: "Assistente PCM",
        description: "Perguntas respondidas pelos registros",
        icon: Bot,
      },
      {
        id: "help",
        label: "Central de ajuda",
        description: "Primeiro acesso e manual de treinamento",
        icon: BookOpen,
      },
      {
        id: "security",
        label: "Minha senha",
        description: "Atualização da senha de acesso",
        icon: KeyRound,
      },
    ],
  },
];
export const allowedEntries = (user: User) =>
  navigation
    .flatMap((g) => g.items)
    .filter((e) => !e.roles || e.roles.includes(user.role));
export function FloatingNavigation({
  user,
  active,
  onNavigate,
  dark,
  onTheme,
  onLogout,
  mode,
  alertCount,
}: {
  user: User;
  active: ModuleId;
  onNavigate: Navigate;
  dark: boolean;
  onTheme: () => void;
  onLogout: () => Promise<void>;
  mode?: string;
  alertCount: number;
}) {
  const [drawer, setDrawer] = useState(false),
    [group, setGroup] = useState(""),
    [account, setAccount] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    root = useRef<HTMLElement>(null),
    groups = navigation.map((g) => ({
      ...g,
      items: g.items.filter((e) => !e.roles || e.roles.includes(user.role)),
    }));
  const activeGroup = groups.find((g) => g.items.some((i) => i.id === active));
  useEffect(() => {
    if (!drawer) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previous;
    };
  }, [drawer]);
  useEffect(() => {
    const click = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setGroup("");
        setAccount(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGroup("");
        setAccount(false);
      }
    };
    document.addEventListener("pointerdown", click);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", click);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const go: Navigate = (id, options) => {
    setDrawer(false);
    setGroup("");
    setAccount(false);
    onNavigate(id, options);
  };
  return (
    <>
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("workspace-main")?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <header className="floating-header" ref={root}>
        <div className="header-leading">
          <button
            className="header-icon hamburger"
            aria-label="Abrir menu de seções"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Menu size={20} />
          </button>
          <button
            className="brand-button"
            aria-label="PCM Intelligence — início"
            onClick={() => go("home")}
          >
            <Brand />
          </button>
        </div>
        <nav className="header-sections" aria-label="Seções principais">
          {groups.map((g) => (
            <div className="section-menu" key={g.id}>
              <button
                className={
                  "section-trigger" +
                  (activeGroup?.id === g.id ? " selected" : "")
                }
                aria-expanded={group === g.id}
                aria-controls={"nav-section-" + g.id}
                onClick={() => {
                  setGroup(group === g.id ? "" : g.id);
                  setAccount(false);
                }}
              >
                {g.label}
                <ChevronDown size={13} />
              </button>
              {group === g.id && (
                <div className="section-dropdown" id={"nav-section-" + g.id}>
                  {g.items.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => go(e.id)}
                      aria-current={active === e.id ? "page" : undefined}
                    >
                      <span className="dropdown-icon">
                        <e.icon size={18} />
                      </span>
                      <span>
                        <b>{e.label}</b>
                        <small>{e.description}</small>
                      </span>
                      {active === e.id && <span className="current-marker" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="header-actions">
          {mode === "demo" && (
            <span className="workspace-mode">Demonstração</span>
          )}
          <button
            className="header-icon notification-button"
            aria-label={
              alertCount
                ? "Abrir alertas: " + alertCount + " pendências"
                : "Abrir alertas"
            }
            onClick={() => go("alerts")}
          >
            <Bell size={18} />
            {alertCount > 0 && (
              <span className="notification-count">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </button>
          <button
            className="header-icon theme-toggle"
            aria-label="Alternar tema"
            onClick={onTheme}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="account-menu">
            <button
              className="account-trigger"
              aria-label="Abrir menu da conta"
              aria-expanded={account}
              onClick={() => {
                setAccount(!account);
                setGroup("");
              }}
            >
              <span className="account-avatar">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="account-name">
                <b>{user.name}</b>
                <small>{roleNames[user.role] || user.role}</small>
              </span>
              <ChevronDown size={13} />
            </button>
            {account && (
              <div className="section-dropdown account-dropdown">
                <div className="account-summary">
                  <b>{user.name}</b>
                  <small>{user.email}</small>
                </div>
                <button onClick={() => go("security")}>
                  <KeyRound size={17} />
                  Minha senha
                </button>
                <button onClick={() => go("help")}>
                  <BookOpen size={17} />
                  Ajuda e treinamento
                </button>
                <button
                  className="logout-action"
                  onClick={async () => {
                    setError("");
                    try {
                      await onLogout();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <LogOut size={17} />
                  Sair da plataforma
                </button>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {drawer && (
        <dialog
          ref={dialog}
          className="navigation-drawer"
          aria-label="Menu de navegação"
          onCancel={(e) => {
            e.preventDefault();
            setDrawer(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawer(false);
          }}
        >
          <div className="drawer-inner">
            <div className="drawer-top">
              <Brand />
              <button
                className="header-icon"
                aria-label="Fechar menu"
                onClick={() => setDrawer(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="drawer-workspace">
              <span className="workspace-status-dot" />
              Planejamento e controle
              <small>
                {mode === "demo"
                  ? "Ambiente com dados fictícios"
                  : "Seu ambiente de manutenção"}
              </small>
            </div>
            <nav aria-label="Navegação completa">
              {groups.map((g) => (
                <section key={g.id}>
                  <h2>{g.label}</h2>
                  {g.items.map((e) => (
                    <button
                      className={
                        "drawer-link" + (active === e.id ? " active" : "")
                      }
                      key={e.id}
                      onClick={() => go(e.id)}
                      aria-current={active === e.id ? "page" : undefined}
                    >
                      <e.icon size={18} />
                      <span>{e.label}</span>
                      {active === e.id && <ArrowUpRight size={14} />}
                    </button>
                  ))}
                </section>
              ))}
            </nav>
            <div className="drawer-footer">
              <small>PCM Intelligence · v0.6</small>
              <span>Planejar com clareza. Executar com controle.</span>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
