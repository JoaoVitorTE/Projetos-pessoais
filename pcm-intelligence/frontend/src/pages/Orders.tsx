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
  Priority,
  State,
  TechnicianSelect,
} from "../components/OperationalUI";
import {
  canPlan,
  fmt,
  localDate,
  orderStates,
  orderTransitions,
  priorities,
  query,
  statusLabel,
  typeLabel,
  type Lookups,
  type Order,
  type Page,
  type User,
} from "../types/operations";
export function OrdersPage({
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
    [overdue, setOverdue] = useState(false),
    [edit, setEdit] = useState<Order | null | undefined>(),
    [detail, setDetail] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const qs = query({
    ...fleet,
    page,
    status,
    overdue: overdue ? "true" : "",
    q: search,
  });
  useEffect(() => setPage(1), [search]);
  const data = useResource<Page<Order>>("/orders?" + qs);
  async function download() {
    setError("");
    try {
      const response = await fetch("/api/orders/export.csv?" + qs, {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "Falha ao exportar");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "ordens-locais.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="action-row">
        <p>Registros locais e cópias de exportações. Sem alterações no SAP.</p>
        <div>
          <button className="secondary" onClick={download}>
            Exportar CSV
          </button>
          {canPlan(user) && (
            <button onClick={() => setEdit(null)}>Criar ordem</button>
          )}
        </div>
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
            {orderStates.map((x) => (
              <option key={x} value={x}>
                {statusLabel[x]}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => {
              setOverdue(e.target.checked);
              setPage(1);
            }}
          />
          Somente atrasadas
        </label>
      </div>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <State loading={data.loading} error={error || data.error} />
      {data.data && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "OS local",
                  "Equipamento",
                  "Prioridade",
                  "Responsável",
                  "Programação",
                  "Status",
                  "Ações",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((o) => (
                <tr key={o.id}>
                  <td className="code">
                    {o.id}
                    <small>{typeLabel[o.type]}</small>
                  </td>
                  <td>
                    {o.equipmentId}
                    <small>{o.description.slice(0, 70)}</small>
                  </td>
                  <td>
                    <Priority value={o.priority} />
                  </td>
                  <td>{o.technician?.name || "Não atribuído"}</td>
                  <td>
                    {fmt(o.scheduledAt)}
                    {o.overdue && <small className="late">Atrasada</small>}
                  </td>
                  <td>
                    <Badge status={o.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="small secondary"
                        onClick={() => setDetail(o.id)}
                        aria-label={"Histórico " + o.id}
                      >
                        Histórico
                      </button>
                      {!["COMPLETED", "CANCELLED"].includes(o.status) &&
                        (canPlan(user) ||
                          (user.role === "TECHNICIAN" &&
                            user.technicianId === o.technicianId)) && (
                          <button
                            className="small secondary"
                            aria-label={"Editar " + o.id}
                            onClick={() => setEdit(o)}
                          >
                            Editar
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
      )}
      {edit !== undefined && (
        <OrderForm
          initial={edit}
          user={user}
          lookups={lookups}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setNotice("Ordem salva com histórico de alterações.");
            data.refresh();
          }}
        />
      )}
      {detail && <OrderDetail id={detail} onClose={() => setDetail("")} />}
    </>
  );
}
function OrderForm({
  initial,
  user,
  lookups,
  onClose,
  onSaved,
}: {
  initial: Order | null;
  user: User;
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      equipmentId: initial?.equipmentId || "",
      technicianId: initial?.technicianId || "",
      type: initial?.type || "CORRECTIVE",
      description: initial?.description || "",
      priority: initial?.priority || 2,
      scheduledAt: initial
        ? initial.scheduledAt
          ? localDate(initial.scheduledAt)
          : ""
        : localDate(),
      notes: initial?.notes || "",
      sapReference: initial?.sapReference || "",
      status: initial?.status || "OPEN",
      changeNote: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tech = user.role === "TECHNICIAN";
  const options = initial
    ? [
        initial.status,
        ...(orderTransitions[initial.status] || []).filter(
          (s) =>
            !tech ||
            [
              "IN_PROGRESS",
              "WAITING_PART",
              "WAITING_VENDOR",
              "COMPLETED",
            ].includes(s),
        ),
      ]
    : ["OPEN"];
  return (
    <Modal
      title={initial ? "Editar ordem " + initial.id : "Nova ordem local"}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            const data = {
              equipmentId: form.equipmentId,
              technicianId: form.technicianId || null,
              type: form.type,
              description: form.description,
              priority: form.priority,
              scheduledAt: form.scheduledAt
                ? new Date(form.scheduledAt).toISOString()
                : null,
              notes: form.notes || null,
              sapReference: form.sapReference || null,
            };
            const body = initial
              ? tech
                ? {
                    version: initial.version,
                    status: form.status,
                    notes: data.notes,
                    changeNote: form.changeNote,
                  }
                : {
                    ...data,
                    version: initial.version,
                    status: form.status,
                    changeNote: form.changeNote,
                  }
              : data;
            await api("/orders" + (initial ? "/" + initial.id : ""), {
              method: initial ? "PATCH" : "POST",
              body: JSON.stringify(body),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!tech && (
          <>
            <EquipmentSelect
              lookups={lookups}
              value={form.equipmentId}
              onChange={(equipmentId) => setForm({ ...form, equipmentId })}
            />
            <TechnicianSelect
              optional
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
                {Object.entries(typeLabel)
                  .filter(([k]) => !["PLANNED", "UNPLANNED"].includes(k))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Prioridade
              <select
                aria-label="Prioridade"
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: Number(e.target.value) })
                }
              >
                {[1, 2, 3].map((x) => (
                  <option key={x} value={x}>
                    {priorities[x]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Programação
              <input
                aria-label="Programação"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) =>
                  setForm({ ...form, scheduledAt: e.target.value })
                }
              />
            </label>
            <label>
              Referência SAP (somente informativa)
              <input
                aria-label="Referência SAP (somente informativa)"
                maxLength={100}
                value={form.sapReference}
                onChange={(e) =>
                  setForm({ ...form, sapReference: e.target.value })
                }
              />
            </label>
            <label className="span-2">
              Descrição do problema
              <textarea
                aria-label="Descrição do problema"
                required
                minLength={3}
                maxLength={2000}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
          </>
        )}
        {initial && (
          <label>
            Status
            <select
              aria-label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="span-2">
          Observações
          <textarea
            aria-label="Observações"
            maxLength={2000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        {initial && (
          <label className="span-2">
            Motivo da alteração
            <input
              aria-label="Motivo da alteração"
              required
              minLength={3}
              maxLength={1000}
              value={form.changeNote}
              onChange={(e) => setForm({ ...form, changeNote: e.target.value })}
            />
          </label>
        )}
        <div className="form-bottom">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy}>{busy ? "Salvando…" : "Salvar ordem"}</button>
        </div>
      </form>
    </Modal>
  );
}
function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useResource<Order>("/orders/" + id);
  return (
    <Modal title={"Histórico " + id} onClose={onClose}>
      <State {...data} />
      {data.data && (
        <>
          <p>{data.data.description}</p>
          <Badge status={data.data.status} />
          <ol className="timeline">
            {data.data.history?.map((x) => (
              <li key={x.id}>
                <strong>
                  {fmt(x.createdAt)} · {x.user.name}
                </strong>
                <p>
                  {x.action === "CREATED"
                    ? "Ordem criada"
                    : x.before?.status !== x.after.status
                      ? `${statusLabel[x.before?.status || ""] || ""} → ${statusLabel[x.after.status]}`
                      : "Cadastro atualizado"}
                </p>
                <p>{x.notes}</p>
              </li>
            ))}
          </ol>
          {!data.data.history?.length && (
            <p>Registro inicial. Ainda não houve alterações pelo sistema.</p>
          )}
        </>
      )}
    </Modal>
  );
}
