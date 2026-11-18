import { useState } from "react";
import { useResource } from "../../hooks/useResource";
import { api } from "../../services/api";
import { Modal, State, Empty } from "../OperationalUI";
import type { Lookups } from "../../types/operations";
import type { Absence, WorkWindow } from "./types";
import {
  dateTime,
  defaultSlot,
  inputDate,
  inputMinute,
  minuteInput,
  toIso,
  weekdays,
} from "./dates";
export function ScheduleConfiguration({
  kind,
  lookups,
  onChanged,
}: {
  kind: "windows" | "absences";
  lookups: Lookups;
  onChanged: () => void;
}) {
  const [tech, setTech] = useState(""),
    [edit, setEdit] = useState<WorkWindow | Absence | null | undefined>(),
    [error, setError] = useState("");
  const path =
      kind === "windows" ? "/scheduling/work-windows" : "/scheduling/absences",
    data = useResource<(WorkWindow | Absence)[]>(
      path + (tech ? "?technicianId=" + encodeURIComponent(tech) : ""),
    );
  return (
    <>
      <div className="action-row">
        <p>
          {kind === "windows"
            ? "Configure cada janela semanal de trabalho. Cadastre intervalos separados para pausas e turnos que atravessam a meia-noite. Não existe jornada presumida."
            : "Registre ausências, treinamentos e outras indisponibilidades. Reservas conflitantes precisam ser reprogramadas antes."}
        </p>
        <button onClick={() => setEdit(null)}>
          {kind === "windows"
            ? "Adicionar jornada"
            : "Registrar indisponibilidade"}
        </button>
      </div>
      <div className="filters">
        <label>
          Técnico
          <select
            aria-label="Técnico da configuração"
            value={tech}
            onChange={(e) => setTech(e.target.value)}
          >
            <option value="">Todos</option>
            {lookups.technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={data.refresh}>
          Atualizar
        </button>
      </div>
      <State loading={data.loading} error={error || data.error} />
      {data.data && (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Técnico</th>
                <th>
                  {kind === "windows"
                    ? "Dia / horário em São Paulo"
                    : "Período em São Paulo"}
                </th>
                {kind === "absences" && <th>Descrição</th>}
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row) => (
                <tr key={row.id}>
                  <td>
                    {lookups.technicians.find((t) => t.id === row.technicianId)
                      ?.name || row.technicianId}
                  </td>
                  <td>
                    {"weekday" in row
                      ? weekdays[row.weekday] +
                        " · " +
                        minuteInput(row.startMinute) +
                        " às " +
                        minuteInput(row.endMinute)
                      : dateTime(row.startsAt) + " → " + dateTime(row.endsAt)}
                  </td>
                  {"reason" in row && <td>{row.reason}</td>}
                  <td>{row.active ? "Ativa" : "Inativa"}</td>
                  <td>
                    <button
                      className="secondary small"
                      onClick={() => {
                        setError("");
                        setEdit(row);
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data.length && <Empty />}
        </section>
      )}
      {edit !== undefined && (
        <ConfigurationForm
          key={edit?.id || kind}
          kind={kind}
          lookups={lookups}
          initial={edit}
          technicianId={tech}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            data.refresh();
            onChanged();
          }}
        />
      )}
    </>
  );
}
function ConfigurationForm({
  kind,
  lookups,
  initial,
  technicianId,
  onClose,
  onSaved,
}: {
  kind: "windows" | "absences";
  lookups: Lookups;
  initial: WorkWindow | Absence | null;
  technicianId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const slot = defaultSlot();
  const [form, setForm] = useState({
      technicianId: initial?.technicianId || technicianId,
      weekday: initial && "weekday" in initial ? initial.weekday : 1,
      start:
        initial && "startMinute" in initial
          ? minuteInput(initial.startMinute)
          : "08:00",
      end:
        initial && "endMinute" in initial
          ? minuteInput(initial.endMinute)
          : "17:00",
      startsAt:
        initial && "startsAt" in initial
          ? inputDate(initial.startsAt)
          : slot.startsAt,
      endsAt:
        initial && "endsAt" in initial
          ? inputDate(initial.endsAt)
          : slot.endsAt,
      reason: initial && "reason" in initial ? initial.reason : "",
      active: initial?.active ?? true,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={
        kind === "windows" ? "Jornada semanal" : "Indisponibilidade do técnico"
      }
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            const body =
              kind === "windows"
                ? {
                    technicianId: form.technicianId,
                    weekday: form.weekday,
                    startMinute: inputMinute(form.start),
                    endMinute: inputMinute(form.end),
                    active: form.active,
                  }
                : {
                    technicianId: form.technicianId,
                    startsAt: toIso(form.startsAt),
                    endsAt: toIso(form.endsAt),
                    reason: form.reason,
                    active: form.active,
                  };
            await api(
              "/scheduling/" +
                (kind === "windows" ? "work-windows" : "absences") +
                (initial ? "/" + initial.id : ""),
              {
                method: initial ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...body,
                  ...(initial ? { version: initial.version } : {}),
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
        <label>
          Técnico
          <select
            aria-label="Técnico da jornada"
            required
            disabled={!!initial}
            value={form.technicianId}
            onChange={(e) => setForm({ ...form, technicianId: e.target.value })}
          >
            <option value="">Selecione</option>
            {lookups.technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {!t.active ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        </label>
        {kind === "windows" ? (
          <>
            <label>
              Dia da semana
              <select
                aria-label="Dia da semana"
                value={form.weekday}
                onChange={(e) =>
                  setForm({ ...form, weekday: Number(e.target.value) })
                }
              >
                {weekdays.map((day, n) => (
                  <option key={day} value={n}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Início da jornada
              <input
                aria-label="Início da jornada"
                type="time"
                required
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </label>
            <label>
              Fim da jornada
              <input
                aria-label="Fim da jornada"
                required
                pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00"
                placeholder="17:00 ou 24:00"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </label>
            <p className="span-2 muted">
              Horário de São Paulo. Para chegar à meia-noite, use 24:00. Para
              atravessar a meia-noite, crie uma segunda janela no dia seguinte.
            </p>
          </>
        ) : (
          <>
            <label>
              Início
              <input
                aria-label="Início da indisponibilidade"
                type="datetime-local"
                required
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label>
              Término
              <input
                aria-label="Término da indisponibilidade"
                type="datetime-local"
                required
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </label>
            <label className="span-2">
              Descrição
              <input
                aria-label="Descrição da indisponibilidade"
                required
                minLength={3}
                maxLength={160}
                placeholder="Treinamento, férias ou outra indisponibilidade"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </label>
          </>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Ativa
        </label>
        <div className="form-bottom">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
