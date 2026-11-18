import { useState } from "react";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import { Empty, State } from "../components/OperationalUI";
import {
  query,
  canPlan,
  typeLabel,
  statusLabel,
  priorities,
  type Lookups,
  type User,
} from "../types/operations";
import {
  BookingForm,
  type BookingChoice,
} from "../components/scheduling/Booking";
import { AssignmentDetails } from "../components/scheduling/Details";
import { ScheduleConfiguration } from "../components/scheduling/Configuration";
import {
  calendarRange,
  clock,
  dateLabel,
  dateTime,
  moveAnchor,
  plusDays,
  today,
  toIso,
  ZONE,
} from "../components/scheduling/dates";
import {
  scheduleLabels,
  type Overview,
  type Target,
  type Suggestion,
  type Assignment,
} from "../components/scheduling/types";
type Proposals = {
  generatedAt: string;
  items: Suggestion[];
  method: string;
  note: string;
};
export function SchedulingPage({
  user,
  lookups,
  onChanged,
}: {
  user: User;
  lookups: Lookups;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState("calendar"),
    [view, setView] = useState<"week" | "month">("week"),
    [anchor, setAnchor] = useState(today()),
    [technicianId, setTech] = useState(""),
    [sectorId, setSector] = useState(""),
    [equipmentId, setEquipment] = useState(""),
    [status, setStatus] = useState(""),
    [choice, setChoice] = useState<BookingChoice | null>(null),
    [detail, setDetail] = useState(""),
    [duration, setDuration] = useState(60),
    [proposals, setProposals] = useState<Proposals | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const period = calendarRange(anchor, view),
    params = query({
      from: period.from,
      to: period.to,
      technicianId,
      equipmentId,
      sectorId,
      status: tab === "calendar" ? status : "",
    }),
    data = useResource<Overview>("/scheduling?" + params),
    targets = useResource<{ items: Target[] }>(
      "/scheduling/targets?" +
        query({ from: period.from, to: period.to, equipmentId, sectorId }),
    );
  function changed() {
    data.refresh();
    targets.refresh();
    setProposals(null);
    onChanged();
  }
  function changeFilter(fn: () => void) {
    fn();
    setProposals(null);
    setError("");
  }
  function viewDay(day: string) {
    const begin = toIso(day + "T00:00"),
      end = toIso(plusDays(day, 1) + "T00:00");
    return (
      data.data?.items.filter((a) => a.startsAt < end && a.endsAt > begin) || []
    );
  }
  const canWrite = canPlan(user),
    weekNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  return (
    <>
      <div className="action-row">
        <p>
          OS e planos só ocupam horários após uma reserva confirmada.
          Vencimentos e datas importadas continuam disponíveis nos seus módulos.
        </p>
        {canWrite && (
          <button onClick={() => setChoice({ day: period.start })}>
            Reservar atividade
          </button>
        )}
      </div>
      <div className="tabs schedule-tabs">
        {[
          ["calendar", "Calendário"],
          ...(canWrite
            ? [
                ["backlog", "Pendências e sugestões"],
                ["windows", "Jornadas"],
                ["absences", "Indisponibilidades"],
              ]
            : []),
        ].map(([id, label]) => (
          <button
            className={tab === id ? "" : "secondary"}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {["windows", "absences"].includes(tab) ? (
        <ScheduleConfiguration
          kind={tab as "windows" | "absences"}
          lookups={lookups}
          onChanged={changed}
        />
      ) : (
        <>
          <div className="schedule-toolbar">
            <div className="row-actions">
              <button
                className="secondary small"
                aria-label="Período anterior"
                onClick={() =>
                  changeFilter(() => setAnchor(moveAnchor(anchor, view, -1)))
                }
              >
                ←
              </button>
              <button
                className="secondary small"
                onClick={() => changeFilter(() => setAnchor(today()))}
              >
                Hoje
              </button>
              <button
                className="secondary small"
                aria-label="Próximo período"
                onClick={() =>
                  changeFilter(() => setAnchor(moveAnchor(anchor, view, 1)))
                }
              >
                →
              </button>
            </div>
            <strong>
              {view === "month"
                ? new Intl.DateTimeFormat("pt-BR", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(anchor + "T12:00Z"))
                : dateLabel(period.start) +
                  "/" +
                  period.start.slice(0, 4) +
                  " a " +
                  dateLabel(plusDays(period.end, -1)) +
                  "/" +
                  plusDays(period.end, -1).slice(0, 4)}
            </strong>
            <div className="row-actions">
              <button
                className={view === "week" ? "small" : "small secondary"}
                onClick={() => changeFilter(() => setView("week"))}
              >
                Semanal
              </button>
              <button
                className={view === "month" ? "small" : "small secondary"}
                onClick={() => changeFilter(() => setView("month"))}
              >
                Mensal
              </button>
            </div>
          </div>
          <div className="filters">
            <label>
              {tab === "backlog" ? "Técnico para sugestões" : "Técnico"}
              <select
                aria-label="Técnico da agenda"
                value={technicianId}
                onChange={(e) => changeFilter(() => setTech(e.target.value))}
              >
                <option value="">Todos</option>
                {lookups.technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Setor
              <select
                aria-label="Setor da agenda"
                value={sectorId}
                onChange={(e) =>
                  changeFilter(() => {
                    setSector(e.target.value);
                    setEquipment("");
                  })
                }
              >
                <option value="">Todos</option>
                {lookups.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Equipamento
              <select
                aria-label="Equipamento da agenda"
                value={equipmentId}
                onChange={(e) =>
                  changeFilter(() => setEquipment(e.target.value))
                }
              >
                <option value="">Todos</option>
                {lookups.equipment
                  .filter((e) => !sectorId || e.sectorId === sectorId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} · {e.name}
                    </option>
                  ))}
              </select>
            </label>
            {tab === "calendar" && (
              <label>
                Situação
                <select
                  aria-label="Situação da agenda"
                  value={status}
                  onChange={(e) =>
                    changeFilter(() => setStatus(e.target.value))
                  }
                >
                  <option value="">Todas</option>
                  {Object.entries(scheduleLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="secondary" onClick={changed}>
              Atualizar
            </button>
          </div>
          <p className="muted">
            Horas livres consideram somente o tempo ainda disponível a partir de
            agora. Todos os horários em São Paulo ({ZONE}). Jornadas e ausências
            são definidas pelo PCM.
          </p>
          <State
            loading={data.loading || targets.loading}
            error={error || data.error || targets.error}
          />
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {data.data && (
            <>
              {tab === "calendar" ? (
                <>
                  <div className="schedule-kpis">
                    {[
                      ["Reservas no período", data.data.summary.total],
                      ["Em execução", data.data.summary.inProgress],
                      ["Bloqueadas", data.data.summary.blocked],
                      ["Término ultrapassado", data.data.summary.overdue],
                    ].map(([label, value]) => (
                      <article className="panel" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </article>
                    ))}
                  </div>
                  <div className="panel schedule-calendar-wrap">
                    <div className={"schedule-calendar " + view}>
                      {weekNames.map((n) => (
                        <div className="schedule-weekday" key={n}>
                          {n}
                        </div>
                      ))}
                      {period.days.map((day, i) => (
                        <div
                          className={
                            "schedule-day " +
                            (day === today() ? "is-today" : "") +
                            (view === "month" &&
                            day.slice(0, 7) !== anchor.slice(0, 7)
                              ? " other-month"
                              : "")
                          }
                          key={day}
                        >
                          <div className="schedule-day-top">
                            <strong>{dateLabel(day)}</strong>
                            {canWrite && day >= today() && (
                              <button
                                className="icon"
                                aria-label={"Reservar em " + day}
                                onClick={() => setChoice({ day })}
                              >
                                +
                              </button>
                            )}
                          </div>
                          {viewDay(day).map((a) => (
                            <button
                              className={
                                "schedule-event " + a.status.toLowerCase()
                              }
                              key={a.id}
                              onClick={() => setDetail(a.id)}
                              aria-label={"Abrir atividade " + a.id}
                            >
                              <span>
                                {clock(a.startsAt)}–{clock(a.endsAt)}
                              </span>
                              <b>{a.equipmentId}</b>
                              <span>
                                {a.kind === "ORDER" ? "OS" : "Plano"} ·{" "}
                                {a.reference}
                              </span>
                              <small>
                                {typeLabel[a.type]} · {a.technician.name}
                              </small>
                              <small>
                                {scheduleLabels[a.status]}
                                {a.overdue ? " · Prazo ultrapassado" : ""}
                              </small>
                            </button>
                          ))}
                          {!viewDay(day).length && (
                            <span className="schedule-empty">Sem reservas</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {!data.data.items.length && (
                    <p className="empty-state">
                      Nenhuma reserva confirmada neste período.
                    </p>
                  )}
                  <section className="panel import-section">
                    <h2>Disponibilidade da equipe</h2>
                    <p>{data.data.note}</p>
                    <div className="capacity-grid">
                      {data.data.capacity.map((t) => (
                        <article key={t.id}>
                          <strong>{t.name}</strong>
                          <small>{t.specialty}</small>
                          {!t.active ? (
                            <span>Cadastro inativo</span>
                          ) : !t.configured ? (
                            <span>Jornada ainda não configurada</span>
                          ) : (
                            <>
                              <b>
                                {(t.freeMinutes / 60).toLocaleString("pt-BR", {
                                  maximumFractionDigits: 1,
                                })}{" "}
                                h livres
                              </b>
                              <small>
                                {(t.capacityMinutes / 60).toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 1 },
                                )}{" "}
                                h de capacidade ·{" "}
                                {(t.bookedMinutes / 60).toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 1 },
                                )}{" "}
                                h reservadas
                              </small>
                            </>
                          )}
                        </article>
                      ))}
                    </div>
                    {!data.data.capacity.length && (
                      <p className="muted">
                        Cadastre os técnicos em Cadastros e acessos e configure
                        suas jornadas.
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="panel import-section">
                    <div className="action-row">
                      <div>
                        <h2>Propostas para revisão</h2>
                        <p>
                          Classificação por regras calculadas. Nenhuma reserva
                          será criada automaticamente.
                        </p>
                      </div>
                      <div className="row-actions">
                        <label>
                          Duração de cada etapa (min)
                          <input
                            aria-label="Duração das sugestões"
                            type="number"
                            min={5}
                            max={1440}
                            value={duration}
                            onChange={(e) => {
                              setDuration(Number(e.target.value));
                              setProposals(null);
                            }}
                          />
                        </label>
                        <button
                          disabled={busy || duration < 5 || duration > 1440}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              setProposals(
                                await api(
                                  "/scheduling/suggestions?" +
                                    params +
                                    "&durationMinutes=" +
                                    duration,
                                ),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {busy ? "Calculando…" : "Gerar sugestões"}
                        </button>
                      </div>
                    </div>
                    {proposals && (
                      <>
                        <p className="muted">
                          Calculado em {dateTime(proposals.generatedAt)}.{" "}
                          {proposals.method}
                        </p>
                        <p>{proposals.note}</p>
                        {!proposals.items.length && <Empty />}
                        <div className="proposal-grid">
                          {proposals.items.map((p) => (
                            <article
                              className="schedule-proposal"
                              key={p.kind + p.id}
                            >
                              <div className="action-row">
                                <strong>
                                  {p.reference} · {p.equipmentId}
                                </strong>
                                <span className="score">{p.score} pontos</span>
                              </div>
                              <p>{p.title}</p>
                              <p>{p.reason}</p>
                              <details>
                                <summary>
                                  Ver dados que sustentam a prioridade
                                </summary>
                                <p>
                                  Criticidade {p.evidence.criticality};
                                  prioridade{" "}
                                  {p.evidence.priority
                                    ? priorities[p.evidence.priority]
                                    : "não definida para plano"}
                                  ; {p.evidence.daysLate} dias de atraso.
                                </p>
                                <p>
                                  {p.evidence.interruptionCount} interrupções e{" "}
                                  {p.evidence.downtimeMinutes} minutos de parada
                                  entre {dateTime(p.evidence.historyFrom)} e{" "}
                                  {dateTime(p.evidence.historyTo)}.
                                </p>
                              </details>
                              {p.slot && (
                                <>
                                  <p>
                                    <b>{p.slot.technicianName}</b> ·{" "}
                                    {p.slot.specialty}
                                    <br />
                                    {dateTime(p.slot.startsAt)} →{" "}
                                    {dateTime(p.slot.endsAt)}
                                  </p>
                                  <button
                                    className="small"
                                    onClick={() => setChoice({ proposal: p })}
                                  >
                                    Revisar proposta
                                  </button>
                                </>
                              )}
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                  <section className="panel table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Atividade / equipamento",
                            "Tipo",
                            "Responsável atual",
                            "Vencimento / programação",
                            "Situação",
                            "Reservas",
                            "Ação",
                          ].map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {targets.data?.items.map((t) => (
                          <tr key={t.kind + t.id}>
                            <td>
                              <b>
                                {t.reference} · {t.equipmentId}
                              </b>
                              <small>{t.title}</small>
                            </td>
                            <td>{typeLabel[t.type]}</td>
                            <td>{t.technician || "Não atribuído"}</td>
                            <td>
                              {t.dueAt
                                ? dateTime(t.dueAt)
                                : "Sem data informada"}
                            </td>
                            <td>
                              {statusLabel[t.status] ||
                                { OVERDUE: "Vencido", PLANNED: "Previsto" }[
                                  t.status
                                ] ||
                                t.status}
                            </td>
                            <td>{t.reservationCount}</td>
                            <td>
                              {t.blocked ? (
                                <span className="late">
                                  Resolva a dependência na OS
                                </span>
                              ) : (
                                <button
                                  className="small secondary"
                                  aria-label={"Reservar " + t.id}
                                  onClick={() => setChoice({ target: t })}
                                >
                                  {t.reservationCount
                                    ? "Adicionar etapa"
                                    : "Reservar"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!targets.data?.items.length && <Empty />}
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
      {choice && (
        <BookingForm
          choice={choice}
          targets={targets.data?.items || []}
          lookups={lookups}
          onClose={() => setChoice(null)}
          onSaved={() => {
            setChoice(null);
            setNotice(
              "Reserva confirmada com verificação de disponibilidade e histórico.",
            );
            changed();
          }}
        />
      )}
      {detail && (
        <AssignmentDetails
          id={detail}
          user={user}
          onClose={() => setDetail("")}
          onEdit={(a) => {
            setDetail("");
            setChoice({ assignment: a });
          }}
          onChanged={changed}
        />
      )}
    </>
  );
}
