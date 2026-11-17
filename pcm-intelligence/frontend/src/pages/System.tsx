import { useResource } from "../hooks/useResource";
import { State } from "../components/OperationalUI";
import { fmt } from "../types/operations";
export function SystemPage({ tab }: { tab: "users" | "audit" }) {
  const r = useResource<Record<string, any>[]>(
    tab === "users" ? "/admin/users" : "/audit",
  );
  return (
    <section className="panel table-wrap">
      <div className="action-row">
        <p>
          {tab === "users"
            ? "Perfis cadastrados. Gestão de usuários e recuperação de senha serão adicionadas em etapa futura."
            : "Últimos 50 eventos de acesso e alterações."}
        </p>
        <button className="secondary" onClick={r.refresh}>
          Atualizar
        </button>
      </div>
      <State {...r} />
      {r.data && (
        <table>
          <thead>
            <tr>
              {(tab === "users"
                ? ["Nome", "E-mail", "Perfil", "Técnico"]
                : ["Data", "Usuário", "Ação", "Entidade"]
              ).map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.data.map((x) => (
              <tr key={x.id}>
                {(tab === "users"
                  ? [x.name, x.email, x.role, x.technicianId || "—"]
                  : [
                      fmt(x.createdAt),
                      x.user?.name || "Não autenticado",
                      x.action,
                      x.entity,
                    ]
                ).map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
