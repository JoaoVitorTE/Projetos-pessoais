import { SapPlanReferences } from "../components/SapRoutine";
import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import {
  Empty,
  EquipmentSelect,
  FleetFilters,
  emptyFleet,
  Modal,
  Pager,
  State,
  TechnicianSelect,
} from "../components/OperationalUI";
import {
  canPlan,
  equipmentCode,
  day,
  fmt,
  localDate,
  query,
  typeLabel,
  type Lookups,
  type Page,
  type Plan,
  type PlanTask,
  type User,
} from "../types/operations";
export function PlansPage({
  user,
  lookups,
  search,
  initialRecordId = "",
  initialOverdue = false,
}: {
  user: User;
  lookups: Lookups;
  search: string;
  initialRecordId?: string;
  initialOverdue?: boolean;
}) {
  const [fleet, setFleet] = useState(emptyFleet),
    [page, setPage] = useState(1),
    [type, setType] = useState(""),
    [overdue, setOverdue] = useState(initialOverdue),
    [view, setView] = useState("list"),
    [month, setMonth] = useState(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [edit, setEdit] = useState<Plan | null | undefined>(),
    [complete, setComplete] = useState<Plan | null>(null),
    [detail, setDetail] = useState(initialRecordId),
    [notice, setNotice] = useState("");
  const start = new Date(month.getFullYear(), month.getMonth(), 1),
    end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  useEffect(() => setPage(1), [search]);
  const data = useResource<Page<Plan>>(
    "/plans?" +
      query({
        ...fleet,
        page: view === "calendar" ? 1 : page,
        limit: view === "calendar" ? 100 : 20,
        type,
        overdue: overdue ? "true" : "",
        q: search,
        ...(view === "calendar"
          ? {
              status: "ACTIVE",
              from: start.toISOString(),
              to: end.toISOString(),
            }
          : {}),
      }),
  );
  const canComplete = (plan: Plan) =>
    plan.active &&
    (canPlan(user) ||
      (user.role === "TECHNICIAN" && user.technicianId === plan.technicianId));
  return (
    <>
      <div className="action-row">
        <p>
          Preventivas e lubrificação. Toda conclusão gera histórico e recalcula
          a próxima data.
        </p>
        <div>
          <button
            className="secondary"
            onClick={() => {
              setView(view === "list" ? "calendar" : "list");
              setOverdue(false);
            }}
          >
            {view === "list" ? "Calendário mensal" : "Lista de planos"}
          </button>
          {canPlan(user) && (
            <button onClick={() => setEdit(null)}>Criar plano</button>
          )}
        </div>
      </div>
      {canPlan(user) && <SapPlanReferences />}
      <div className="filters">
        <FleetFilters
          value={fleet}
          onChange={(v) => {
            setFleet(v);
            setPage(1);
          }}
          lookups={lookups}
        />
        <label>
          Tipo
          <select
            aria-label="Tipo"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="PREVENTIVE">Preventiva</option>
            <option value="LUBRICATION">Lubrificação</option>
          </select>
        </label>
        {view === "list" && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => {
                setOverdue(e.target.checked);
                setPage(1);
              }}
            />
            Somente vencidos
          </label>
        )}
      </div>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <State {...data} />
      {view === "calendar" && (
        <div className="calendar-title">
          <button
            className="secondary"
            aria-label="Mês anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ←
          </button>
          <h2>
            {month.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <button
            className="secondary"
            aria-label="Próximo mês"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            →
          </button>
        </div>
      )}
      {data.data &&
        (view === "calendar" ? (
          <>
            <p className="muted">
              Próximos vencimentos cadastrados; as ocorrências futuras ainda não
              geradas não são inventadas.
            </p>
            <div className="calendar-scroll">
              <div className="calendar">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((x) => (
                  <strong className="weekday" key={x}>
                    {x}
                  </strong>
                ))}
                {Array.from({ length: start.getDay() }, (_, i) => (
                  <div className="calendar-day empty-day" key={"blank" + i} />
                ))}
                {Array.from({ length: end.getDate() }, (_, i) => {
                  const date = i + 1;
                  const plans = data.data!.items.filter(
                    (p) => new Date(p.nextExecution).getDate() === date,
                  );
                  return (
                    <div className="calendar-day" key={date}>
                      <span>{date}</span>
                      {plans.map((p) => (
                        <button
                          key={p.id}
                          className={
                            "calendar-event " +
                            (p.type === "LUBRICATION" ? "lubrication" : "")
                          }
                          onClick={() => setDetail(p.id)}
                          title={p.title}
                        >
                          <b>
                            {equipmentCode(
                              p.equipment ||
                                lookups.equipment.find(
                                  (e) => e.id === p.equipmentId,
                                ),
                            )}
                          </b>
                          {typeLabel[p.type]}
                          <small>{p.technician?.name}</small>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            {data.data.total > 100 && (
              <p className="error">
                Há mais de 100 planos neste mês. Restrinja setor ou equipamento
                para visualizar todos.
              </p>
            )}
          </>
        ) : (
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Plano / equipamento",
                    "Tipo",
                    "Periodicidade",
                    "Técnico",
                    "Próxima execução",
                    "Ações",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <small>
                        {p.id} ·{" "}
                        {equipmentCode(
                          p.equipment ||
                            lookups.equipment.find(
                              (e) => e.id === p.equipmentId,
                            ),
                        )}{" "}
                        · {p.active ? "Ativo" : "Inativo"}
                      </small>
                    </td>
                    <td>{typeLabel[p.type]}</td>
                    <td>{p.intervalDays} dias</td>
                    <td>{p.technician?.name}</td>
                    <td>
                      {fmt(p.nextExecution)}
                      {p.active && new Date(p.nextExecution) < new Date() && (
                        <small className="late">Vencido</small>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="small secondary"
                          onClick={() => setDetail(p.id)}
                          aria-label={"Histórico " + p.id}
                        >
                          Histórico
                        </button>
                        {canPlan(user) && (
                          <button
                            className="small secondary"
                            onClick={() => setEdit(p)}
                            aria-label={"Editar " + p.id}
                          >
                            Editar
                          </button>
                        )}
                        {canComplete(p) && (
                          <button
                            className="small"
                            onClick={() => setComplete(p)}
                            aria-label={"Concluir " + p.id}
                          >
                            Concluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.data.items.length && <Empty />}
            <Pager {...data.data} onChange={setPage} />
          </div>
        ))}
      {edit !== undefined && (
        <PlanForm
          initial={edit}
          lookups={lookups}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setNotice("Plano salvo.");
            data.refresh();
          }}
        />
      )}
      {complete && (
        <CompletePlan
          initial={complete}
          onClose={() => setComplete(null)}
          onSaved={() => {
            setComplete(null);
            setNotice("Execução registrada e próximo vencimento atualizado.");
            data.refresh();
          }}
        />
      )}
      {detail && <PlanDetail id={detail} onClose={() => setDetail("")} />}
    </>
  );
}
function PlanForm({
  initial,
  lookups,
  onClose,
  onSaved,
}: {
  initial: Plan | null;
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      title: initial?.title || "",
      equipmentId: initial?.equipmentId || "",
      technicianId: initial?.technicianId || "",
      type: initial?.type || "PREVENTIVE",
      intervalDays: initial?.intervalDays || 30,
      nextExecution: localDate(initial?.nextExecution),
      active: initial?.active ?? true,
      taskListReference: initial?.taskListReference || "",
      tasks: initial?.tasks || ([] as PlanTask[]),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={initial ? "Editar plano" : "Novo plano"} onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/plans" + (initial ? "/" + initial.id : ""), {
              method: initial ? "PATCH" : "POST",
              body: JSON.stringify({
                ...form,
                nextExecution: new Date(form.nextExecution).toISOString(),
                ...(initial ? { version: initial.version } : {}),
              }),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="span-2">
          Nome do plano
          <input
            aria-label="Nome do plano"
            required
            minLength={3}
            maxLength={160}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <EquipmentSelect
          lookups={lookups}
          value={form.equipmentId}
          onChange={(equipmentId) => setForm({ ...form, equipmentId })}
        />
        <TechnicianSelect
          lookups={lookups}
          value={form.technicianId}
          onChange={(technicianId) => setForm({ ...form, technicianId })}
        />
        <label>
          Tipo
          <select
            aria-label="Tipo"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="PREVENTIVE">Preventiva</option>
            <option value="LUBRICATION">Lubrificação</option>
          </select>
        </label>
        <label>
          Periodicidade em dias
          <input
            aria-label="Periodicidade em dias"
            required
            type="number"
            min={1}
            max={3660}
            value={form.intervalDays}
            onChange={(e) =>
              setForm({ ...form, intervalDays: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Próxima execução
          <input
            aria-label="Próxima execução"
            required
            type="datetime-local"
            value={form.nextExecution}
            onChange={(e) =>
              setForm({ ...form, nextExecution: e.target.value })
            }
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Plano ativo
        </label>
        <label className="span-2">
          Referência da lista de tarefas · opcional
          <input
            aria-label="Referência da lista de tarefas"
            maxLength={120}
            value={form.taskListReference}
            onChange={(e) =>
              setForm({ ...form, taskListReference: e.target.value })
            }
          />
        </label>
        <PlanTasksEditor
          tasks={form.tasks}
          onChange={(tasks) => setForm({ ...form, tasks })}
        />
        <div className="form-bottom">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>{busy ? "Salvando…" : "Salvar plano"}</button>
        </div>
      </form>
    </Modal>
  );
}
function CompletePlan({
  initial,
  onClose,
  onSaved,
}: {
  initial: Plan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(localDate()),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={"Concluir " + initial.title} onClose={onClose}>
      <p>
        Vencimento original: {day(initial.nextExecution)}. O próximo vencimento
        será avançado pela periodicidade até ficar após a execução.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/plans/" + initial.id + "/complete", {
              method: "POST",
              body: JSON.stringify({
                version: initial.version,
                executedAt: new Date(date).toISOString(),
                notes,
              }),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Data da execução
          <input
            aria-label="Data da execução"
            required
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Relato da execução
          <textarea
            aria-label="Relato da execução"
            required
            minLength={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Registrando…" : "Registrar conclusão"}
        </button>
      </form>
    </Modal>
  );
}
function PlanDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useResource<Plan>("/plans/" + id);
  return (
    <Modal title="Histórico do plano" onClose={onClose}>
      <State {...data} />
      {data.data && (
        <>
          <h3>{data.data.title}</h3>
          <p>
            {equipmentCode(data.data.equipment)} · {typeLabel[data.data.type]} ·{" "}
            {data.data.intervalDays} dias
          </p>
          <p>Próxima execução: {fmt(data.data.nextExecution)}</p>
          {data.data.taskListReference && (
            <p>
              Lista de tarefas: <strong>{data.data.taskListReference}</strong>
            </p>
          )}
          {!!data.data.tasks?.length && (
            <section className="plan-tasks-detail">
              <h3>Tarefas planejadas · {data.data.tasks.length}</h3>
              <ol>
                {data.data.tasks.map((task) => (
                  <li key={task.code}>
                    <strong>{task.code}</strong>
                    <span>{task.description}</span>
                    {task.estimatedMinutes && (
                      <small>{task.estimatedMinutes} min estimados</small>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <ol className="timeline">
            {data.data.executions?.map((x) => (
              <li key={x.id}>
                <strong>{fmt(x.executedAt)}</strong>
                <p>
                  Vencimento original: {fmt(x.scheduledFor)} ·{" "}
                  {x.technicianName}
                </p>
                <p>{x.notes}</p>
              </li>
            ))}
          </ol>
          {!data.data.executions?.length && <p>Nenhuma execução registrada.</p>}
        </>
      )}
    </Modal>
  );
}

function PlanTasksEditor({
  tasks,
  onChange,
}: {
  tasks: PlanTask[];
  onChange: (tasks: PlanTask[]) => void;
}) {
  function update(index: number, patch: Partial<PlanTask>) {
    onChange(tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  return (
    <fieldset className="plan-tasks-editor span-2">
      <legend>Lista de tarefas do plano</legend>
      <p>
        Descreva as operações previstas. A importação também pode agrupar várias
        linhas de tarefas no mesmo plano.
      </p>
      {tasks.map((task, index) => (
        <div className="plan-task-fields" key={index}>
          <label>
            Código
            <input
              aria-label={"Código da tarefa " + (index + 1)}
              required
              maxLength={40}
              value={task.code}
              onChange={(e) => update(index, { code: e.target.value })}
            />
          </label>
          <label>
            Descrição
            <input
              aria-label={"Descrição da tarefa " + (index + 1)}
              required
              minLength={3}
              maxLength={1000}
              value={task.description}
              onChange={(e) => update(index, { description: e.target.value })}
            />
          </label>
          <label>
            Minutos · opcional
            <input
              aria-label={"Minutos da tarefa " + (index + 1)}
              type="number"
              min={1}
              max={100000}
              value={task.estimatedMinutes ?? ""}
              onChange={(e) =>
                update(index, {
                  estimatedMinutes: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </label>
          <button
            className="secondary small danger-text"
            type="button"
            aria-label={"Remover tarefa " + (index + 1)}
            onClick={() => onChange(tasks.filter((_, i) => i !== index))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary small"
        disabled={tasks.length >= 200}
        onClick={() =>
          onChange([
            ...tasks,
            {
              code: String((tasks.length + 1) * 10).padStart(4, "0"),
              description: "",
              estimatedMinutes: null,
            },
          ])
        }
      >
        Adicionar tarefa
      </button>
    </fieldset>
  );
}
