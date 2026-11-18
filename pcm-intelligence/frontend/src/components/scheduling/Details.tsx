import { useState } from "react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { Modal, State } from "../OperationalUI";
import { canPlan, type User } from "../../types/operations";
import { dateTime } from "./dates";
import { scheduleLabels, type Assignment } from "./types";
const historyLabels: Record<string, string> = {
  CREATED: "Reserva confirmada",
  RESCHEDULED: "Reserva reprogramada",
  STARTED: "Execução iniciada",
  COMPLETED: "Atividade e manutenção concluídas",
  STAGE_COMPLETED: "Etapa concluída; manutenção continua aberta",
  CANCELLED: "Reserva cancelada",
  BLOCKED: "Reserva bloqueada",
  SCHEDULED: "Reserva liberada",
};
export function AssignmentDetails({
  id,
  user,
  onClose,
  onEdit,
  onChanged,
}: {
  id: string;
  user: User;
  onClose: () => void;
  onEdit: (a: Assignment) => void;
  onChanged: () => void;
}) {
  const data = useResource<Assignment>("/scheduling/assignments/" + id),
    [action, setAction] = useState(""),
    [notes, setNotes] = useState(""),
    [finish, setFinish] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const a = data.data,
    active = a && ["SCHEDULED", "IN_PROGRESS", "BLOCKED"].includes(a.status),
    canExecute =
      a &&
      (canPlan(user) ||
        (user.role === "TECHNICIAN" && a.technicianId === user.technicianId));
  return (
    <Modal title="Detalhes da atividade" onClose={onClose}>
      <State {...data} />
      {a && (
        <>
          <h3>
            {a.reference} · {a.equipmentId}
          </h3>
          <p>{a.title}</p>
          <p>
            <span className={"schedule-status " + a.status.toLowerCase()}>
              {scheduleLabels[a.status]}
            </span>{" "}
            · {a.technician.name}
          </p>
          <p>
            {dateTime(a.startsAt)} → {dateTime(a.endsAt)} · São Paulo
          </p>
          {a.actualStartedAt && (
            <p>Início registrado: {dateTime(a.actualStartedAt)}</p>
          )}
          {a.completedAt && (
            <p>Conclusão registrada: {dateTime(a.completedAt)}</p>
          )}
          {a.blockedReason && (
            <p className="error">
              {a.blockedReason}. Resolva a situação da OS antes de iniciar.
            </p>
          )}
          {a.overdue && (
            <p className="late">
              O término previsto já passou. Atividades ainda não iniciadas
              precisam de reprogramação.
            </p>
          )}
          {a.notes && <p>Observações: {a.notes}</p>}
          <div className="row-actions">
            {active && canPlan(user) && (
              <>
                <button className="secondary small" onClick={() => onEdit(a)}>
                  Reprogramar
                </button>
                <button
                  className="secondary small"
                  onClick={() => {
                    setAction("cancel");
                    setNotes("");
                    setError("");
                  }}
                >
                  Cancelar reserva
                </button>
              </>
            )}
            {canExecute && a.status === "SCHEDULED" && (
              <button
                className="small"
                onClick={() => {
                  setAction("start");
                  setNotes("");
                  setError("");
                }}
              >
                Iniciar atividade
              </button>
            )}
            {canExecute && a.status === "IN_PROGRESS" && (
              <button
                className="small"
                onClick={() => {
                  setAction("complete");
                  setNotes("");
                  setError("");
                }}
              >
                Concluir etapa
              </button>
            )}
          </div>
          {action && (
            <form
              className="schedule-action"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("/scheduling/assignments/" + a.id + "/" + action, {
                    method: "POST",
                    body: JSON.stringify({
                      version: a.version,
                      targetVersion: a.targetVersion,
                      notes,
                      ...(action === "complete"
                        ? { finishTarget: finish }
                        : {}),
                    }),
                  });
                  setAction("");
                  data.refresh();
                  onChanged();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>
                {action === "start"
                  ? "Registrar início"
                  : action === "complete"
                    ? "Registrar conclusão da etapa"
                    : "Cancelar somente a reserva"}
              </h3>
              <label>
                Relato ou justificativa
                <textarea
                  aria-label="Relato da atividade"
                  required
                  minLength={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              {action === "complete" && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={finish}
                      onChange={(e) => setFinish(e.target.checked)}
                    />
                    {a.kind === "ORDER"
                      ? "Também encerrar a OS como concluída"
                      : "Também registrar a execução do plano e avançar o próximo vencimento"}
                  </label>
                  <p className="muted">
                    Sem marcar, somente esta etapa é concluída. Ao encerrar a
                    manutenção, as demais reservas abertas da mesma OS ou
                    vencimento do plano serão canceladas com histórico.
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="row-actions">
                <button disabled={busy}>
                  {busy ? "Registrando…" : "Confirmar apontamento"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setAction("")}
                >
                  Voltar
                </button>
              </div>
            </form>
          )}
          <h3>Histórico da agenda</h3>
          <ol className="timeline">
            {a.history?.map((h) => (
              <li key={h.id}>
                <strong>{historyLabels[h.action] || h.action}</strong>
                <p>
                  {dateTime(h.createdAt)} · {h.user.name}
                </p>
                <p>{h.notes}</p>
                {h.action === "RESCHEDULED" && h.before && (
                  <p className="muted">
                    {dateTime(h.before.startsAt)} → {dateTime(h.after.startsAt)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}
