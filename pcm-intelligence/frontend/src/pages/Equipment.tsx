import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import {
  Badge,
  Empty,
  FleetFilters,
  emptyFleet,
  Modal,
  Pager,
  Priority,
  State,
} from "../components/OperationalUI";
import {
  canPlan,
  priorities,
  query,
  type Equipment,
  type Lookups,
  type Page,
  type User,
  statusLabel,
} from "../types/operations";
export function EquipmentPage({
  user,
  lookups,
  search,
  onChanged,
}: {
  user: User;
  lookups: Lookups;
  search: string;
  onChanged: () => void;
}) {
  const [fleet, setFleet] = useState(emptyFleet),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Equipment | null | undefined>(),
    [notice, setNotice] = useState("");
  useEffect(() => setPage(1), [search]);
  const data = useResource<Page<Equipment>>(
    "/equipment?" + query({ ...fleet, status, q: search, page }),
  );
  return (
    <>
      <div className="action-row">
        <p>Cadastro de equipamentos e sua situação informada.</p>
        {canPlan(user) && (
          <button onClick={() => setEdit(null)}>Cadastrar equipamento</button>
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
          Situação
          <select
            aria-label="Situação"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {["UNKNOWN", "RUNNING", "STOPPED", "MAINTENANCE"].map((x) => (
              <option value={x} key={x}>
                {statusLabel[x]}
              </option>
            ))}
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
                  "Código",
                  "Equipamento",
                  "Setor",
                  "Criticidade",
                  "Situação",
                  "Ações",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((e) => (
                <tr key={e.id}>
                  <td className="code">{e.id}</td>
                  <td>{e.name}</td>
                  <td>{e.sector?.name}</td>
                  <td>
                    <Priority value={e.criticality} />
                  </td>
                  <td>
                    <Badge status={e.status} />
                  </td>
                  <td>
                    {canPlan(user) && (
                      <button
                        className="small secondary"
                        onClick={() => setEdit(e)}
                        aria-label={"Editar " + e.id}
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
      {edit !== undefined && (
        <EquipmentForm
          initial={edit}
          lookups={lookups}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setNotice("Equipamento salvo com auditoria.");
            data.refresh();
            onChanged();
          }}
        />
      )}
    </>
  );
}
function EquipmentForm({
  initial,
  lookups,
  onClose,
  onSaved,
}: {
  initial: Equipment | null;
  lookups: Lookups;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
      initial || {
        id: "",
        name: "",
        sectorId: "",
        criticality: 2,
        status: "UNKNOWN",
      },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={initial ? "Editar equipamento" : "Novo equipamento"}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const body = {
              name: form.name,
              sectorId: form.sectorId,
              criticality: form.criticality,
              status: form.status,
            };
            await api(
              "/equipment" +
                (initial ? "/" + encodeURIComponent(initial.id) : ""),
              {
                method: initial ? "PATCH" : "POST",
                body: JSON.stringify(
                  initial
                    ? { ...body, version: initial.version }
                    : { ...body, id: form.id },
                ),
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
          Código
          <input
            aria-label="Código"
            required
            disabled={!!initial}
            pattern="[A-Z0-9][A-Z0-9-]{2,39}"
            placeholder="EQ-031"
            value={form.id}
            onChange={(e) =>
              setForm({ ...form, id: e.target.value.toUpperCase() })
            }
          />
        </label>
        <label>
          Nome
          <input
            aria-label="Nome"
            required
            minLength={3}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Setor
          <select
            aria-label="Setor"
            required
            value={form.sectorId}
            onChange={(e) => setForm({ ...form, sectorId: e.target.value })}
          >
            <option value="">Selecione</option>
            {lookups.sectors.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Criticidade
          <select
            aria-label="Criticidade"
            value={form.criticality}
            onChange={(e) =>
              setForm({ ...form, criticality: Number(e.target.value) })
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
          Situação
          <select
            aria-label="Situação"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {["UNKNOWN", "RUNNING", "STOPPED", "MAINTENANCE"].map((x) => (
              <option key={x} value={x}>
                {statusLabel[x]}
              </option>
            ))}
          </select>
        </label>
        <div className="form-bottom">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar equipamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
