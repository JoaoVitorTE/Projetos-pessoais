import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import { Badge, Empty, Modal, Pager, State } from "../components/OperationalUI";
import {
  canManage,
  canPlan,
  fmt,
  localDate,
  query,
  serviceStates,
  serviceTransitions,
  statusLabel,
  type Page,
  type Requirement,
  type ThirdParty,
  type User,
} from "../types/operations";
export function ThirdPartiesPage({
  user,
  search,
  initialRecordId = "",
  initialOverdue = false,
}: {
  user: User;
  search: string;
  initialRecordId?: string;
  initialOverdue?: boolean;
}) {
  const [status, setStatus] = useState(""),
    [provider, setProvider] = useState(""),
    [overdue, setOverdue] = useState(initialOverdue),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<ThirdParty | null | undefined>(),
    [detail, setDetail] = useState(initialRecordId),
    [config, setConfig] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => setPage(1), [search]);
  const data = useResource<Page<ThirdParty>>(
    "/third-parties?" +
      query({
        status,
        provider,
        page,
        q: search,
        overdue: overdue ? "true" : "",
      }),
  );
  return (
    <>
      <div className="action-row">
        <p>
          Regularização de terceiros com conferência humana. Nenhum pagamento é
          aprovado automaticamente.
        </p>
        <div>
          {user.role === "ADMIN" && (
            <button className="secondary" onClick={() => setConfig(true)}>
              Configurar documentos
            </button>
          )}
          {canPlan(user) && (
            <button onClick={() => setEdit(null)}>Novo processo</button>
          )}
        </div>
      </div>
      <div className="filters">
        <label>
          Prestador
          <input
            aria-label="Prestador"
            placeholder="Nome da empresa"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Etapa
          <select
            aria-label="Etapa"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {serviceStates.map((x) => (
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
          Sem movimentação há mais de 7 dias
        </label>
      </div>
      {notice && (
        <p className="success" role="status">
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
                  "Processo",
                  "Prestador / serviço",
                  "Etapa",
                  "Tempo na etapa",
                  "Pendências",
                  "Ações",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((s) => (
                <tr key={s.id}>
                  <td className="code">
                    {s.id}
                    <small>OS: {s.orderId}</small>
                  </td>
                  <td>
                    <strong>{s.provider}</strong>
                    <small>{s.description.slice(0, 80)}</small>
                  </td>
                  <td>
                    <Badge status={s.status} />
                  </td>
                  <td>
                    {s.daysInStage} dias
                    {s.daysInStage > 7 && s.status !== "FINISHED" && (
                      <small className="late">Revisar andamento</small>
                    )}
                  </td>
                  <td>{s.pendingNotes || "Nenhuma observação"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="small"
                        onClick={() => setDetail(s.id)}
                        aria-label={"Acompanhar " + s.id}
                      >
                        Acompanhar
                      </button>
                      {canPlan(user) && s.status !== "FINISHED" && (
                        <button
                          className="small secondary"
                          onClick={() => setEdit(s)}
                          aria-label={"Editar " + s.id}
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
        <ServiceForm
          initial={edit}
          user={user}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setNotice("Processo salvo com auditoria.");
            data.refresh();
          }}
        />
      )}
      {detail && (
        <ServiceDetail
          id={detail}
          user={user}
          onClose={() => {
            setDetail("");
            data.refresh();
          }}
        />
      )}
      {config && <Requirements onClose={() => setConfig(false)} />}
    </>
  );
}
function ServiceForm({
  initial,
  user,
  onClose,
  onSaved,
}: {
  initial: ThirdParty | null;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
      provider: initial?.provider || "",
      description: initial?.description || "",
      executedAt: initial?.executedAt ? localDate(initial.executedAt) : "",
      internalOwner: initial?.internalOwner || user.name,
      orderId: initial?.orderId || "",
      purchaseReference: initial?.purchaseReference || "",
      amount: initial?.amount == null ? "" : String(initial.amount),
      pendingNotes: initial?.pendingNotes || "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={initial ? "Editar processo " + initial.id : "Novo processo local"}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { amount, ...rest } = form;
            await api("/third-parties" + (initial ? "/" + initial.id : ""), {
              method: initial ? "PATCH" : "POST",
              body: JSON.stringify({
                ...rest,
                executedAt: form.executedAt
                  ? new Date(form.executedAt).toISOString()
                  : null,
                pendingNotes: form.pendingNotes || null,
                purchaseReference: form.purchaseReference || null,
                ...(canManage(user)
                  ? { amount: amount === "" ? null : Number(amount) }
                  : {}),
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
        <label>
          Empresa prestadora
          <input
            aria-label="Empresa prestadora"
            required
            minLength={3}
            maxLength={160}
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          />
        </label>
        <label>
          OS interna vinculada
          <input
            aria-label="OS interna vinculada"
            required
            placeholder="OS-0001"
            value={form.orderId}
            onChange={(e) => setForm({ ...form, orderId: e.target.value })}
          />
        </label>
        <label>
          Data de execução informada
          <input
            aria-label="Data de execução informada"
            type="datetime-local"
            value={form.executedAt}
            onChange={(e) => setForm({ ...form, executedAt: e.target.value })}
          />
        </label>
        <label>
          Responsável interno
          <input
            aria-label="Responsável interno"
            required
            minLength={3}
            maxLength={120}
            value={form.internalOwner}
            onChange={(e) =>
              setForm({ ...form, internalOwner: e.target.value })
            }
          />
        </label>
        <label>
          Pedido (opcional)
          <input
            aria-label="Pedido (opcional)"
            maxLength={100}
            value={form.purchaseReference}
            onChange={(e) =>
              setForm({ ...form, purchaseReference: e.target.value })
            }
          />
        </label>
        {canManage(user) && (
          <label>
            Valor informado (R$, opcional)
            <input
              aria-label="Valor informado (R$, opcional)"
              type="number"
              min="0"
              step="0.01"
              max="9999999999.99"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
        )}
        <label className="span-2">
          Descrição do serviço
          <textarea
            aria-label="Descrição do serviço"
            required
            minLength={3}
            maxLength={2000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="span-2">
          Pendências registradas
          <textarea
            aria-label="Pendências registradas"
            maxLength={2000}
            value={form.pendingNotes}
            onChange={(e) => setForm({ ...form, pendingNotes: e.target.value })}
          />
        </label>
        <div className="form-bottom">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar processo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Requirements({ onClose }: { onClose: () => void }) {
  const data = useResource<Requirement[]>("/document-requirements"),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function toggle(item: Requirement) {
    setBusy(true);
    setError("");
    try {
      await api("/document-requirements/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      data.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Requisitos documentais" onClose={onClose}>
      <p>
        O administrador define os requisitos aplicáveis a todos os processos.
        Nenhum documento é presumido obrigatório. Novos requisitos ativos serão
        conferidos nas próximas movimentações.
      </p>
      <State loading={data.loading} error={error || data.error} />
      <ul className="requirement-list">
        {data.data?.map((x) => (
          <li key={x.id}>
            <span>
              {x.name} · {x.active ? "Ativo" : "Inativo"}
            </span>
            <button
              disabled={busy}
              className="secondary small"
              onClick={() => toggle(x)}
            >
              {x.active ? "Desativar" : "Ativar"}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/document-requirements", {
              method: "POST",
              body: JSON.stringify({ name }),
            });
            setName("");
            data.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Novo requisito
          <input
            aria-label="Novo requisito"
            required
            minLength={3}
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button disabled={busy}>Adicionar requisito</button>
      </form>
    </Modal>
  );
}
function ServiceDetail({
  id,
  user,
  onClose,
}: {
  id: string;
  user: User;
  onClose: () => void;
}) {
  const data = useResource<ThirdParty>("/third-parties/" + id),
    [error, setError] = useState(""),
    [info, setInfo] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState(""),
    [notes, setNotes] = useState(""),
    [document, setDocument] = useState({
      name: "",
      reference: "",
      requirementId: "",
      verified: false,
    });
  const s = data.data;
  async function mutation(path: string, body: object, method = "POST") {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      setInfo("Registro salvo com histórico.");
      data.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={"Acompanhar " + id} onClose={onClose}>
      <State loading={data.loading} error={error || data.error} />
      {info && (
        <p className="success" role="status">
          {info}
        </p>
      )}
      {s && (
        <>
          <h3>{s.provider}</h3>
          <p>{s.description}</p>
          <Badge status={s.status} />
          <p>
            OS: {s.orderId} · Responsável: {s.internalOwner} · {s.daysInStage}{" "}
            dias na etapa
          </p>
          {canManage(user) && s.amount != null && (
            <p>
              Valor informado:{" "}
              {Number(s.amount).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          )}
          {s.pendingNotes && (
            <p className="error">
              Pendência: {s.pendingNotes}. Use Editar processo para registrar
              sua resolução.
            </p>
          )}
          {!s.executedAt && (
            <p className="muted">
              A execução ainda não tem data informada. Registre a data em Editar
              processo antes de avançar para Serviço executado.
            </p>
          )}
          <h3>Checklist configurado</h3>
          {!s.requirements?.length ? (
            <p>Nenhum requisito ativo foi definido pelo administrador.</p>
          ) : (
            <ul className="checklist">
              {s.requirements.map((req) => (
                <li key={req.id}>
                  <span>
                    {s.missingRequirements?.some((x) => x.id === req.id)
                      ? "○"
                      : "✓"}
                  </span>
                  {req.name}
                </li>
              ))}
            </ul>
          )}
          <h3>Referências documentais</h3>
          <p>
            Cadastro de referências e conferência manual. O envio e o
            armazenamento de arquivos serão implementados em etapa futura.
          </p>
          {s.documents.map((doc) => (
            <div className="document-row" key={doc.id}>
              <div>
                <strong>{doc.name}</strong>
                <p>
                  {doc.reference} · {doc.verified ? "Conferido" : "A conferir"}
                </p>
              </div>
              {canPlan(user) && s.status !== "FINISHED" && (
                <button
                  disabled={busy}
                  className="small secondary"
                  onClick={() =>
                    mutation(
                      "/third-parties/" + id + "/documents/" + doc.id,
                      { version: s.version, verified: !doc.verified },
                      "PATCH",
                    )
                  }
                >
                  {doc.verified ? "Reabrir conferência" : "Marcar conferido"}
                </button>
              )}
            </div>
          ))}
          {canPlan(user) && s.status !== "FINISHED" && (
            <details className="subform">
              <summary>Registrar documento por referência</summary>
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await mutation("/third-parties/" + id + "/documents", {
                      ...document,
                      requirementId: document.requirementId || null,
                      version: s.version,
                    })
                  )
                    setDocument({
                      name: "",
                      reference: "",
                      requirementId: "",
                      verified: false,
                    });
                }}
              >
                <label>
                  Nome do documento
                  <input
                    aria-label="Nome do documento"
                    required
                    minLength={3}
                    maxLength={160}
                    value={document.name}
                    onChange={(e) =>
                      setDocument({ ...document, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Requisito associado
                  <select
                    aria-label="Requisito associado"
                    value={document.requirementId}
                    onChange={(e) =>
                      setDocument({
                        ...document,
                        requirementId: e.target.value,
                      })
                    }
                  >
                    <option value="">Referência adicional</option>
                    {s.requirements?.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Referência ou localização do documento
                  <input
                    aria-label="Referência ou localização do documento"
                    required
                    minLength={3}
                    maxLength={500}
                    value={document.reference}
                    onChange={(e) =>
                      setDocument({ ...document, reference: e.target.value })
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={document.verified}
                    onChange={(e) =>
                      setDocument({ ...document, verified: e.target.checked })
                    }
                  />
                  Conferido manualmente
                </label>
                <div className="form-bottom">
                  <button disabled={busy}>Salvar referência documental</button>
                </div>
              </form>
            </details>
          )}
          {canPlan(user) && s.status !== "FINISHED" && (
            <section className="transition-box">
              <h3>Movimentar processo</h3>
              <p>
                A movimentação é uma decisão do responsável. Não executa
                pagamentos ou aprovações externas.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await mutation("/third-parties/" + id + "/transition", {
                      version: s.version,
                      status: target,
                      notes,
                    })
                  ) {
                    setTarget("");
                    setNotes("");
                  }
                }}
              >
                <label>
                  Próxima etapa
                  <select
                    aria-label="Próxima etapa"
                    required
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Selecione uma etapa permitida</option>
                    {(serviceTransitions[s.status] || [])
                      .filter(
                        (x) =>
                          canManage(user) ||
                          !["VALIDATED", "FINISHED"].includes(x),
                      )
                      .map((x) => (
                        <option key={x} value={x}>
                          {statusLabel[x]}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Justificativa da movimentação
                  <textarea
                    aria-label="Justificativa da movimentação"
                    required
                    minLength={3}
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Confirmar movimentação</button>
              </form>
            </section>
          )}
          <details className="subform">
            <summary>Preparar mensagem para central ou financeiro</summary>
            <p>
              Texto para revisão e envio manual. Nenhuma mensagem será enviada
              pelo sistema.
            </p>
            <textarea
              aria-label="Rascunho da mensagem"
              className="message-draft"
              readOnly
              value={s.draftMessage || ""}
            />
            <button
              className="secondary small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(s.draftMessage || "");
                  setInfo("Rascunho copiado. Revise antes de enviar.");
                } catch {
                  setError(
                    "Não foi possível copiar. Selecione o texto e copie manualmente.",
                  );
                }
              }}
            >
              Copiar rascunho
            </button>
          </details>
          <h3>Histórico de etapas</h3>
          <ol className="timeline">
            {s.movements?.map((m, i, all) => (
              <li key={m.id}>
                <strong>{statusLabel[m.status]}</strong>
                <p>
                  {fmt(m.occurredAt)} · {m.actor}
                </p>
                <p>{m.notes}</p>
                {i + 1 < all.length && (
                  <small>
                    {Math.max(
                      0,
                      Math.floor(
                        (new Date(all[i + 1].occurredAt).getTime() -
                          new Date(m.occurredAt).getTime()) /
                          3600000,
                      ),
                    )}{" "}
                    horas nesta etapa
                  </small>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}
