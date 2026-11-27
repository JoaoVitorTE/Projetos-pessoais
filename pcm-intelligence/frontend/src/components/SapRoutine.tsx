import { useEffect, useState } from "react";
import { useResource } from "../hooks/useResource";
import { fmt, type Lookups } from "../types/operations";
import type { Navigate } from "../types/navigation";
import { State } from "./OperationalUI";
import {
  ReminderForm,
  type ReminderDraft,
} from "../pages/MaintenanceReminders";

type SapFeed = "IW38" | "IW47";
type Recurrence = {
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  sector: string;
  total: number;
  recent: { number: string; description: string; date: string }[];
  hasReminder: boolean;
};
type Routine = {
  windowDays: number;
  feeds: {
    code: SapFeed;
    label: string;
    checkedAt: string | null;
    status: "CURRENT" | "DUE" | "PARTIAL";
  }[];
  recurrence: Recurrence[];
  planReferences: {
    number: string;
    title: string | null;
    orderType: string | null;
    latestOrder: string;
    total: number;
  }[];
};

function useSapRoutine() {
  const resource = useResource<Routine>("/sap/routine");
  const { refresh } = resource;
  useEffect(() => {
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return resource;
}

export function SapDailyStatus({ onNavigate }: { onNavigate: Navigate }) {
  const resource = useSapRoutine();
  const data = resource.data;
  return (
    <section className="panel sap-routine">
      <div className="block-heading">
        <h2>Atualização diária do SAP</h2>
      </div>
      <State loading={resource.loading && !data} error={resource.error} />
      {data && (
        <>
          <div className="sap-feed-list">
            {data.feeds.map((feed) => (
              <div key={feed.code}>
                <div>
                  <strong>{feed.code}</strong> · {feed.label}
                  <small>
                    {feed.checkedAt
                      ? "Última leitura: " + fmt(feed.checkedAt)
                      : "Nenhuma importação registrada"}
                  </small>
                </div>
                <button
                  className={feed.status === "CURRENT" ? "secondary" : ""}
                  onClick={() => onNavigate("imports", { sapFeed: feed.code })}
                >
                  {feed.status === "CURRENT"
                    ? "Atualizado hoje"
                    : feed.status === "PARTIAL"
                      ? "Revisar importação"
                      : "Importar hoje"}
                </button>
              </div>
            ))}
          </div>
          {data.recurrence.length > 0 && (
            <button
              className="text-button"
              onClick={() => onNavigate("interruptions")}
            >
              {data.recurrence.length}{" "}
              {data.recurrence.length === 1
                ? "máquina com recorrência de corretivas"
                : "máquinas com recorrência de corretivas"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function SapRecurrences({ lookups }: { lookups: Lookups }) {
  const resource = useSapRoutine();
  const [draft, setDraft] = useState<ReminderDraft | undefined>();
  const [notice, setNotice] = useState("");
  return (
    <section className="panel sap-routine">
      <div className="block-heading">
        <h2>Recorrências identificadas na IW38</h2>
      </div>
      <p>
        Contagem dos últimos 30 dias. Duas ou mais ordens CORR ou CORI no mesmo
        equipamento indicam recorrência para investigação. A IW47 informa os
        apontamentos da equipe e não mede o tempo de máquina parada.
      </p>
      <State
        loading={resource.loading && !resource.data}
        error={resource.error}
      />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {resource.data &&
        (resource.data.recurrence.length ? (
          <div className="sap-recurrence-list">
            {resource.data.recurrence.map((row) => (
              <details key={row.equipmentId}>
                <summary>
                  <strong>
                    {row.equipmentCode} · {row.equipmentName}
                  </strong>{" "}
                  <small>
                    {row.sector} · {row.total} corretivas
                  </small>
                </summary>
                <ul>
                  {row.recent.map((item) => (
                    <li key={item.number}>
                      OS {item.number} ·{" "}
                      {item.date.split("-").reverse().join("/")}{" "}
                      {item.description && "· " + item.description}
                    </li>
                  ))}
                </ul>
                <button
                  className="secondary"
                  disabled={row.hasReminder}
                  onClick={() => {
                    setNotice("");
                    setDraft({
                      equipmentId: row.equipmentId,
                      kind: "CORP",
                      title: "Investigar recorrência de corretivas",
                      description: [
                        `${row.equipmentCode} registrou ${row.total} corretivas na IW38 nos últimos ${resource.data?.windowDays} dias.`,
                        "Ordens recentes: " +
                          row.recent.map((item) => item.number).join(", ") +
                          ".",
                        "Revisar os descritivos e condições de operação, inspecionar a máquina, verificar causas possíveis e propor ação corretiva e critério de acompanhamento.",
                      ].join("\n"),
                    });
                  }}
                >
                  {row.hasReminder
                    ? "Planejamento pendente"
                    : "Revisar plano sugerido"}
                </button>
              </details>
            ))}
          </div>
        ) : (
          <p className="muted">
            Nenhum equipamento atingiu o critério nas ordens importadas deste
            período.
          </p>
        ))}
      {draft && (
        <ReminderForm
          lookups={lookups}
          draft={draft}
          onClose={() => setDraft(undefined)}
          onSaved={() => {
            setDraft(undefined);
            setNotice("Planejamento salvo. Consulte em Ordens de serviço.");
            resource.refresh();
          }}
        />
      )}
    </section>
  );
}

export function SapPlanReferences() {
  const resource = useSapRoutine();
  return (
    <details className="panel sap-routine">
      <summary>
        <strong>Referências de planos encontradas na IW38</strong>
      </summary>
      <p>
        Inclua a coluna <strong>Plano de manutenção</strong> na exportação. O
        PCM reúne as ordens pelo número do plano. As tarefas, a periodicidade e
        o próximo vencimento dependem dos dados do plano.
      </p>
      <State
        loading={resource.loading && !resource.data}
        error={resource.error}
      />
      {resource.data &&
        (resource.data.planReferences.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plano SAP</th>
                  <th>Descrição</th>
                  <th>Última ordem</th>
                  <th>Tipo da ordem</th>
                  <th>Ordens</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.planReferences.map((plan) => (
                  <tr key={plan.number}>
                    <td>{plan.number}</td>
                    <td>{plan.title || "—"}</td>
                    <td>{plan.latestOrder}</td>
                    <td>{plan.orderType || "—"}</td>
                    <td>{plan.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Nenhuma referência de plano foi encontrada nas importações.
          </p>
        ))}
    </details>
  );
}
