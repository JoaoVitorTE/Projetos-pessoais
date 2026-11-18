import { useRef, useState } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import { Empty, State } from "../components/OperationalUI";
import { scheduleLabels } from "../components/scheduling/types";
import { dateTime } from "../components/scheduling/dates";
import { fmt, statusLabel, typeLabel } from "../types/operations";
type Answer = {
  intent: string;
  period: { from: string | null; to: string };
  facts: string[];
  items: Record<string, unknown>[];
  recommendations: string[];
  method: string;
};
const columns: Record<string, string> = {
  id: "Identificador",
  activity: "OS / plano",
  technician: "Técnico",
  startsAt: "Início reservado",
  endsAt: "Término reservado",
  sapReference: "Referência SAP",
  equipmentId: "Equipamento",
  interruptions: "Interrupções",
  title: "Atividade",
  description: "Descrição",
  status: "Status",
  type: "Tipo",
  nextExecution: "Vencimento",
  scheduledAt: "Programação",
  priority: "Prioridade",
  provider: "Prestador",
  pendingNotes: "Pendências",
  stageEnteredAt: "Na etapa desde",
};
function display(key: string, value: unknown) {
  if (value == null) return "Não informado";
  if (["nextExecution", "scheduledAt", "stageEnteredAt"].includes(key))
    return fmt(String(value));
  if (["startsAt", "endsAt"].includes(key)) return dateTime(String(value));
  if (key === "status")
    return (
      statusLabel[String(value)] ||
      scheduleLabels[String(value)] ||
      String(value)
    );
  if (key === "type") return typeLabel[String(value)] || String(value);
  return String(value);
}
export function AssistantPage() {
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<Answer | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function ask(text: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setQuestion(text);
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      setAnswer(
        await api("/assistant/query", {
          method: "POST",
          body: JSON.stringify({ question: text }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <>
      <p>
        Consulte os registros disponíveis. O assistente usa consultas
        estruturadas e respostas por modelos de texto; todas as operações são de
        leitura.
      </p>
      <section className="panel import-section">
        <div className="assistant-examples">
          {[
            "Quais equipamentos tiveram mais paradas nesta semana?",
            "Quais ordens estão atrasadas?",
            "Quais preventivas vencem nos próximos sete dias?",
            "Quais preventivas estão vencidas?",
            "Quais serviços de terceiros estão pendentes?",
            "O que está programado para amanhã?",
          ].map((q) => (
            <button
              className="secondary small"
              key={q}
              disabled={busy}
              onClick={() => ask(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label>
            Pergunta ao Assistente PCM
            <input
              aria-label="Pergunta ao Assistente PCM"
              required
              minLength={3}
              maxLength={500}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? "Consultando registros…" : "Consultar"}
          </button>
        </form>
      </section>
      <State error={error} />
      {answer && (
        <section className="panel import-section" aria-live="polite">
          <h2>Resposta fundamentada nos registros</h2>
          <p className="muted">
            Período:{" "}
            {answer.period.from
              ? fmt(answer.period.from)
              : "Todo o histórico anterior"}{" "}
            até {fmt(answer.period.to)}.
          </p>
          <h3>Fatos</h3>
          {answer.facts.map((f) => (
            <p key={f}>{f}</p>
          ))}
          {!!answer.items.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(answer.items[0]).map((k) => (
                      <th key={k}>{columns[k] || k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {answer.items.map((item, i) => (
                    <tr key={i}>
                      {Object.entries(item).map(([k, v]) => (
                        <td key={k}>{display(k, v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!answer.recommendations.length && (
            <>
              <h3>Recomendações para revisão</h3>
              {answer.recommendations.map((r) => (
                <p key={r}>{r}</p>
              ))}
            </>
          )}
          <small>{answer.method}</small>
        </section>
      )}
    </>
  );
}
import type { Navigate, ModuleId } from "../types/navigation";
export function AlertsPage({ onNavigate }: { onNavigate: Navigate }) {
  const destinations: Record<string, { module: ModuleId; overdue?: boolean }> =
    {
      "late-orders": { module: "orders", overdue: true },
      "late-plans": { module: "plans", overdue: true },
      "stalled-services": { module: "third", overdue: true },
      "expired-reservations": { module: "scheduling" },
      "blocked-reservations": { module: "scheduling" },
    };
  const data = useResource<{
    period: { asOf: string };
    items: {
      id: string;
      title: string;
      evidence: string;
      recommendation: string;
    }[];
    statisticalNote: string;
  }>("/alerts");
  return (
    <>
      <div className="action-row">
        <p>Pendências calculadas nas datas e situações registradas.</p>
        <button className="secondary" onClick={data.refresh}>
          Atualizar alertas
        </button>
      </div>
      <State {...data} />
      {data.data && (
        <>
          <p className="muted">Consulta em {fmt(data.data.period.asOf)}</p>
          {!data.data.items.length && <Empty />}
          {data.data.items.map((a) => (
            <section className="panel import-section" key={a.id}>
              <h2>{a.title}</h2>
              {destinations[a.id] && (
                <button
                  className="secondary small"
                  onClick={() =>
                    onNavigate(destinations[a.id].module, {
                      overdue: destinations[a.id].overdue,
                    })
                  }
                >
                  Ver registros
                </button>
              )}
              <p>
                <strong>Evidência:</strong> {a.evidence}
              </p>
              <p>
                <strong>Recomendação:</strong> {a.recommendation}
              </p>
            </section>
          ))}
          <p className="muted">{data.data.statisticalNote}</p>
        </>
      )}
    </>
  );
}
