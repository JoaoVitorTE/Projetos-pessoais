import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { Lookups } from "../types/operations";
import { query, statusLabel } from "../types/operations";
import { FleetFilters, emptyFleet, State } from "../components/OperationalUI";
import { useResource } from "../hooks/useResource";
type Data = {
  period: { from: string; to: string };
  indicators: {
    equipment: number;
    running: number;
    stopped: number;
    unknown: number;
    interruptions: number;
    downtimeMinutes: number;
    openOrders: number;
    overduePlans: number;
    upcomingPlans: number;
    compliancePercent: number | null;
  };
  trend: {
    date: string;
    minutes: number;
    count: number;
    planned: number;
    done: number;
  }[];
  failuresByEquipment: { name: string; count: number; minutes: number }[];
  causes: { name: string; minutes: number }[];
  orderStatus: { status: string; count: number }[];
  definitions: string[];
};
const colors = [
  "var(--chart-green)",
  "var(--chart-blue)",
  "#f0ae4c",
  "#db7465",
  "#7e72b3",
  "#679c9b",
  "#5eae72",
  "#9ba9b6",
];
export function Dashboard({ lookups }: { lookups: Lookups }) {
  const [fleet, setFleet] = useState(emptyFleet),
    [from, setFrom] = useState(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    ),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const resource = useResource<Data>(
    "/dashboard?" +
      query({
        ...fleet,
        from: new Date(from + "T00:00:00").toISOString(),
        to: new Date(to + "T23:59:59").toISOString(),
      }),
  );
  const d = resource.data;
  const cards = d
    ? [
        ["Equipamentos", d.indicators.equipment],
        ["Operando agora", d.indicators.running],
        ["Paradas / manutenção", d.indicators.stopped],
        ["Interrupções no período", d.indicators.interruptions],
        [
          "Parada acumulada",
          `${(d.indicators.downtimeMinutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`,
        ],
        ["OS abertas agora", d.indicators.openOrders],
        ["Planos vencidos agora", d.indicators.overduePlans],
        ["Planos nos próximos 7 dias", d.indicators.upcomingPlans],
        [
          "Cumprimento observado",
          d.indicators.compliancePercent === null
            ? "Sem previsão"
            : d.indicators.compliancePercent + "%",
        ],
      ]
    : [];
  return (
    <>
      <div className="filters">
        <label>
          Início
          <input
            aria-label="Início"
            type="date"
            required
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label>
          Fim
          <input
            aria-label="Fim"
            type="date"
            required
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </label>
        <FleetFilters value={fleet} onChange={setFleet} lookups={lookups} />
      </div>
      <State {...resource} />
      {d && (
        <>
          <div className="cards">
            {cards.map(([label, value]) => (
              <article className="card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>Calculado a partir dos registros</small>
              </article>
            ))}
          </div>
          {d.indicators.unknown > 0 && (
            <p className="muted">
              {d.indicators.unknown} equipamentos sem estado operacional
              informado; não são contados como operando ou parados.
            </p>
          )}
          <div className="chart-grid">
            <Chart
              title="Evolução das interrupções"
              caption="Minutos por equipamento somados; dias agrupados em UTC"
            >
              <ResponsiveContainer width="100%" height={245}>
                <LineChart data={d.trend}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="4 5" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(5)}
                    fontSize={10}
                  />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Line
                    isAnimationActive="auto"
                    animationBegin={0}
                    animationDuration={420}
                    animationEasing="ease-out"
                    dataKey="minutes"
                    name="Minutos de parada"
                    stroke={colors[0]}
                    strokeWidth={2.5}
                    type="monotone"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Chart>
            <Chart
              title="Ocorrências por equipamento"
              caption="Equipamentos com maior número de registros"
            >
              <ResponsiveContainer width="100%" height={245}>
                <BarChart data={d.failuresByEquipment}>
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip />
                  <Bar
                    isAnimationActive="auto"
                    animationBegin={0}
                    animationDuration={420}
                    animationEasing="ease-out"
                    dataKey="count"
                    name="Interrupções"
                    fill={colors[1]}
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
            <Chart
              title="Principais motivos de parada"
              caption="Minutos dos registros por motivo; podem se sobrepor. Sem diagnóstico mecânico."
            >
              <ResponsiveContainer width="100%" height={245}>
                <BarChart data={d.causes} layout="vertical">
                  <XAxis type="number" fontSize={10} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={145}
                    fontSize={10}
                  />
                  <Tooltip />
                  <Bar
                    isAnimationActive="auto"
                    animationBegin={0}
                    animationDuration={420}
                    animationEasing="ease-out"
                    dataKey="minutes"
                    name="Minutos"
                    fill={colors[0]}
                    radius={[0, 5, 5, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
            <Chart
              title="Ordens por status atual"
              caption="Situação atual das ordens dos equipamentos selecionados"
            >
              <ResponsiveContainer width="100%" height={245}>
                <PieChart>
                  <Pie
                    isAnimationActive="auto"
                    animationBegin={0}
                    animationDuration={420}
                    animationEasing="ease-out"
                    data={d.orderStatus.map((s) => ({
                      name: statusLabel[s.status],
                      value: s.count,
                    }))}
                    dataKey="value"
                    innerRadius={45}
                    outerRadius={75}
                  >
                    {d.orderStatus.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </Chart>
            <Chart
              title="Planos previstos e realizados"
              caption="Execuções pelo vencimento original e previsões atualmente cadastradas"
            >
              <ResponsiveContainer width="100%" height={245}>
                <BarChart data={d.trend}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(5)}
                    fontSize={10}
                  />
                  <YAxis allowDecimals={false} fontSize={10} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    isAnimationActive="auto"
                    animationBegin={0}
                    animationDuration={420}
                    animationEasing="ease-out"
                    dataKey="planned"
                    name="Previstos"
                    fill={colors[1]}
                  />
                  <Bar
                    isAnimationActive="auto"
                    animationBegin={0}
                    animationDuration={420}
                    animationEasing="ease-out"
                    dataKey="done"
                    name="Realizados"
                    fill={colors[0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Chart>
            <article className="panel">
              <h2>Indicadores com dados pendentes</h2>
              {[
                "MTTR · faltam tempos de reparo",
                "MTBF · faltam horas operacionais e falhas confirmadas",
                "OEE e disponibilidade · faltam calendário produtivo e dados de produção",
              ].map((x) => (
                <p key={x} className="metric-unavailable">
                  {x}
                </p>
              ))}
              <p>Nenhum valor é estimado a partir de dados insuficientes.</p>
            </article>
          </div>
          <details className="panel definitions">
            <summary>Como os indicadores são calculados</summary>
            {d.definitions.map((x) => (
              <p key={x}>{x}</p>
            ))}
          </details>
        </>
      )}
    </>
  );
}
function Chart({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <article className="panel chart">
      <h2>{title}</h2>
      <p>{caption}</p>
      {children}
    </article>
  );
}
