import { useState } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import {
  Empty,
  EquipmentSelect,
  Modal,
  Pager,
  State,
} from "../components/OperationalUI";
import {
  equipmentCode,
  query,
  type Equipment,
  type Lookups,
  type Page,
  type User,
} from "../types/operations";

const kinds = {
  CORP: "Corretiva programada",
  CONTRATURNO: "Manutenção no contraturno",
  MELH: "Melhoria",
};

export type ReminderDraft = {
  equipmentId: string;
  kind: keyof typeof kinds;
  title: string;
  description: string;
};

type Reminder = ReminderDraft & {
  id: string;
  plannedFor: string;
  equipment: Equipment;
  sapReference: string | null;
  createdBy: string;
};

export function ReminderForm({
  lookups,
  draft,
  onClose,
  onSaved,
}: {
  lookups: Lookups;
  draft?: ReminderDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    equipmentId: "",
    kind: "CORP" as ReminderDraft["kind"],
    title: "",
    description: "",
    ...draft,
    plannedFor: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Novo planejamento" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await api("/reminders", {
              method: "POST",
              body: JSON.stringify(form),
            });
            onSaved();
          } catch (cause) {
            setError((cause as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="span-2">
          Prepare o lembrete e o texto da futura ordem. A ordem é aberta no SAP.
        </p>
        <EquipmentSelect
          lookups={lookups}
          value={form.equipmentId}
          onChange={(equipmentId) => setForm({ ...form, equipmentId })}
        />
        <label>
          Tipo de planejamento
          <select
            value={form.kind}
            onChange={(e) =>
              setForm({
                ...form,
                kind: e.target.value as ReminderDraft["kind"],
              })
            }
          >
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data planejada
          <input
            type="date"
            required
            value={form.plannedFor}
            onChange={(e) => setForm({ ...form, plannedFor: e.target.value })}
          />
        </label>
        <label>
          Texto breve
          <input
            minLength={3}
            maxLength={120}
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="span-2">
          Texto descritivo
          <textarea
            required
            minLength={3}
            maxLength={2000}
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        {error && (
          <p role="alert" className="error span-2">
            {error}
          </p>
        )}
        <div className="form-bottom span-2">
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar planejamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MaintenanceReminders({
  user,
  lookups,
  sectorId,
  equipmentId,
  initialCreate,
}: {
  user: User;
  lookups: Lookups;
  sectorId: string;
  equipmentId: string;
  initialCreate: boolean;
}) {
  const [create, setCreate] = useState(initialCreate);
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Reminder | null>(null);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const data = useResource<Page<Reminder>>(
    "/reminders?" + query({ status, page, sectorId, equipmentId }),
  );
  async function finish(action: "LINKED" | "CANCELLED") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/reminders/" + selected.id, {
        method: "PATCH",
        body: JSON.stringify(
          action === "LINKED"
            ? { status: action, sapReference: reference.trim() }
            : { status: action },
        ),
      });
      setSelected(null);
      data.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="block-heading">
        <h2 id="maintenance-reminders">Planejamentos para o SAP</h2>
        <button onClick={() => setCreate(true)}>Novo planejamento</button>
      </div>
      <label>
        Estado do planejamento{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="PENDING">Pendentes</option>
          <option value="LINKED">Vinculados ao SAP</option>
          <option value="CANCELLED">Cancelados</option>
        </select>
      </label>
      <State loading={data.loading} error={data.error} />
      {data.data &&
        (data.data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Planejamento</th>
                    <th>Equipamento / setor</th>
                    <th>Data</th>
                    <th>Referência SAP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(item);
                            setError("");
                            setReference("");
                          }}
                        >
                          {item.title}
                        </button>
                        <small>{kinds[item.kind]}</small>
                      </td>
                      <td>
                        {equipmentCode(item.equipment)}
                        <small>{item.equipment.sector?.name}</small>
                      </td>
                      <td>
                        {item.plannedFor
                          .slice(0, 10)
                          .split("-")
                          .reverse()
                          .join("/")}
                      </td>
                      <td>{item.sapReference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...data.data} onChange={setPage} />
          </>
        ) : (
          <Empty />
        ))}
      {create && (
        <ReminderForm
          lookups={lookups}
          draft={
            equipmentId
              ? { equipmentId, title: "", description: "", kind: "CORP" }
              : undefined
          }
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            setStatus("PENDING");
            setPage(1);
            data.refresh();
          }}
        />
      )}
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>
          {status === "PENDING" &&
            (user.role !== "PLANNER" || selected.createdBy === user.id) && (
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void finish("LINKED");
                }}
              >
                <label className="span-2">
                  Número da ordem importada da IW38
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{1,24}"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                {error && (
                  <p role="alert" className="error span-2">
                    {error}
                  </p>
                )}
                <div className="form-bottom span-2">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void finish("CANCELLED")}
                  >
                    Cancelar planejamento
                  </button>
                  <button disabled={busy}>Vincular ordem SAP</button>
                </div>
              </form>
            )}
        </Modal>
      )}
    </section>
  );
}
