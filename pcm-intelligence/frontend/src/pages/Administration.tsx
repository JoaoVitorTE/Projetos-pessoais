import { useState } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import { Modal, State, Empty } from "../components/OperationalUI";
import type { User, Lookups } from "../types/operations";
type Account = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  technicianId: string | null;
  mustChangePassword: boolean;
};
type Tech = {
  id: string;
  name: string;
  specialty: string;
  active: boolean;
  user?: { name: string; email: string } | null;
};
const roles: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  PLANNER: "Planejador PCM",
  TECHNICIAN: "Técnico",
  VIEWER: "Visualizador",
};
export function AdministrationPage({
  user,
  onChanged,
}: {
  user: User;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState(
    user.role === "ADMIN" ? "users" : "technicians",
  );
  return (
    <>
      <div className="tabs">
        {[
          ["users", "Usuários"],
          ["technicians", "Técnicos"],
          ["sectors", "Setores"],
        ]
          .filter(([id]) => id !== "users" || user.role === "ADMIN")
          .map(([id, label]) => (
            <button
              className={tab === id ? "" : "secondary"}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
      </div>
      {tab === "users" ? (
        <Users current={user} />
      ) : (
        <Registrations
          key={tab}
          kind={tab as "technicians" | "sectors"}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
function Users({ current }: { current: User }) {
  const data = useResource<Account[]>("/admin/users"),
    tech = useResource<Tech[]>("/admin/technicians"),
    [editing, setEditing] = useState<Account | null | undefined>(),
    [secret, setSecret] = useState<{ email: string; password: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [reset, setReset] = useState<Account | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="action-row">
        <p>
          Cadastre o usuário, defina o perfil e compartilhe a senha temporária
          por um canal autorizado. Não há envio automático de e-mail.
        </p>
        <button onClick={() => setEditing(null)}>Criar usuário</button>
      </div>
      <State loading={data.loading} error={error || data.error} />
      {data.data && (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                {["Usuário", "E-mail", "Perfil", "Acesso", "Ações"].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === current.id && <small>Sua conta</small>}
                  </td>
                  <td>{u.email}</td>
                  <td>{roles[u.role]}</td>
                  <td>
                    {u.active ? "Ativo" : "Inativo"}
                    {u.mustChangePassword && (
                      <small>Troca de senha obrigatória</small>
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
                          onClick={() => setReset(u)}
                        >
                          Redefinir senha
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
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
            if (result.temporaryPassword)
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
            As sessões de {reset.email} serão encerradas e uma nova senha
            temporária será exigida. A conta manterá seu perfil.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
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
            Confirmar redefinição
          </button>
        </Modal>
      )}
      {secret && (
        <Modal title="Senha temporária criada" onClose={() => setSecret(null)}>
          <p>
            A senha será exibida apenas nesta confirmação. Compartilhe-a com o
            destinatário por um canal autorizado.
          </p>
          <p>
            <strong>{secret.email}</strong>
          </p>
          <pre className="secret-value">{secret.password}</pre>
          <p>O usuário precisará definir uma nova senha no primeiro acesso.</p>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret.password);
              } catch {
                setError("Selecione e copie a senha manualmente.");
              }
            }}
          >
            Copiar senha
          </button>
        </Modal>
      )}
    </>
  );
}
function UserForm({
  initial,
  current,
  technicians,
  onClose,
  onSaved,
}: {
  initial: Account | null;
  current: User;
  technicians: Tech[];
  onClose: () => void;
  onSaved: (result: any) => void;
}) {
  const [form, setForm] = useState({
      name: initial?.name || "",
      email: initial?.email || "",
      role: initial?.role || "VIEWER",
      active: initial?.active ?? true,
      technicianId: initial?.technicianId || "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={initial ? "Editar usuário" : "Novo usuário"}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await api(
              "/admin/users" + (initial ? "/" + initial.id : ""),
              {
                method: initial ? "PATCH" : "POST",
                body: JSON.stringify({
                  ...form,
                  technicianId: form.technicianId || null,
                }),
              },
            );
            onSaved(r);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input
            aria-label="Nome do usuário"
            required
            minLength={3}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          E-mail
          <input
            aria-label="E-mail do usuário"
            required
            type="email"
            maxLength={200}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Perfil
          <select
            aria-label="Perfil"
            disabled={initial?.id === current.id}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {Object.entries(roles).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vínculo técnico
          <select
            aria-label="Vínculo técnico"
            required={form.role === "TECHNICIAN"}
            value={form.technicianId}
            onChange={(e) => setForm({ ...form, technicianId: e.target.value })}
          >
            <option value="">Sem vínculo</option>
            {technicians
              .filter((t) => t.active || t.id === form.technicianId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {!t.active ? " (inativo)" : ""}
                </option>
              ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            disabled={initial?.id === current.id}
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Acesso ativo
        </label>
        <div className="form-bottom">
          {!initial && (
            <p>
              Uma senha aleatória será gerada. Ela não será registrada nos logs.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Salvando…" : "Salvar usuário"}
          </button>
        </div>
      </form>
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
  const data = useResource<any[]>("/admin/" + kind),
    [edit, setEdit] = useState<any | undefined>(),
    [name, setName] = useState(""),
    [specialty, setSpecialty] = useState(""),
    [active, setActive] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function open(row: any | null) {
    setEdit(row);
    setName(row?.name || "");
    setSpecialty(row?.specialty || "");
    setActive(row?.active ?? true);
    setError("");
  }
  return (
    <>
      <div className="action-row">
        <p>
          {kind === "technicians"
            ? "Técnicos podem ser vinculados a usuários e atividades. Desativar não apaga seu histórico."
            : "Cadastre os setores antes de registrar equipamentos ou escolha criação de referências na importação."}
        </p>
        <button onClick={() => open(null)}>
          {kind === "technicians" ? "Cadastrar técnico" : "Cadastrar setor"}
        </button>
      </div>
      <State {...data} />
      {data.data && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                {kind === "technicians" && (
                  <>
                    <th>Especialidade</th>
                    <th>Situação</th>
                    <th>Usuário vinculado</th>
                  </>
                )}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.name}</td>
                  {kind === "technicians" && (
                    <>
                      <td>{r.specialty}</td>
                      <td>{r.active ? "Ativo" : "Inativo"}</td>
                      <td>{r.user?.email || "Nenhum"}</td>
                    </>
                  )}
                  <td>
                    <button className="small secondary" onClick={() => open(r)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data.length && <Empty />}
        </div>
      )}
      {edit !== undefined && (
        <Modal
          title={
            kind === "technicians" ? "Cadastro de técnico" : "Cadastro de setor"
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
                    kind === "technicians"
                      ? { name, specialty, active }
                      : { name },
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
            <label>
              Nome
              <input
                aria-label="Nome do cadastro"
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {kind === "technicians" && (
              <>
                <label>
                  Especialidade
                  <input
                    aria-label="Especialidade"
                    required
                    minLength={3}
                    maxLength={120}
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
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy}>
              {busy ? "Salvando…" : "Salvar cadastro"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
