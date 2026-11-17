import { useState } from "react";
import { useResource } from "../hooks/useResource";
import { Modal, Pager, State, Empty } from "../components/OperationalUI";
import { query, fmt, type Page } from "../types/operations";
export function AuditPage() {
  const [q, setQ] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<any>(null);
  const data = useResource<Page<any>>(
    "/admin/audit?" +
      query({
        q,
        page,
        from: from ? new Date(from + "T00:00:00").toISOString() : "",
        to: to ? new Date(to + "T23:59:59").toISOString() : "",
      }),
  );
  return (
    <>
      <p className="muted">
        Inclusões, alterações, importações, acessos e controle de usuários.
        Senhas não são registradas na auditoria.
      </p>
      <div className="filters">
        <label>
          Pesquisar ação, pessoa ou registro
          <input
            aria-label="Pesquisar auditoria"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          De
          <input
            aria-label="Auditoria início"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            aria-label="Auditoria fim"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button className="secondary" onClick={data.refresh}>
          Atualizar
        </button>
      </div>
      <State {...data} />
      {data.data && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                {["Quando", "Quem", "Ação", "Entidade", "Detalhes"].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.createdAt)}</td>
                  <td>
                    {r.userName || "Sistema / não autenticado"}
                    <small>{r.userEmail || ""}</small>
                  </td>
                  <td>{r.action}</td>
                  <td>{r.entity}</td>
                  <td>
                    <button
                      className="small secondary"
                      onClick={() => setSelected(r)}
                    >
                      Ver alteração
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data.items.length && <Empty />}
          <Pager {...data.data} onChange={setPage} />
        </div>
      )}
      {selected && (
        <Modal title="Detalhes da auditoria" onClose={() => setSelected(null)}>
          <p>
            {fmt(selected.createdAt)} · {selected.userName || "Sistema"} ·{" "}
            {selected.action}
          </p>
          {selected.metadata?.before && (
            <>
              <h3>Antes</h3>
              <pre className="json-view">
                {JSON.stringify(selected.metadata.before, null, 2)}
              </pre>
            </>
          )}
          {selected.metadata?.after && (
            <>
              <h3>Depois</h3>
              <pre className="json-view">
                {JSON.stringify(selected.metadata.after, null, 2)}
              </pre>
            </>
          )}
          {!selected.metadata?.before && !selected.metadata?.after && (
            <pre className="json-view">
              {JSON.stringify(selected.metadata, null, 2)}
            </pre>
          )}
        </Modal>
      )}
    </>
  );
}
