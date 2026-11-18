import {
  ArrowUpRight,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CalendarClock,
  ClipboardList,
  CalendarDays,
  Factory,
  Users,
  Plus,
  BookOpen,
  RefreshCw,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { State } from "../components/OperationalUI";
import type { User } from "../types/operations";
import type { Navigate, ModuleId } from "../types/navigation";
import { allowedEntries } from "../components/Navigation";
import { dateTime, clock } from "../components/scheduling/dates";
export type HomeData = {
  asOf: string;
  mode: string;
  counts: {
    equipment: number;
    openOrders: number;
    overdueOrders: number;
    overduePlans: number;
    upcomingPlans: number;
    thirdPartyOpen: number | null;
    stalledServices: number;
    scheduleAttention: number;
    todayReservations: number;
    alerts: number;
  };
  alerts: {
    id: string;
    level: string;
    title: string;
    description: string;
    dueAt: string;
    module: ModuleId;
    recordId: string;
    overdue: boolean;
  }[];
  today: {
    id: string;
    reference: string;
    title: string;
    equipmentId: string;
    technician: string;
    startsAt: string;
    endsAt: string;
    status: string;
  }[];
  upcoming: {
    id: string;
    title: string;
    equipmentId: string;
    nextExecution: string;
    type: string;
  }[];
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    createdAt: string;
    user: { name: string } | null;
  }[];
  setup: {
    sectors: number;
    equipment: number;
    technicians: number;
    configuredTechnicians: number;
    users: number | null;
  } | null;
};
export function HomePage({
  user,
  data,
  error,
  loading,
  onRefresh,
  onNavigate,
  onTutorial,
}: {
  user: User;
  data: HomeData | null;
  error: string;
  loading: boolean;
  onRefresh: () => void;
  onNavigate: Navigate;
  onTutorial: () => void;
}) {
  const allowed = new Set(allowedEntries(user).map((e) => e.id));
  const shortcuts = allowedEntries(user).filter((e) =>
    [
      "orders",
      "scheduling",
      "plans",
      "equipment",
      "interruptions",
      "third",
      "reports",
      "administration",
    ].includes(e.id),
  );
  const setup = data?.setup;
  const steps = setup
    ? [
        {
          title: "Criar setores",
          description: "Organize as áreas da operação",
          done: setup.sectors > 0,
          module: "administration" as ModuleId,
          options: { adminTab: "sectors" as const },
        },
        {
          title: "Cadastrar equipamentos",
          description: "Associe cada máquina ao seu setor",
          done: setup.equipment > 0,
          module: "equipment" as ModuleId,
          options: {},
        },
        {
          title: "Preparar a equipe",
          description: "Cadastre quem executa as atividades",
          done: setup.technicians > 0,
          module: "administration" as ModuleId,
          options: { adminTab: "technicians" as const },
        },
        {
          title: "Definir jornadas",
          description: "Informe os horários dos técnicos",
          done:
            setup.technicians > 0 &&
            setup.configuredTechnicians >= setup.technicians,
          module: "scheduling" as ModuleId,
          options: {},
        },
      ]
    : [];
  const pending = steps.filter((s) => !s.done),
    alertIcons = { critical: AlertTriangle, warning: Clock3 };
  return (
    <>
      <div className="home-intro">
        <div>
          <span className="section-kicker">SEU PANORAMA DE HOJE</span>
          <h2>Planeje o próximo passo.</h2>
          <p>
            Veja o que precisa de atenção e acesse sua rotina pelos atalhos.
          </p>
        </div>
        <div className="home-refresh">
          <span>
            {data
              ? "Atualizado em " + dateTime(data.asOf)
              : "Carregando informações"}
          </span>
          <button
            className="secondary small"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Atualizar
          </button>
        </div>
      </div>
      <State error={error} loading={loading} />
      {data && (
        <>
          <div className="home-metrics">
            {[
              {
                label: "Ordens em aberto",
                value: data.counts.openOrders,
                detail: data.counts.overdueOrders + " com prazo vencido",
                icon: ClipboardList,
                module: "orders" as ModuleId,
                tone: "blue",
              },
              {
                label: "Pendências de atenção",
                value: data.counts.alerts,
                detail: "Prazos, bloqueios e processos",
                icon: AlertTriangle,
                module: "alerts" as ModuleId,
                tone: data.counts.alerts ? "amber" : "teal",
              },
              {
                label: "Reservas abertas hoje",
                value: data.counts.todayReservations,
                detail: "Programação confirmada na agenda",
                icon: CalendarClock,
                module: "scheduling" as ModuleId,
                tone: "teal",
              },
              {
                label: "Planos nos próximos 7 dias",
                value: data.counts.upcomingPlans,
                detail: data.counts.overduePlans + " planos vencidos",
                icon: CalendarDays,
                module: "plans" as ModuleId,
                tone: "violet",
              },
            ].map((k) => (
              <button
                className={"home-metric " + k.tone}
                key={k.label}
                onClick={() => onNavigate(k.module)}
                aria-label={"Abrir " + k.label.toLowerCase()}
              >
                <span className="metric-top">
                  <span className="metric-icon">
                    <k.icon size={21} />
                  </span>
                  <ArrowUpRight size={16} />
                </span>
                <b>{k.value}</b>
                <strong>{k.label}</strong>
                <small>{k.detail}</small>
              </button>
            ))}
          </div>
          {pending.length > 0 && (
            <section className="setup-banner">
              <div className="setup-heading">
                <span className="setup-symbol">
                  <Plus size={21} />
                </span>
                <div>
                  <h2>Prepare sua operação</h2>
                  <p>
                    {steps.length - pending.length} de {steps.length} etapas
                    preparadas. Os cadastros aparecem aqui conforme são
                    concluídos.
                  </p>
                </div>
                <button className="secondary small" onClick={onTutorial}>
                  <BookOpen size={15} />
                  Ver tutorial
                </button>
              </div>
              <div className="setup-steps">
                {steps.map((s, i) => (
                  <button
                    className={s.done ? "done" : ""}
                    key={s.title}
                    onClick={() => onNavigate(s.module, s.options)}
                  >
                    <span>{s.done ? <CheckCircle2 size={17} /> : i + 1}</span>
                    <strong>{s.title}</strong>
                    <small>{s.description}</small>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="home-shortcuts-section">
            <div className="block-heading">
              <div>
                <span className="section-kicker">ACESSO RÁPIDO</span>
                <h2>Sua rotina, a um clique</h2>
              </div>
              <span className="muted">
                {data.counts.equipment} equipamentos cadastrados
              </span>
            </div>
            <div className="home-shortcuts">
              {shortcuts.map((e) => (
                <button
                  key={e.id}
                  className="shortcut-card"
                  onClick={() => onNavigate(e.id)}
                  aria-label={"Acessar " + e.label.toLowerCase()}
                >
                  <span>
                    <e.icon size={22} />
                  </span>
                  <strong>{e.label}</strong>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </section>
          <div className="home-columns">
            <section className="panel home-attention">
              <div className="block-heading">
                <div>
                  <span className="section-kicker">PRIORIDADES</span>
                  <h2>Precisa de atenção</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => onNavigate("alerts")}
                >
                  Ver alertas
                  <ArrowRight size={14} />
                </button>
              </div>
              {!data.alerts.length ? (
                <div className="home-empty positive">
                  <CheckCircle2 size={30} />
                  <h3>Nenhuma pendência identificada</h3>
                  <p>
                    Os registros disponíveis não apresentam os atrasos ou
                    bloqueios acompanhados por este painel.
                  </p>
                </div>
              ) : (
                <div className="attention-list">
                  {data.alerts.map((a) => {
                    const Icon =
                      alertIcons[a.level as keyof typeof alertIcons] ||
                      AlertTriangle;
                    return (
                      <button
                        key={a.id}
                        className={"attention-item " + a.level}
                        onClick={() =>
                          onNavigate(a.module, {
                            recordId: a.recordId,
                            overdue: a.overdue,
                          })
                        }
                      >
                        <span className="attention-icon">
                          <Icon size={19} />
                        </span>
                        <span>
                          <b>{a.title}</b>
                          <small>{a.description}</small>
                          <em>{dateTime(a.dueAt)}</em>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    );
                  })}
                  {data.counts.alerts > data.alerts.length && (
                    <p className="muted">
                      Exibindo {data.alerts.length} de {data.counts.alerts}{" "}
                      registros com pendências. Consulte as áreas para
                      acompanhar todos.
                    </p>
                  )}
                </div>
              )}
            </section>
            <section className="panel home-today">
              <div className="block-heading">
                <div>
                  <span className="section-kicker">PROGRAMAÇÃO</span>
                  <h2>Agenda de hoje</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => onNavigate("scheduling")}
                >
                  Abrir agenda
                  <ArrowRight size={14} />
                </button>
              </div>
              {!data.today.length ? (
                <div className="home-empty">
                  <CalendarClock size={31} />
                  <h3>Sem reservas abertas hoje</h3>
                  <p>
                    Atividades confirmadas na agenda aparecerão aqui com seus
                    horários e responsáveis.
                  </p>
                  {allowed.has("scheduling") && (
                    <button
                      className="secondary small"
                      onClick={() => onNavigate("scheduling")}
                    >
                      Acessar programação
                    </button>
                  )}
                </div>
              ) : (
                <div className="today-list">
                  {data.today.map((a) => (
                    <button
                      key={a.id}
                      onClick={() =>
                        onNavigate("scheduling", { recordId: a.id })
                      }
                    >
                      <span className="today-time">
                        {clock(a.startsAt)}
                        <small>{clock(a.endsAt)}</small>
                      </span>
                      <span>
                        <b>
                          {a.equipmentId} · {a.reference}
                        </b>
                        <small>{a.title}</small>
                        <em>{a.technician}</em>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="home-columns home-bottom">
            <section className="panel home-upcoming">
              <div className="block-heading">
                <div>
                  <span className="section-kicker">PRÓXIMOS VENCIMENTOS</span>
                  <h2>Preventivas e lubrificação</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => onNavigate("reports")}
                >
                  Relatório
                  <ArrowRight size={14} />
                </button>
              </div>
              {!data.upcoming.length ? (
                <p className="soft-empty">
                  Nenhum plano ativo vence nos próximos sete dias.
                </p>
              ) : (
                data.upcoming.map((p) => (
                  <button
                    className="upcoming-item"
                    key={p.id}
                    onClick={() => onNavigate("plans", { recordId: p.id })}
                  >
                    <span className="upcoming-symbol">
                      <CalendarDays size={18} />
                    </span>
                    <span>
                      <b>{p.title}</b>
                      <small>{p.equipmentId}</small>
                    </span>
                    <em>{dateTime(p.nextExecution)}</em>
                    <ArrowUpRight size={14} />
                  </button>
                ))
              )}
            </section>
            <section className="home-help-card">
              <span className="home-help-icon">
                <BookOpen size={24} />
              </span>
              <span className="section-kicker">APRENDA NO SEU RITMO</span>
              <h2>Uma equipe bem orientada começa pelo primeiro acesso.</h2>
              <p>
                Reveja o passo a passo ou compartilhe o manual de treinamento em
                PDF.
              </p>
              <div className="row-actions">
                <button onClick={onTutorial}>
                  Ver tutorial
                  <ArrowRight size={15} />
                </button>
                <button
                  className="secondary"
                  onClick={() => onNavigate("help")}
                >
                  Central de ajuda
                </button>
              </div>
            </section>
          </div>
          {data.mode === "demo" && (
            <p className="demo-footnote">
              <ShieldCheck size={15} />
              Este ambiente utiliza dados fictícios para demonstração.
            </p>
          )}
        </>
      )}
    </>
  );
}
