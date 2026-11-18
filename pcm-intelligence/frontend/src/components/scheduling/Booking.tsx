import { useState } from "react";
import { api } from "../../services/api";
import { Modal } from "../OperationalUI";
import { equipmentCode, type Lookups } from "../../types/operations";
import type { Assignment, Suggestion, Target } from "./types";
import { defaultSlot, inputDate, toIso } from "./dates";
type Check = {
  available: boolean;
  conflicts: { code: string; message: string; id?: string }[];
  warnings: string[];
};
export type BookingChoice = {
  assignment?: Assignment;
  target?: Target;
  proposal?: Suggestion;
  day?: string;
};
export function BookingForm({
  choice,
  targets,
  lookups,
  onClose,
  onSaved,
}: {
  choice: BookingChoice;
  targets: Target[];
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = choice.assignment,
    initial = choice.target || choice.proposal,
    initialTarget = current
      ? {
          kind: current.kind,
          id: current.targetId,
          version: current.targetVersion,
          title: current.title,
          reference: current.reference,
          equipmentId: current.equipmentId,
          equipment: current.equipment,
        }
      : initial;
  const list =
    initialTarget &&
    !targets.some(
      (t) => t.kind === initialTarget.kind && t.id === initialTarget.id,
    )
      ? [initialTarget, ...targets]
      : targets;
  const slot = defaultSlot(choice.day),
    [selected, setSelected] = useState(
      initialTarget ? initialTarget.kind + ":" + initialTarget.id : "",
    ),
    [technicianId, setTechnician] = useState(
      current?.technicianId ||
        choice.proposal?.slot?.technicianId ||
        initial?.technicianId ||
        "",
    ),
    [start, setStart] = useState(
      current
        ? inputDate(current.startsAt)
        : choice.proposal?.slot
          ? inputDate(choice.proposal.slot.startsAt)
          : slot.startsAt,
    ),
    [end, setEnd] = useState(
      current
        ? inputDate(current.endsAt)
        : choice.proposal?.slot
          ? inputDate(choice.proposal.slot.endsAt)
          : slot.endsAt,
    ),
    [notes, setNotes] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [check, setCheck] = useState<Check | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const target = list.find((t) => t.kind + ":" + t.id === selected);
  function changed() {
    setCheck(null);
    setReviewed(false);
    setError("");
  }
  function request() {
    if (!target) throw Error("Selecione uma OS ou plano");
    return {
      kind: target.kind,
      targetId: target.id,
      targetVersion: target.version,
      technicianId,
      startsAt: toIso(start),
      endsAt: toIso(end),
    };
  }
  return (
    <Modal
      title={current ? "Reprogramar reserva" : "Revisar e reservar atividade"}
      onClose={onClose}
    >
      <p>
        Horários em São Paulo. Reservas dependem das jornadas cadastradas.
        Confirme a qualificação do técnico e a disponibilidade de peças ou
        terceiros.
      </p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              "/scheduling/assignments" + (current ? "/" + current.id : ""),
              {
                method: current ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...request(),
                  notes,
                  reviewConfirmed: reviewed,
                  ...(current ? { version: current.version } : {}),
                }),
              },
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="span-2">
          OS ou plano
          <select
            aria-label="Atividade a reservar"
            required
            disabled={!!current}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              changed();
            }}
          >
            <option value="">Selecione uma atividade cadastrada</option>
            {list.map((t) => (
              <option key={t.kind + ":" + t.id} value={t.kind + ":" + t.id}>
                {t.kind === "ORDER" ? "OS" : "Plano"} · {t.reference} ·{" "}
                {equipmentCode(t.equipment)} · {t.title.slice(0, 65)}
              </option>
            ))}
          </select>
        </label>
        {!list.length && (
          <p className="span-2 muted">
            Cadastre uma OS ou plano ativo antes de reservar um horário.
          </p>
        )}
        <label>
          Técnico da atividade
          <select
            aria-label="Técnico da atividade"
            required
            disabled={current?.status === "IN_PROGRESS"}
            value={technicianId}
            onChange={(e) => {
              setTechnician(e.target.value);
              changed();
            }}
          >
            <option value="">Selecione</option>
            {lookups.technicians
              .filter((t) => t.active || t.id === technicianId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.specialty}
                  {!t.active ? " (inativo)" : ""}
                </option>
              ))}
          </select>
        </label>
        <label>
          Início reservado
          <input
            aria-label="Início reservado"
            type="datetime-local"
            required
            disabled={current?.status === "IN_PROGRESS"}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          Término reservado
          <input
            aria-label="Término reservado"
            type="datetime-local"
            required
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              changed();
            }}
          />
        </label>
        <div className="span-2">
          <button
            className="secondary schedule-verify"
            type="button"
            disabled={busy || !target || !technicianId || !start || !end}
            onClick={async () => {
              setBusy(true);
              setError("");
              setCheck(null);
              try {
                setCheck(
                  await api("/scheduling/check", {
                    method: "POST",
                    body: JSON.stringify({
                      ...request(),
                      ...(current ? { excludeId: current.id } : {}),
                    }),
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Verificar disponibilidade
          </button>
          {check && (
            <div
              className={check.available ? "success" : "error"}
              role="status"
            >
              <p>
                {check.available
                  ? "Horário disponível conforme os registros atuais."
                  : "Há impedimentos para esta reserva."}
              </p>
              {check.conflicts.map((c, i) => (
                <p key={c.code + i}>
                  {c.message}
                  {c.id ? " · " + c.id : ""}
                </p>
              ))}
              {check.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
        </div>
        <label className="span-2">
          Justificativa da programação
          <textarea
            aria-label="Justificativa da programação"
            required
            minLength={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="check-label span-2">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          Revisei a qualificação do técnico e as dependências de peças ou
          terceiros. Confirmei também sua disponibilidade atual.
        </label>
        <div className="form-bottom">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small>
            O sistema verificará novamente os conflitos ao confirmar. Nenhuma
            alteração será enviada ao SAP.
          </small>
          <button disabled={busy || !reviewed || !check?.available}>
            {busy ? "Salvando…" : "Confirmar reserva"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
