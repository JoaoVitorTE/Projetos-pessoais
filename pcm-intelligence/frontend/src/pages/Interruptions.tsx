import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import {
  Badge,
  Empty,
  EquipmentSelect,
  FleetFilters,
  emptyFleet,
  Modal,
  Pager,
  State,
} from "../components/OperationalUI";
import {
  canPlan,
  fmt,
  localDate,
  query,
  typeLabel,
  type Interruption,
  type Lookups,
  type Page,
  type User,
} from "../types/operations";
type Recurrence = {
  from: string;
  to: string;
  rule: string;
  items: {
    equipmentId: string;
    name: string;
    reason: string;
    occurrences: number;
    days: number;
  }[];
};
export function InterruptionsPage({
  user,
  lookups,
  search,
}: {
  user: User;
  lookups: Lookups;
  search: string;
}) {
  const [fleet, setFleet] = useState(emptyFleet),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [edit, setEdit] = useState<Interruption | null | undefined>(),
    [notice, setNotice] = useState("");
  useEffect(() => setPage(1), [search]);
  const data = useResource<Page<Interruption>>(
    "/interruptions?" + query({ ...fleet, page, status, q: search }),
  );
  const recurrence = useResource<Recurrence>(
    "/interruptions/recurrence?" + query(fleet),
  );
  return (
    <>
      <div className="action-row">
        <p>
          Interrupções registradas manualmente. Duração calculada pelo início e
          término.
        </p>
        {(canPlan(user) || user.role === "TECHNICIAN") && (
          <button onClick={() => setEdit(null)}>Registrar interrupção</button>
        )}
      </div>
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
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="OPEN">Em andamento</option>
            <option value="CLOSED">Encerradas</option>
          </select>
        </label>
      </div>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <State {...data} />
      {data.data && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Equipamento",
                  "Início",
                  "Término",
                  "Duração",
                  "Motivo",
                  "Status",
                  "Ações",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((i) => (
                <tr key={i.id}>
                  <td className="code">
                    {i.equipmentId}
                    <small>{i.equipment?.name}</small>
                  </td>
                  <td>{fmt(i.startedAt)}</td>
                  <td>{fmt(i.endedAt)}</td>
                  <td>
                    {i.durationMinutes === null
                      ? "Em andamento"
                      : i.durationMinutes + " min"}
                  </td>
                  <td>
                    {i.reason}
                    <small>
                      {typeLabel[i.type]} · {i.source}
                    </small>
                  </td>
                  <td>
                    <Badge status={i.status} />
                  </td>
                  <td>
                    {canPlan(user) && (
                      <button
                        className="secondary small"
                        onClick={() => setEdit(i)}
                        aria-label={"Editar interrupção " + i.id}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data.items.length && <Empty />}
          <Pager {...data.data} onChange={setPage} />
        </div>
      )}
      <section className="panel recurrence">
        <h2>Recorrência de motivos informados</h2>
        <State {...recurrence} />
        {recurrence.data && (
          <>
            <p>
              {fmt(recurrence.data.from)} a {fmt(recurrence.data.to)} ·{" "}
              {recurrence.data.rule}
            </p>
            {!recurrence.data.items.length ? (
              <p>Nenhum padrão atende ao critério neste período.</p>
            ) : (
              <div className="recurrence-grid">
                {recurrence.data.items.slice(0, 9).map((i) => (
                  <article key={i.equipmentId + i.reason}>
                    <strong>
                      {i.equipmentId} · {i.occurrences} ocorrências
                    </strong>
                    <p>
                      {i.reason} · {i.days} dias distintos
                    </p>
                    <small>
                      Recomenda-se revisar os registros antes de investigar.
                    </small>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {edit !== undefined && (
        <InterruptionForm
          initial={edit}
          lookups={lookups}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setNotice("Interrupção salva. Recorrências recalculadas.");
            data.refresh();
            recurrence.refresh();
          }}
        />
      )}
    </>
  );
}
function InterruptionForm({
  initial,
  lookups,
  onClose,
  onSaved,
}: {
  initial: Interruption | null;
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      equipmentId: initial?.equipmentId || "",
      startedAt: localDate(initial?.startedAt),
      endedAt: initial?.endedAt ? localDate(initial.endedAt) : "",
      type: initial?.type || "UNPLANNED",
      reason: initial?.reason || "",
      description: initial?.description || "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={initial ? "Editar interrupção" : "Registrar interrupção"}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/interruptions" + (initial ? "/" + initial.id : ""), {
              method: initial ? "PATCH" : "POST",
              body: JSON.stringify({
                ...form,
                startedAt: new Date(form.startedAt).toISOString(),
                endedAt: form.endedAt
                  ? new Date(form.endedAt).toISOString()
                  : null,
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
        <EquipmentSelect
          lookups={lookups}
          value={form.equipmentId}
          onChange={(equipmentId) => setForm({ ...form, equipmentId })}
        />
        <label>
          Tipo
          <select
            aria-label="Tipo"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="UNPLANNED">Não planejada</option>
            <option value="PLANNED">Planejada</option>
          </select>
        </label>
        <label>
          Início
          <input
            aria-label="Início"
            required
            type="datetime-local"
            value={form.startedAt}
            onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
          />
        </label>
        <label>
          Término (opcional)
          <input
            aria-label="Término (opcional)"
            type="datetime-local"
            min={form.startedAt}
            value={form.endedAt}
            onChange={(e) => setForm({ ...form, endedAt: e.target.value })}
          />
        </label>
        <label className="span-2">
          Motivo informado
          <input
            aria-label="Motivo informado"
            required
            minLength={3}
            maxLength={160}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </label>
        <label className="span-2">
          Descrição
          <textarea
            aria-label="Descrição"
            required
            minLength={3}
            maxLength={2000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <div className="form-bottom">
          <p>
            Sem término, o registro permanece em andamento. Não são inferidas
            causas mecânicas.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar interrupção"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
