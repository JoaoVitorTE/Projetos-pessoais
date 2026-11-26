import { useState } from "react";
import {
  Users as UsersIcon,
  Wrench,
  Layers3,
  Plus,
  Search,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  ShieldCheck,
  KeyRound,
  Mail,
  Trash2,
} from "lucide-react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import { Modal, State, Empty } from "../components/OperationalUI";
import type { User } from "../types/operations";
import { roleNames, roleDescriptions } from "../types/navigation";
type Account = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  technicianId: string | null;
  mustChangePassword: boolean;
};
type Registration = {
  id: string;
  name: string;
  specialty?: string;
  active?: boolean;
  user?: { name: string; email: string } | null;
};
type Secret = { email: string; password: string };
type Tab = "users" | "technicians" | "sectors";
export function AdministrationPage({
  user,
  onChanged,
  initialTab,
}: {
  user: User;
  onChanged: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(
    initialTab && !(initialTab === "users" && user.role !== "ADMIN")
      ? initialTab
      : user.role === "ADMIN"
        ? "users"
        : "technicians",
  );
  return (
    <>
      <section className="registration-intro">
        <span className="registration-intro-icon">
          <UsersIcon size={24} />
        </span>
        <div>
          <h2>A base de uma operação organizada.</h2>
          <p>
            Setores organizam os equipamentos. Técnicos executam as atividades.
            Usuários recebem acesso ao sistema.
          </p>
        </div>
      </section>
      <div className="registration-tabs" aria-label="Tipos de cadastro">
        {(
          [
            {
              id: "users",
              title: "Usuários",
              description: "Contas e permissões",
              icon: UsersIcon,
            },
            {
              id: "technicians",
              title: "Técnicos",
              description: "Equipe de execução",
              icon: Wrench,
            },
            {
              id: "sectors",
              title: "Setores",
              description: "Áreas da operação",
              icon: Layers3,
            },
          ] as const
        )
          .filter((t) => t.id !== "users" || user.role === "ADMIN")
          .map((t) => (
            <button
              className={tab === t.id ? "active" : ""}
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
            >
              <t.icon size={20} />
              <span>
                <b>{t.title}</b>
                <small>{t.description}</small>
              </span>
            </button>
          ))}
      </div>
      {tab === "users" ? (
        <Users current={user} onChanged={onChanged} />
      ) : (
        <Registrations key={tab} kind={tab} onChanged={onChanged} />
      )}
    </>
  );
}
function Users({
  current,
  onChanged,
}: {
  current: User;
  onChanged: () => void;
}) {
  const data = useResource<Account[]>("/admin/users"),
    tech = useResource<Registration[]>("/admin/technicians");
  const [editing, setEditing] = useState<Account | null | undefined>(),
    [secret, setSecret] = useState<Secret | null>(null),
    [reset, setReset] = useState<Account | null>(null),
    [removal, setRemoval] = useState<Account | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("ACTIVE"),
    [role, setRole] = useState("");
  const rows =
    data.data?.filter(
      (u) =>
        (status === "" || (status === "ACTIVE" ? u.active : !u.active)) &&
        (!role || u.role === role) &&
        (u.name + " " + u.email)
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    ) || [];
  return (
    <>
      <div className="action-row">
        <div>
          <h2>Quem pode acessar o PCM?</h2>
          <p>
            Crie a conta, escolha um perfil e entregue a senha temporária ao
            usuário.
          </p>
        </div>
        <button onClick={() => setEditing(null)}>
          <Plus size={17} />
          Criar usuário
        </button>
      </div>
      <div className="registration-filters">
        <label className="inline-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Pesquisar usuários"
            placeholder="Buscar nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Situação
          <select
            aria-label="Situação do usuário"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
            <option value="">Todos</option>
          </select>
        </label>
        <label>
          Perfil
          <select
            aria-label="Filtrar perfil"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Todos os perfis</option>
            {Object.entries(roleNames).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <State loading={data.loading} error={data.error || error} />
      {data.data && (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                {["Usuário", "E-mail", "Perfil", "Acesso", "Ações"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    {u.id === current.id && <small>Sua conta</small>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="role-badge">{roleNames[u.role]}</span>
                  </td>
                  <td>
                    <span
                      className={"access-state " + (u.active ? "active" : "")}
                    >
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                    {u.mustChangePassword && (
                      <small>Primeiro acesso pendente</small>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="small secondary"
                        onClick={() => setEditing(u)}
                      >
                        Editar
                      </button>
                      {u.id !== current.id && (
                        <button
                          className="small secondary"
                          onClick={() => {
                            setError("");
                            setReset(u);
                          }}
                        >
                          <KeyRound size={13} />
                          Redefinir senha
                        </button>
                      )}
                      {u.id !== current.id && (
                        <button
                          className="small secondary danger-text"
                          aria-label={"Remover " + u.name}
                          onClick={() => setRemoval(u)}
                        >
                          <Trash2 size={14} /> Remover
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty />}
          <p className="table-result-count">
            {rows.length} de {data.data.length} contas · Filtro inicial:
            usuários ativos
          </p>
        </section>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {removal && (
        <RemoveRegistration
          kind="users"
          row={removal}
          onClose={() => setRemoval(null)}
          onRemoved={(outcome) => {
            setRemoval(null);
            setNotice(
              outcome === "deactivated"
                ? "Conta desativada. O histórico foi preservado."
                : "Conta removida.",
            );
            data.refresh();
            onChanged();
          }}
        />
      )}
      {editing !== undefined && (
        <UserForm
          initial={editing}
          current={current}
          technicians={tech.data || []}
          onClose={() => setEditing(undefined)}
          onSaved={(result) => {
            setEditing(undefined);
            data.refresh();
            tech.refresh();
            onChanged();
            if ("temporaryPassword" in result && result.temporaryPassword)
              setSecret({
                email: result.user.email,
                password: result.temporaryPassword,
              });
          }}
        />
      )}
      {reset && (
        <Modal title="Redefinir senha" onClose={() => setReset(null)}>
          <p>
            As sessões de <strong>{reset.email}</strong> serão encerradas. Uma
            nova senha temporária será gerada, com troca obrigatória no próximo
            acesso.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setReset(null)}
            >
              Cancelar
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api(
                    "/admin/users/" + reset.id + "/reset-password",
                    { method: "POST" },
                  );
                  setSecret({
                    email: reset.email,
                    password: result.temporaryPassword,
                  });
                  setReset(null);
                  data.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Redefinindo…" : "Confirmar redefinição"}
            </button>
          </div>
        </Modal>
      )}
      {secret && (
        <SecretConfirmation secret={secret} onClose={() => setSecret(null)} />
      )}
    </>
  );
}
function SecretConfirmation({
  secret,
  onClose,
}: {
  secret: Secret;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Acesso preparado" onClose={onClose}>
      <div className="access-confirmation">
        <span className="confirmation-icon">
          <ShieldCheck size={28} />
        </span>
        <h3>Entregue o acesso ao usuário</h3>
        <p>
          A senha aparece apenas nesta confirmação. Compartilhe os dados por um
          canal autorizado.
        </p>
        <div className="access-email">
          <Mail size={17} />
          <strong>{secret.email}</strong>
        </div>
        <label>
          Senha temporária<pre className="secret-value">{secret.password}</pre>
        </label>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret.password);
              setCopied(true);
              setError("");
            } catch {
              setError("Selecione o texto da senha e copie manualmente.");
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
          {copied ? "Senha copiada" : "Copiar senha"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="form-guidance">
          No primeiro acesso, o usuário define uma nova senha e recebe o
          tutorial da plataforma. O sistema não envia e-mails automaticamente.
        </p>
        <button onClick={onClose}>
          Concluir
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
type Saved = Account | { user: Account; temporaryPassword: string };
function UserForm({
  initial,
  current,
  technicians,
  onClose,
  onSaved,
}: {
  initial: Account | null;
  current: User;
  technicians: Registration[];
  onClose: () => void;
  onSaved: (r: Saved) => void;
}) {
  const [form, setForm] = useState({
      name: initial?.name || "",
      email: initial?.email || "",
      role: initial?.role || "VIEWER",
      active: initial?.active ?? true,
      technicianId: initial?.technicianId || "",
    }),
    [step, setStep] = useState(1),
    [binding, setBinding] = useState<"existing" | "new">("existing"),
    [specialty, setSpecialty] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const self = initial?.id === current.id,
    needsTechnician = form.role === "TECHNICIAN",
    available = technicians.filter(
      (t) => (t.active && !t.user) || t.id === form.technicianId,
    );
  const identity = (
    <div className="form-grid">
      <label>
        Nome completo
        <input
          aria-label="Nome do usuário"
          required
          minLength={3}
          maxLength={120}
          placeholder="Como a pessoa será identificada"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      <label>
        E-mail de acesso
        <input
          aria-label="E-mail do usuário"
          type="email"
          required
          maxLength={200}
          placeholder="nome@empresa.com"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <small>Será usado para entrar na plataforma.</small>
      </label>
    </div>
  );
  const permissions = (
    <>
      <fieldset className="role-options">
        <legend>O que essa pessoa precisa fazer?</legend>
        {Object.entries(roleNames).map(([id, label]) => (
          <label key={id} className={form.role === id ? "selected" : ""}>
            <input
              type="radio"
              name="access-role"
              value={id}
              checked={form.role === id}
              disabled={self}
              onChange={() => setForm({ ...form, role: id, technicianId: "" })}
            />
            <span>
              <strong>{label}</strong>
              <small>{roleDescriptions[id]}</small>
            </span>
            {form.role === id && <Check size={17} />}
          </label>
        ))}
      </fieldset>
      {(needsTechnician || form.technicianId) && (
        <section className="technical-binding">
          <h3>Quem executará as atividades?</h3>
          <p>
            O vínculo permite que o usuário técnico aponte as próprias
            atividades.
          </p>
          {!initial && (
            <div className="tabs">
              <button
                type="button"
                className={binding === "existing" ? "" : "secondary"}
                onClick={() => setBinding("existing")}
              >
                Usar técnico cadastrado
              </button>
              <button
                type="button"
                className={binding === "new" ? "" : "secondary"}
                onClick={() => setBinding("new")}
              >
                Cadastrar técnico junto
              </button>
            </div>
          )}
          {binding === "new" && !initial ? (
            <label>
              Especialidade de {form.name}
              <input
                aria-label="Especialidade do novo técnico"
                required
                minLength={3}
                maxLength={120}
                placeholder="Ex.: manutenção elétrica"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              />
              <small>O cadastro técnico e a conta serão criados juntos.</small>
            </label>
          ) : (
            <label>
              Técnico responsável
              <select
                aria-label="Vínculo técnico"
                required={needsTechnician}
                value={form.technicianId}
                onChange={(e) =>
                  setForm({ ...form, technicianId: e.target.value })
                }
              >
                <option value="">Selecione um técnico</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.specialty}
                  </option>
                ))}
              </select>
              {!available.length && (
                <small>
                  Não há técnico disponível para vínculo.{" "}
                  {initial
                    ? "Cadastre-o na aba Técnicos antes de editar."
                    : "Use a opção “Cadastrar técnico junto”."}
                </small>
              )}
            </label>
          )}
        </section>
      )}
    </>
  );
  return (
    <Modal
      title={initial ? "Editar usuário" : "Criar acesso ao PCM"}
      onClose={onClose}
    >
      <form
        className="account-wizard"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (!initial && step < 3) {
            setStep(step + 1);
            return;
          }
          setBusy(true);
          try {
            const result = await api(
              "/admin/users" + (initial ? "/" + initial.id : ""),
              {
                method: initial ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...form,
                  technicianId:
                    needsTechnician && binding === "new" && !initial
                      ? null
                      : form.technicianId || null,
                  ...(needsTechnician && binding === "new" && !initial
                    ? { newTechnician: { name: form.name, specialty } }
                    : {}),
                }),
              },
            );
            onSaved(result);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!initial && (
          <ol className="wizard-progress">
            {["Identificação", "Permissões", "Conferência"].map((s, i) => (
              <li
                key={s}
                className={
                  i + 1 === step ? "active" : i + 1 < step ? "complete" : ""
                }
              >
                <span>{i + 1 < step ? <Check size={13} /> : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        )}
        {(initial || step === 1) && identity}
        {(initial || step === 2) && permissions}
        {!initial && step === 3 && (
          <section className="account-review">
            <h3>Confira antes de criar</h3>
            <dl>
              <dt>Usuário</dt>
              <dd>{form.name}</dd>
              <dt>E-mail de acesso</dt>
              <dd>{form.email}</dd>
              <dt>Perfil</dt>
              <dd>{roleNames[form.role]}</dd>
              {needsTechnician && (
                <>
                  <dt>Técnico vinculado</dt>
                  <dd>
                    {binding === "new"
                      ? form.name + " · " + specialty
                      : technicians.find((t) => t.id === form.technicianId)
                          ?.name}
                  </dd>
                </>
              )}
            </dl>
            <p>
              <KeyRound size={18} />
              Uma senha temporária será gerada. A pessoa deverá trocá-la ao
              entrar pela primeira vez.
            </p>
          </section>
        )}
        {initial && (
          <label className="check-label">
            <input
              type="checkbox"
              disabled={self}
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Acesso ativo
          </label>
        )}
        {self && (
          <p className="form-guidance">
            Sua conta mantém o perfil e o acesso ativo. Use “Minha senha” para
            trocar sua própria senha.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="wizard-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (!initial && step > 1) {
                setStep(step - 1);
                setError("");
              } else onClose();
            }}
          >
            {!initial && step > 1 ? (
              <>
                <ArrowLeft size={16} />
                Voltar
              </>
            ) : (
              "Cancelar"
            )}
          </button>
          <button disabled={busy}>
            {busy
              ? "Salvando…"
              : initial
                ? "Salvar alterações"
                : step < 3
                  ? "Continuar"
                  : "Criar usuário"}
            {step < 3 && !initial ? (
              <ArrowRight size={16} />
            ) : (
              <Check size={16} />
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RemoveRegistration({
  kind,
  row,
  onClose,
  onRemoved,
}: {
  kind: Tab;
  row: { id: string; name: string; email?: string };
  onClose: () => void;
  onRemoved: (outcome: "deleted" | "deactivated") => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Remover cadastro"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        <strong>{row.name}</strong>
        {row.email && " · " + row.email}
      </p>
      <p>
        {kind === "sectors"
          ? "A exclusão é definitiva para setores sem equipamentos vinculados."
          : "O cadastro será excluído se estiver sem vínculos. Se houver histórico, será desativado."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row-actions">
        <button className="secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="danger-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const { outcome } = await api(
                "/admin/" + kind + "/" + encodeURIComponent(row.id),
                { method: "DELETE" },
              );
              onRemoved(outcome);
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Removendo…" : "Confirmar remoção"}
        </button>
      </div>
    </Modal>
  );
}
function Registrations({
  kind,
  onChanged,
}: {
  kind: "technicians" | "sectors";
  onChanged: () => void;
}) {
  const data = useResource<Registration[]>("/admin/" + kind),
    [edit, setEdit] = useState<Registration | null | undefined>(),
    [name, setName] = useState(""),
    [specialty, setSpecialty] = useState(""),
    [active, setActive] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [onlyActive, setOnlyActive] = useState(true),
    [removal, setRemoval] = useState<Registration | null>(null),
    [notice, setNotice] = useState("");
  const technician = kind === "technicians";
  function open(row: Registration | null) {
    setEdit(row);
    setName(row?.name || "");
    setSpecialty(row?.specialty || "");
    setActive(row?.active ?? true);
    setError("");
  }
  const rows =
    data.data?.filter(
      (r) =>
        (!technician || !onlyActive || r.active) &&
        (r.name + " " + (r.specialty || ""))
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    ) || [];
  return (
    <>
      <div className="action-row">
        <div>
          <h2>
            {technician ? "Sua equipe de manutenção" : "Áreas da operação"}
          </h2>
          <p>
            {technician
              ? "Cadastre o profissional e a especialidade para atribuir ordens, planos e horários."
              : "Comece pelos setores. Eles agrupam equipamentos e ajudam a filtrar os indicadores."}
          </p>
        </div>
        <button onClick={() => open(null)}>
          <Plus size={17} />
          {technician ? "Cadastrar técnico" : "Cadastrar setor"}
        </button>
      </div>
      <div className="registration-filters">
        <label className="inline-search">
          <Search size={17} />
          <input
            aria-label="Pesquisar cadastros"
            type="search"
            placeholder={
              technician ? "Buscar técnico ou especialidade" : "Buscar setor"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {technician && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            Somente técnicos ativos
          </label>
        )}
      </div>
      {technician && (
        <p className="form-guidance">
          <UsersIcon size={17} />O cadastro técnico permite atribuir atividades.
          Para entrar no PCM, ele também precisa de uma conta na aba Usuários,
          criada pelo administrador.
        </p>
      )}
      <State {...data} />
      {data.data && (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                {technician && (
                  <>
                    <th>Especialidade</th>
                    <th>Situação</th>
                    <th>Conta de acesso</th>
                  </>
                )}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  {technician && (
                    <>
                      <td>{r.specialty}</td>
                      <td>
                        <span
                          className={
                            "access-state " + (r.active ? "active" : "")
                          }
                        >
                          {r.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>{r.user?.email || "Sem conta vinculada"}</td>
                    </>
                  )}
                  <td>
                    <div className="row-actions">
                      <button
                        className="small secondary"
                        onClick={() => open(r)}
                      >
                        Editar
                      </button>
                      <button
                        className="small secondary danger-text"
                        aria-label={"Remover " + r.name}
                        onClick={() => setRemoval(r)}
                      >
                        <Trash2 size={14} /> Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty />}
          <p className="table-result-count">
            {rows.length} cadastros encontrados
          </p>
        </section>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {removal && (
        <RemoveRegistration
          kind={kind}
          row={removal}
          onClose={() => setRemoval(null)}
          onRemoved={(outcome) => {
            setRemoval(null);
            setNotice(
              outcome === "deactivated"
                ? "Técnico desativado. O histórico foi preservado."
                : "Cadastro removido.",
            );
            data.refresh();
            onChanged();
          }}
        />
      )}
      {edit !== undefined && (
        <Modal
          title={
            (edit ? "Editar " : "Cadastrar ") +
            (technician ? "técnico" : "setor")
          }
          onClose={() => setEdit(undefined)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/admin/" + kind + (edit ? "/" + edit.id : ""), {
                  method: edit ? "PATCH" : "POST",
                  body: JSON.stringify(
                    technician ? { name, specialty, active } : { name },
                  ),
                });
                setEdit(undefined);
                data.refresh();
                onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="form-guidance">
              {technician
                ? "Informe o profissional que poderá executar as atividades de manutenção."
                : "Use o nome pelo qual a área é conhecida na operação."}
            </p>
            <label>
              {technician ? "Nome completo" : "Nome do setor"}
              <input
                aria-label="Nome do cadastro"
                required
                minLength={3}
                maxLength={120}
                placeholder={
                  technician ? "Ex.: nome do profissional" : "Ex.: Montagem"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {technician && (
              <>
                <label>
                  Especialidade
                  <input
                    aria-label="Especialidade"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Ex.: mecânica industrial"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Técnico ativo
                </label>
                {edit && (
                  <p className="hint">
                    Desativar preserva o histórico e impede novas atribuições.
                  </p>
                )}
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="wizard-actions">
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setEdit(undefined)}
              >
                Cancelar
              </button>
              <button disabled={busy}>
                {busy ? "Salvando…" : "Salvar cadastro"}
                <Check size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
