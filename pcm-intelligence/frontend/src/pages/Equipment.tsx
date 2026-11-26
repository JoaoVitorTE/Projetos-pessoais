import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  RotateCcw,
  History,
  Tag,
  Info,
  Check,
} from "lucide-react";
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
  fmt,
  equipmentCode,
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
    [notice, setNotice] = useState(""),
    [deleted, setDeleted] = useState(false),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState<Map<string, Equipment>>(new Map()),
    [removing, setRemoving] = useState<Equipment[] | null>(null),
    [restoring, setRestoring] = useState<Equipment | null>(null),
    [history, setHistory] = useState<Equipment | null>(null);
  useEffect(() => {
    setPage(1);
    setSelected(new Map());
  }, [
    search,
    deleted,
    pending,
    fleet.sectorId,
    fleet.equipmentId,
    fleet.criticality,
    status,
  ]);
  const data = useResource<Page<Equipment> & { pendingTags: number }>(
    "/equipment?" +
      query({
        ...fleet,
        status,
        q: search,
        page,
        deleted: String(deleted),
        tagMissing: pending ? "true" : "",
      }),
  );
  const change = () => {
    data.refresh();
    onChanged();
    setSelected(new Map());
  };
  const toggle = (e: Equipment) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(e.id)) next.delete(e.id);
      else next.set(e.id, e);
      return next;
    });
  return (
    <>
      <section className="equipment-intro">
        <span>
          <Tag size={23} />
        </span>
        <div>
          <h2>A TAG identifica o equipamento no setor.</h2>
          <p>
            Informe a TAG e o setor. O número do equipamento é opcional e pode
            ser preenchido depois.
          </p>
        </div>
      </section>
      <div className="action-row">
        <p>
          {deleted
            ? "Cadastros arquivados ficam disponíveis para consulta e reativação."
            : "Cadastre, atualize e gerencie equipamentos."}
        </p>
        {canPlan(user) && !deleted && (
          <button onClick={() => setEdit(null)}>
            <Plus size={16} />
            Cadastrar equipamento
          </button>
        )}
      </div>
      <div className="tabs">
        <button
          className={!deleted ? "" : "secondary"}
          onClick={() => {
            setDeleted(false);
            setPending(false);
          }}
        >
          Cadastrados
        </button>
        <button
          className={deleted ? "" : "secondary"}
          onClick={() => {
            setDeleted(true);
            setPending(false);
          }}
        >
          <Trash2 size={15} />
          Arquivados
        </button>
      </div>
      {data.data !== null && data.data.pendingTags > 0 && !deleted && (
        <div className="equipment-pending">
          <Info size={19} />
          <div>
            <b>
              {data.data.pendingTags} cadastros anteriores precisam de
              conferência da TAG.
            </b>
            <p>
              Use Editar ou reimporte o arquivo na mesma origem, mapeando TAG e
              número separadamente. As referências antigas foram preservadas.
            </p>
          </div>
          <button
            className="secondary small"
            onClick={() => setPending(!pending)}
          >
            {pending ? "Mostrar todos" : "Ver TAGs pendentes"}
          </button>
        </div>
      )}
      <div className="filters">
        <FleetFilters value={fleet} onChange={setFleet} lookups={lookups} />
        <label>
          Situação
          <select
            aria-label="Situação"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todas</option>
            {["UNKNOWN", "RUNNING", "STOPPED", "MAINTENANCE"].map((x) => (
              <option key={x} value={x}>
                {statusLabel[x]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected.size > 0 && !deleted && (
        <div className="selection-bar">
          <span>{selected.size} equipamentos selecionados</span>
          <button
            className="secondary small"
            onClick={() => setSelected(new Map())}
          >
            Limpar seleção
          </button>
          <button
            className="danger-button small"
            onClick={() => setRemoving([...selected.values()])}
          >
            <Trash2 size={14} />
            Arquivar selecionados
          </button>
        </div>
      )}
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
                {canPlan(user) && !deleted && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos da página"
                      checked={
                        !!data.data.items.length &&
                        data.data.items.every((e) => selected.has(e.id))
                      }
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((current) => {
                          const next = new Map(current);
                          for (const row of data.data!.items) {
                            if (checked) next.set(row.id, row);
                            else next.delete(row.id);
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                )}
                {[
                  "TAG",
                  "Número do equipamento",
                  "Equipamento",
                  "Setor",
                  "Criticidade",
                  deleted ? "Arquivado em" : "Situação",
                  "Ações",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((e) => (
                <tr key={e.id}>
                  {canPlan(user) && !deleted && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={
                          "Selecionar " +
                          equipmentCode(e) +
                          " · " +
                          e.sector?.name
                        }
                        checked={selected.has(e.id)}
                        onChange={() => toggle(e)}
                      />
                    </td>
                  )}
                  <td className="code">
                    {e.tag || (
                      <span className="pending-tag">
                        TAG pendente<small>Ref. anterior: {e.id}</small>
                      </span>
                    )}
                  </td>
                  <td>
                    {e.equipmentNumber || (
                      <span className="muted">Não informado</span>
                    )}
                  </td>
                  <td>{e.name}</td>
                  <td>{e.sector?.name}</td>
                  <td>
                    <Priority value={e.criticality} />
                  </td>
                  <td>
                    {deleted ? fmt(e.deletedAt) : <Badge status={e.status} />}
                  </td>
                  <td>
                    <div className="row-actions">
                      {canPlan(user) &&
                        (!deleted ? (
                          <>
                            <button
                              className="small secondary"
                              onClick={() => setEdit(e)}
                              aria-label={"Editar " + equipmentCode(e)}
                            >
                              Editar
                            </button>
                            <button
                              className="small secondary danger-text"
                              onClick={() => setRemoving([e])}
                              aria-label={"Excluir " + equipmentCode(e)}
                            >
                              <Trash2 size={13} />
                              Arquivar ou excluir
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="small secondary"
                              onClick={() => setRestoring(e)}
                            >
                              <RotateCcw size={13} /> Reativar
                            </button>
                            <button
                              className="small secondary danger-text"
                              onClick={() => setRemoving([e])}
                            >
                              Excluir
                            </button>
                          </>
                        ))}
                      <button
                        className="small secondary"
                        aria-label={"Histórico de " + equipmentCode(e)}
                        onClick={() => setHistory(e)}
                      >
                        <History size={13} />
                        Histórico
                      </button>
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
        <EquipmentForm
          initial={edit}
          lookups={lookups}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setNotice("Equipamento salvo com auditoria.");
            change();
          }}
        />
      )}
      {removing && (
        <EquipmentRemoval
          rows={removing}
          archived={deleted}
          onClose={() => setRemoving(null)}
          onSaved={() => {
            setNotice(
              removing.length + " cadastro(s) processado(s) com auditoria.",
            );
            setRemoving(null);
            setPage(1);
            change();
          }}
        />
      )}
      {restoring && (
        <EquipmentRemoval
          rows={[restoring]}
          restore
          onClose={() => setRestoring(null)}
          onSaved={() => {
            setRestoring(null);
            setNotice("Equipamento reativado com auditoria.");
            change();
          }}
        />
      )}
      {history && (
        <EquipmentHistory
          equipment={history}
          onClose={() => setHistory(null)}
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
  const [form, setForm] = useState({
      tag: initial?.tag || "",
      equipmentNumber: initial?.equipmentNumber || "",
      name: initial?.name || "",
      sectorId: initial?.sectorId || "",
      criticality: initial?.criticality || 2,
      status: initial?.status || "UNKNOWN",
    }),
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
            await api(
              "/equipment" +
                (initial ? "/" + encodeURIComponent(initial.id) : ""),
              {
                method: initial ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...form,
                  equipmentNumber: form.equipmentNumber.trim() || null,
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
        <p className="form-guidance span-2">
          Uma TAG pode repetir em setores diferentes. Dentro do mesmo setor,
          cada equipamento tem sua própria TAG.
        </p>
        <label>
          TAG · obrigatória
          <input
            aria-label="TAG"
            required
            maxLength={80}
            placeholder="Ex.: 0011"
            value={form.tag}
            onChange={(e) =>
              setForm({ ...form, tag: e.target.value.toUpperCase() })
            }
          />
          <small>Zeros à esquerda são preservados.</small>
        </label>
        <label>
          Número do equipamento · opcional
          <input
            aria-label="Número do equipamento"
            maxLength={80}
            placeholder="Preencha se houver número no SAP"
            value={form.equipmentNumber}
            onChange={(e) =>
              setForm({ ...form, equipmentNumber: e.target.value })
            }
          />
          <small>Pode ficar em branco.</small>
        </label>
        <label className="span-2">
          Nome do equipamento
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
          Setor · obrigatório
          <select
            aria-label="Setor"
            required
            value={form.sectorId}
            onChange={(e) => setForm({ ...form, sectorId: e.target.value })}
          >
            <option value="">Selecione</option>
            {lookups.sectors.map((x) => (
              <option key={x.id} value={x.id}>
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
        {!lookups.sectors.length && (
          <p className="error span-2">
            Cadastre um setor em Gestão → Cadastros e acessos antes de salvar.
          </p>
        )}
        <div className="form-bottom">
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="wizard-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancelar
            </button>
            <button disabled={busy}>
              {busy ? "Salvando…" : "Salvar equipamento"}
              <Check size={16} />
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
function EquipmentRemoval({
  rows,
  restore = false,
  archived = false,
  onClose,
  onSaved,
}: {
  rows: Equipment[];
  restore?: boolean;
  archived?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [archive, setArchive] = useState(!archived),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={
        restore
          ? "Reativar equipamento"
          : archive
            ? "Arquivar equipamentos"
            : "Excluir equipamento definitivamente"
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!restore && !archive && confirmation !== "EXCLUIR") return;
          setBusy(true);
          setError("");
          try {
            if (restore)
              await api(
                "/equipment/" + encodeURIComponent(rows[0].id) + "/restore",
                {
                  method: "POST",
                  body: JSON.stringify({ version: rows[0].version, reason }),
                },
              );
            else if (archive)
              await api("/equipment/bulk-archive", {
                method: "POST",
                body: JSON.stringify({
                  items: rows.map(({ id, version }) => ({ id, version })),
                  reason,
                }),
              });
            else
              await api(
                "/equipment/" + encodeURIComponent(rows[0].id) + "/permanent",
                {
                  method: "DELETE",
                  body: JSON.stringify({ version: rows[0].version, reason }),
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
        <p>
          {restore
            ? "O equipamento voltará ao cadastro e às opções de seleção."
            : archive
              ? "Os equipamentos sairão do cadastro ativo. O histórico ficará disponível na aba Arquivados."
              : "A exclusão definitiva só é possível para cadastros sem vínculos."}
        </p>
        <ul className="removal-items">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              <strong>{equipmentCode(r)}</strong>
              <span>
                {r.name} · {r.sector?.name}
              </span>
            </li>
          ))}
          {rows.length > 8 && (
            <li>Mais {rows.length - 8} equipamentos selecionados.</li>
          )}
        </ul>
        {!restore && !archived && rows.length === 1 && (
          <fieldset>
            <legend>O que deseja fazer com o cadastro?</legend>
            {(
              [
                [true, "Arquivar e preservar o histórico"],
                [false, "Excluir definitivamente"],
              ] as const
            ).map(([value, label]) => (
              <label key={String(value)} className="check-label">
                <input
                  type="radio"
                  name="equipmentRemoval"
                  checked={archive === value}
                  onChange={() => {
                    setArchive(Boolean(value));
                    setError("");
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <label>
          Motivo
          <textarea
            aria-label="Motivo da alteração"
            required
            minLength={3}
            maxLength={500}
            placeholder={
              restore
                ? "Por que o cadastro deve voltar?"
                : "Ex.: cadastro importado com identificação incorreta"
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {!restore && !archive && (
          <label>
            Digite EXCLUIR para confirmar
            <input
              aria-label="Confirmação de exclusão"
              required
              pattern="EXCLUIR"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="wizard-actions">
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className={restore ? "" : "danger-button"}
            disabled={
              busy || (!restore && !archive && confirmation !== "EXCLUIR")
            }
          >
            {busy
              ? "Salvando…"
              : restore
                ? "Reativar equipamento"
                : archive
                  ? "Arquivar"
                  : "Excluir definitivamente"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EquipmentHistory({
  equipment,
  onClose,
}: {
  equipment: Equipment;
  onClose: () => void;
}) {
  const data = useResource<
    {
      id: string;
      action: string;
      createdAt: string;
      user: { name: string } | null;
      metadata: { reason?: string };
    }[]
  >("/equipment/" + encodeURIComponent(equipment.id) + "/history");
  const labels: Record<string, string> = {
    EQUIPMENT_CREATED: "Cadastro criado",
    EQUIPMENT_UPDATED: "Cadastro alterado",
    EQUIPMENT_DELETED: "Cadastro arquivado",
    EQUIPMENT_ARCHIVED: "Cadastro arquivado",
    EQUIPMENT_PURGED: "Cadastro excluído definitivamente",
    EQUIPMENT_RESTORED: "Cadastro restaurado",
    IMPORT_APPLIED: "Importação aplicada",
    IMPORT_REVERTED: "Importação desfeita",
  };
  return (
    <Modal title={"Histórico · " + equipmentCode(equipment)} onClose={onClose}>
      <State {...data} />
      <ol className="timeline">
        {data.data?.map((r) => (
          <li key={r.id}>
            <strong>{labels[r.action] || r.action}</strong>
            <p>
              {fmt(r.createdAt)} · {r.user?.name || "Sistema"}
            </p>
            {r.metadata.reason && <p>{r.metadata.reason}</p>}
          </li>
        ))}
      </ol>
      {data.data?.length === 0 && <Empty />}
    </Modal>
  );
}
