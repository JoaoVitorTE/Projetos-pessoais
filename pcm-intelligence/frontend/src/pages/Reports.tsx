import { SapReports } from "./SapReports";
import { useState } from "react";
import { useResource } from "../hooks/useResource";
import { Empty, State } from "../components/OperationalUI";
import { fmt, query, type Lookups, type User } from "../types/operations";
type Report = {
  generatedAt: string;
  executive: string;
  summary: {
    plans: number;
    openOrders: number;
    overdue: number;
    withoutSchedule: number;
  };
  items: {
    id: string;
    kind: string;
    equipment: string;
    sector: string;
    type: string;
    description: string;
    technician: string;
    status: string;
    dueAt: string | null;
    overdue: boolean;
  }[];
};
export function ReportsPage({
  lookups,
  user,
}: {
  lookups: Lookups;
  user: User;
}) {
  const [sap, setSap] = useState(true);
  return (
    <>
      <div className="tabs">
        <button className={sap ? "" : "secondary"} onClick={() => setSap(true)}>
          Horas e notas SAP
        </button>
        <button
          className={sap ? "secondary" : ""}
          onClick={() => setSap(false)}
        >
          Preventivas
        </button>
      </div>
      {sap ? (
        <SapReports lookups={lookups} user={user} />
      ) : (
        <PreventiveReports lookups={lookups} />
      )}
    </>
  );
}
function PreventiveReports({ lookups }: { lookups: Lookups }) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [sectorId, setSector] = useState(""),
    [equipmentId, setEquipment] = useState(""),
    [overdue, setOverdue] = useState(false);
  const params = query({
    from: from ? new Date(from + "T00:00:00").toISOString() : "",
    to: to ? new Date(to + "T23:59:59").toISOString() : "",
    sectorId,
    equipmentId,
    overdue: overdue ? "true" : "",
  });
  const data = useResource<Report>("/reports/preventives?" + params);
  return (
    <>
      <div className="action-row">
        <p>
          Planos ativos e ordens preventivas ou de lubrificação ainda abertas.
          Datas ausentes permanecem como “sem programação”.
        </p>
        <div className="row-actions">
          <a
            className="button-link secondary"
            href={"/api/reports/preventives.pdf?" + params}
          >
            Exportar PDF
          </a>
          <a
            className="button-link"
            href={"/api/reports/preventives.xlsx?" + params}
          >
            Exportar Excel
          </a>
        </div>
      </div>
      <div className="filters">
        <label>
          Vencimento a partir de
          <input
            aria-label="Relatório início"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Vencimento até
          <input
            aria-label="Relatório fim"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Setor
          <select
            aria-label="Setor do relatório"
            value={sectorId}
            onChange={(e) => {
              setSector(e.target.value);
              setEquipment("");
            }}
          >
            <option value="">Todos</option>
            {lookups.sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Equipamento
          <select
            aria-label="Equipamento do relatório"
            value={equipmentId}
            onChange={(e) => setEquipment(e.target.value)}
          >
            <option value="">Todos</option>
            {lookups.equipment
              .filter((e) => !sectorId || e.sectorId === sectorId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id}
                </option>
              ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
          />
          Somente vencidos
        </label>
        <button className="secondary" onClick={data.refresh}>
          Atualizar
        </button>
      </div>
      <State {...data} />
      {data.data && (
        <>
          <section className="panel import-section">
            <h2>Resumo executivo</h2>
            <p>{data.data.executive}</p>
            <small>
              Consulta em {fmt(data.data.generatedAt)}. Plano e OS são registros
              distintos; seus totais não representam atividades únicas.
            </small>
          </section>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Identificador",
                    "Categoria",
                    "Equipamento / setor",
                    "Atividade",
                    "Responsável",
                    "Situação",
                    "Vencimento",
                  ].map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((i, n) => (
                  <tr key={i.kind + i.id + n}>
                    <td className="code">{i.id}</td>
                    <td>{i.kind}</td>
                    <td>
                      {i.equipment}
                      <small>{i.sector}</small>
                    </td>
                    <td>
                      {i.type}
                      <small>{i.description}</small>
                    </td>
                    <td>{i.technician}</td>
                    <td>{i.status}</td>
                    <td className={i.overdue ? "overdue" : ""}>
                      {i.dueAt ? fmt(i.dueAt) : "Sem programação"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.data.items.length && <Empty />}
          </div>
        </>
      )}
    </>
  );
}
