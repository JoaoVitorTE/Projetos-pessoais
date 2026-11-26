import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty, Modal, State } from "../components/OperationalUI";
import { useResource } from "../hooks/useResource";
import { api } from "../services/api";
import {
  canPlan,
  equipmentCode,
  query,
  type Lookups,
  type User,
} from "../types/operations";

type Values = Record<string, string>;
type Point = { label: string; value: string | number };
type Detail = {
  key: string;
  orderNumber: string;
  orderReceived: boolean;
  personnelNumber: string;
  date: string;
  hours: string | null;
  review: string | null;
  fields: Values;
};
type Note = {
  number: string;
  date: string;
  daysOpen: number | null;
  orderNumber: string | null;
  fields: Values;
  orders: { number: string; localOrderId: string | null }[];
};
type Report = {
  today: string;
  equipment: Pick<
    Lookups["equipment"][number],
    "id" | "tag" | "name" | "sector"
  >[];
  hours: string;
  excluded: number;
  technicians: {
    personnelNumber: string;
    name: string;
    orders: number;
    confirmations: number;
    hours: string;
    excluded: number;
  }[];
  details: Detail[];
  pending: Note[];
  linked: Note[];
  orders: {
    number: string;
    date: string;
    orderType: string;
    workCenter: string;
    description: string;
  }[];
  charts: { evolution: Point[]; orders: Point[]; notes: Point[] };
};
const formatHours = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
const shortDate = (date?: string) =>
  date ? date.slice(0, 10).split("-").reverse().join("/") : "—";

function Chart({
  title,
  date,
  data,
}: {
  title: string;
  date: string;
  data: Point[];
}) {
  const points = data.map(({ label, value }) => ({
    label,
    value: Number(value),
  }));
  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="muted">{date}</p>
      {!data.length ? (
        <Empty />
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(180, points.length * 29 + 40)}
        >
          <BarChart data={points} layout="vertical" margin={{ right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              allowDecimals={typeof data[0]?.value === "string"}
            />
            <YAxis type="category" dataKey="label" width={112} interval={0} />
            <Tooltip />
            <Bar
              dataKey="value"
              name={title}
              fill="#087e8b"
              isAnimationActive={false}
              barSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

function NoteTable({
  notes,
  onOrder,
  linked = false,
}: {
  notes: Note[];
  onOrder: (number: string) => void;
  linked?: boolean;
}) {
  if (!notes.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nota</th>
            <th>Descrição</th>
            <th>Equipamento ou local</th>
            <th>Data</th>
            <th>{linked ? "Ordem" : "Dias em aberto"}</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => (
            <tr key={note.number}>
              <td className="code">{note.number}</td>
              <td>{note.fields.description || "—"}</td>
              <td>
                {note.fields.equipmentName ||
                  note.fields.equipmentNumber ||
                  note.fields.tag ||
                  note.fields.locationName ||
                  note.fields.locationCode ||
                  "—"}
              </td>
              <td>{shortDate(note.date)}</td>
              <td>
                {linked
                  ? note.orders.length
                    ? note.orders.map((order) => (
                        <button
                          className="secondary small"
                          key={order.number}
                          onClick={() => onOrder(order.number)}
                        >
                          {order.number}
                        </button>
                      ))
                    : `${note.orderNumber} · Aguardando importação`
                  : (note.daysOpen ?? "Sem data")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SapReports({
  lookups,
  user,
}: {
  lookups: Lookups;
  user: User;
}) {
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    technician: "",
    center: "",
    type: "",
    equipment: "",
    interval: "day",
  });
  const [tech, setTech] = useState<string | null>(null);
  const [order, setOrder] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const params = query(filters);
  const resource = useResource<Report>("/reports/sap?" + params);
  const report = resource.data;
  const change = (field: keyof typeof filters, value: string) => {
    setTech(null);
    setFilters((previous) => ({ ...previous, [field]: value }));
  };
  return (
    <>
      <div className="action-row">
        <h2>Relatórios SAP</h2>
        <div className="row-actions">
          <a
            className="button-link secondary"
            href={"/api/reports/sap.pdf?" + params}
          >
            Exportar PDF
          </a>
          <a className="button-link" href={"/api/reports/sap.xlsx?" + params}>
            Exportar Excel
          </a>
        </div>
      </div>
      <div className="filters">
        {(
          [
            ["from", "De", "date"],
            ["to", "Até", "date"],
            ["technician", "Matrícula", "text"],
            ["center", "Centro de trabalho SAP", "text"],
            ["type", "Tipo de ordem SAP", "text"],
          ] as const
        ).map(([field, label, type]) => (
          <label key={field}>
            {label}
            <input
              type={type}
              value={filters[field]}
              onChange={(event) => change(field, event.target.value)}
            />
          </label>
        ))}
        <label>
          Equipamento
          <select
            value={filters.equipment}
            onChange={(event) => change("equipment", event.target.value)}
          >
            <option value="">Todos</option>
            {(report?.equipment ?? lookups.equipment).map((item) => (
              <option key={item.id} value={item.id}>
                {equipmentCode(item)} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evolução
          <select
            value={filters.interval}
            onChange={(event) => change("interval", event.target.value)}
          >
            <option value="day">Dia</option>
            <option value="week">Semana</option>
          </select>
        </label>
        <button className="secondary" onClick={resource.refresh}>
          Atualizar
        </button>
      </div>
      <State {...resource} />
      {report && !resource.loading && !resource.error && (
        <>
          <section className="panel">
            <h3>Horas por técnico</h3>
            <p>
              {formatHours(report.hours)} h · {report.excluded} apontamento(s)
              fora da soma · Data de início do apontamento
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Matrícula",
                      "Técnico",
                      "Ordens distintas",
                      "Apontamentos",
                      "Horas",
                      "Fora da soma",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.technicians.map((item) => (
                    <tr key={item.personnelNumber}>
                      <td>
                        <button
                          className="small secondary"
                          onClick={() => setTech(item.personnelNumber)}
                        >
                          {item.personnelNumber}
                        </button>
                      </td>
                      <td>{item.name || "—"}</td>
                      <td>{item.orders}</td>
                      <td>{item.confirmations}</td>
                      <td>{formatHours(item.hours)}</td>
                      <td>{item.excluded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.technicians.length && <Empty />}
          </section>
          <div className="chart-grid">
            <Chart
              title="Horas por técnico"
              date="Data de início do apontamento"
              data={report.technicians.map((item) => ({
                label: item.personnelNumber,
                value: item.hours,
              }))}
            />
            <Chart
              title="Evolução das horas"
              date={
                filters.interval === "week"
                  ? "Semana da data de início do apontamento, a partir de segunda-feira"
                  : "Data de início do apontamento"
              }
              data={report.charts.evolution}
            />
            <Chart
              title="Ordens por tipo e centro de trabalho"
              date="Data de entrada da ordem SAP"
              data={report.charts.orders}
            />
            <Chart
              title="Notas pendentes por tempo em aberto"
              date={`Data da nota até ${shortDate(report.today)}`}
              data={report.charts.notes}
            />
          </div>
          <section className="panel">
            <h3>Notas sem ordem ({report.pending.length})</h3>
            <NoteTable notes={report.pending} onOrder={setOrder} />
            <details>
              <summary>Notas com ordem ({report.linked.length})</summary>
              <NoteTable notes={report.linked} linked onOrder={setOrder} />
            </details>
          </section>
          <section className="panel">
            <h3>Ordens SAP ({report.orders.length})</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ordem</th>
                    <th>Data de entrada</th>
                    <th>Tipo</th>
                    <th>Centro</th>
                    <th>Descritivo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.orders.map((item) => (
                    <tr key={item.number}>
                      <td>
                        <button
                          className="secondary small"
                          onClick={() => setOrder(item.number)}
                        >
                          {item.number}
                        </button>
                      </td>
                      <td>{shortDate(item.date)}</td>
                      <td>{item.orderType || "—"}</td>
                      <td>{item.workCenter || "—"}</td>
                      <td>{item.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.orders.length && <Empty />}
          </section>
          {tech && !order && !review && (
            <Modal
              title={"Apontamentos · " + tech}
              onClose={() => setTech(null)}
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Ordem",
                        "Confirmação / contador",
                        "Data",
                        "Início",
                        "Fim",
                        "Horas SAP",
                        "Registrado por",
                        "Texto e revisão",
                      ].map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.details
                      .filter((item) => item.personnelNumber === tech)
                      .map((item) => (
                        <tr key={item.key}>
                          <td>
                            {item.orderReceived ? (
                              <button
                                className="secondary small"
                                onClick={() => setOrder(item.orderNumber)}
                              >
                                {item.orderNumber}
                              </button>
                            ) : (
                              <>
                                {item.orderNumber}
                                <small>Aguardando ordem SAP</small>
                              </>
                            )}
                          </td>
                          <td>
                            {[item.fields.confirmationId, item.fields.counter]
                              .filter(Boolean)
                              .join(" / ") || "—"}
                          </td>
                          <td>{shortDate(item.date)}</td>
                          <td>{item.fields.startTime || "—"}</td>
                          <td>{item.fields.endTime || "—"}</td>
                          <td>
                            {item.hours === null
                              ? "—"
                              : item.hours.replace(".", ",")}
                          </td>
                          <td>{item.fields.registeredBy || "—"}</td>
                          <td>
                            {item.fields.confirmationText || "—"}
                            {item.review && (
                              <small className="error">{item.review}</small>
                            )}
                            {item.review && canPlan(user) && (
                              <button
                                className="secondary small"
                                onClick={() => setReview(item.key)}
                              >
                                Revisar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Modal>
          )}
        </>
      )}
      {order && (
        <SapOrderDetails number={order} onClose={() => setOrder(null)} />
      )}
      {review && (
        <ConfirmationReview
          recordKey={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            resource.refresh();
          }}
        />
      )}
    </>
  );
}

export function SapOrderDetails({
  number,
  onClose,
}: {
  number: string;
  onClose: () => void;
}) {
  const resource = useResource<{
    localOrderId: string | null;
    fields: { columns: { header: string; value: string }[] };
  }>("/reports/sap/orders/" + encodeURIComponent(number));
  return (
    <Modal title={"Ordem SAP · " + number} onClose={onClose}>
      <State {...resource} />
      {resource.data && (
        <>
          {resource.data.localOrderId ? (
            <a
              className="button-link secondary"
              href={
                "#orders?record=" +
                encodeURIComponent(resource.data.localOrderId)
              }
              onClick={onClose}
            >
              Abrir OS no PCM
            </a>
          ) : (
            <p>OS aguardando conferência do equipamento.</p>
          )}
          <dl>
            {resource.data.fields.columns
              .filter((column) => column.value)
              .map((column, index) => (
                <div key={index}>
                  <dt>{column.header || `Coluna ${index + 1}`}</dt>
                  <dd>{column.value}</dd>
                </div>
              ))}
          </dl>
        </>
      )}
    </Modal>
  );
}

function ConfirmationReview({
  recordKey,
  onClose,
  onSaved,
}: {
  recordKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const resource = useResource<{
    record: { fingerprint: string; review: string; fields: Values };
    candidates: { key: string; hours: string | null; fields: Values }[];
  }>("/sap/confirmation-review/" + encodeURIComponent(recordKey));
  const [selection, setSelection] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Revisar apontamento SAP" onClose={onClose}>
      <State {...resource} />
      {resource.data && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selection) return;
            setBusy(true);
            setError("");
            try {
              await api(
                "/sap/confirmation-review/" + encodeURIComponent(recordKey),
                {
                  method: "POST",
                  body: JSON.stringify({
                    fingerprint: resource.data?.record.fingerprint,
                    replace: selection === "new" ? undefined : selection,
                  }),
                },
              );
              onSaved();
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>{resource.data.record.review}</p>
          <p>
            Ordem {resource.data.record.fields.orderNumber} · Matrícula{" "}
            {resource.data.record.fields.personnelNumber} ·{" "}
            {resource.data.record.fields.hours || "Sem horas"}
          </p>
          <p>{resource.data.record.fields.confirmationText}</p>
          <label>
            Decisão após conferir o SAP
            <select
              required
              disabled={busy}
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="">Selecione</option>
              <option value="new">Confirmar como novo apontamento</option>
              {resource.data.candidates.map((prior) => (
                <option key={prior.key} value={prior.key}>
                  Corrigir registro ·{" "}
                  {prior.fields.startTime || "Sem hora inicial"} ·{" "}
                  {prior.hours ? prior.hours + " h" : "horas em revisão"} ·{" "}
                  {prior.fields.confirmationId ||
                    prior.fields.confirmationText ||
                    "Sem confirmação"}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy || !selection}>Salvar revisão</button>
        </form>
      )}
    </Modal>
  );
}
