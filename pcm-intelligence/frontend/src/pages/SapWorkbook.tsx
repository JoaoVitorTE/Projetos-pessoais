import { useState } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import { State } from "../components/OperationalUI";
import { fmt } from "../types/operations";

type Mapping = Record<string, Record<string, string>>;
type Column = { header: string; value: string };
type RowIssue = { line: number; message: string; fields: Column[] };
type SheetPreview = {
  tab: string;
  headers: string[];
  fields: { key: string; label: string; required: boolean }[];
  issues: string[];
  mapping: Record<string, string>;
  count: number;
  rows: { line: number; columns: Column[] }[];
};
type Run = {
  id: string;
  filename: string;
  source: string;
  receivedAt: string;
  updatedAt: string | null;
  result: {
    status: string;
    error?: string;
    sheets?: {
      tab: string;
      rows: number;
      processed: number;
      issues: string[];
      errorCount: number;
    }[];
  };
};
type Status = {
  mapping: Mapping;
  file: string | null;
  configured: boolean;
  lastSuccessful: { updatedAt: string; filename: string } | null;
  runs: Run[];
};
const labels: Record<string, string> = {
  received: "Arquivo recebido",
  updated: "Dados atualizados",
  partial: "Dados atualizados parcialmente",
  rejected: "Importação rejeitada",
  failed: "Falha ao atualizar",
  obsolete: "Versão anterior ignorada",
  unchanged: "Reenvio da mesma versão",
  empty: "Arquivo sem linhas para importar",
};

function readExcel(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
const json = (method: string, value: unknown) => ({
  method,
  body: JSON.stringify(value),
});
const selections = (sheets: SheetPreview[]) =>
  Object.fromEntries(sheets.map((sheet) => [sheet.tab, sheet.mapping]));

export function SapWorkbook({ onChanged }: { onChanged: () => void }) {
  const status = useResource<Status>("/sap/status");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Mapping>({});
  const [preview, setPreview] = useState<SheetPreview[]>([]);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function payload() {
    if (!file || !/\.xlsx$/i.test(file.name) || file.size > 3 * 1024 * 1024)
      throw new Error("Selecione um arquivo .xlsx de até 3 MB.");
    return {
      filename: file.name,
      content: await readExcel(file),
      mapping: draft,
    };
  }
  const valid =
    verified &&
    preview.length > 0 &&
    !preview.some((sheet) => sheet.issues.length);
  return (
    <>
      <section className="panel">
        <div className="action-row">
          <h2>Sincronização da planilha SAP</h2>
          <a className="button-link secondary" href="/api/sap/template.xlsx">
            Baixar modelo Excel
          </a>
        </div>
        <State error={status.error} loading={status.loading} />
        {status.data && (
          <>
            <p>
              <strong>Arquivo conectado</strong>{" "}
              {status.data.file ?? "Configuração pendente"}
            </p>
            <p>
              {status.data.configured
                ? "Configuração salva. O Power Automate envia as versões do arquivo."
                : "Configuração pendente. A importação manual está disponível."}
            </p>
            <p>
              <strong>Última atualização bem-sucedida</strong>{" "}
              {status.data.lastSuccessful
                ? `${fmt(status.data.lastSuccessful.updatedAt)} · ${status.data.lastSuccessful.filename}`
                : "Nenhuma"}
            </p>
          </>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              const next: SheetPreview[] = await api(
                "/sap/preview",
                json("POST", await payload()),
              );
              setPreview(next);
              setVerified(true);
            });
          }}
        >
          <label>
            Arquivo Excel
            <input
              type="file"
              accept=".xlsx"
              required
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setDraft(status.data?.mapping ?? {});
                setPreview([]);
                setVerified(false);
              }}
            />
          </label>
          <div className="row-actions">
            <button disabled={busy || !file}>Ver prévia</button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !valid}
              onClick={() =>
                void action(async () => {
                  await api("/sap/mapping", json("PUT", selections(preview)));
                  setNotice("Mapeamento salvo para os próximos arquivos.");
                  status.refresh();
                })
              }
            >
              Salvar mapeamento por aba
            </button>
            <button
              type="button"
              disabled={busy || !valid}
              onClick={() =>
                void action(async () => {
                  const run: Run = await api(
                    "/sap/import",
                    json("POST", {
                      ...(await payload()),
                      mapping: selections(preview),
                    }),
                  );
                  setNotice(labels[run.result.status] || run.result.status);
                  status.refresh();
                  if (run.updatedAt) onChanged();
                })
              }
            >
              Importar arquivo
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
      {preview.map((sheet) => (
        <details
          className="panel"
          key={sheet.tab}
          open={
            sheet.issues.length > 0 ||
            preview.find((item) => item.count > 0)?.tab === sheet.tab ||
            undefined
          }
        >
          <summary>
            <strong>{sheet.tab}</strong> · {sheet.count} linhas ·{" "}
            {sheet.issues.length} problemas de cabeçalho
          </summary>
          {sheet.issues.map((issue) => (
            <p className="error" key={issue}>
              {issue}
            </p>
          ))}
          <div className="form-grid">
            {sheet.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.required ? " *" : ""}
                <select
                  value={
                    draft[sheet.tab]?.[field.key] ??
                    sheet.mapping[field.key] ??
                    ""
                  }
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value;
                    setVerified(false);
                    setDraft((current) => ({
                      ...current,
                      [sheet.tab]: { ...current[sheet.tab], [field.key]: next },
                    }));
                  }}
                >
                  <option value="">Detectar pelo cabeçalho</option>
                  {[...new Set(sheet.headers.filter(Boolean))].map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  {sheet.headers.map((header, index) => (
                    <th key={index}>
                      {header || `Coluna ${index + 1} sem título`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    {row.columns.map((column, index) => (
                      <td key={index}>{column.value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      <section className="panel">
        <div className="action-row">
          <h2>Arquivos recebidos</h2>
          <button className="secondary" onClick={status.refresh}>
            Atualizar histórico
          </button>
        </div>
        {status.data?.runs.map((run, index) => (
          <details key={run.id} open={index === 0 || undefined}>
            <summary>
              {fmt(run.receivedAt)} · {run.filename} ·{" "}
              {run.source === "manual" ? "Manual" : "Microsoft 365"} ·{" "}
              {labels[run.result.status] || run.result.status}
            </summary>
            {run.updatedAt && <p>Dados atualizados em {fmt(run.updatedAt)}</p>}
            {run.result.error && <p className="error">{run.result.error}</p>}
            {run.result.sheets?.map((sheet) => (
              <div key={sheet.tab}>
                <h3>
                  {sheet.tab} · {sheet.processed}/{sheet.rows} linhas
                  processadas
                </h3>
                {sheet.issues.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
                {sheet.errorCount > 0 && (
                  <RunErrors
                    id={run.id}
                    tab={sheet.tab}
                    total={sheet.errorCount}
                  />
                )}
              </div>
            ))}
          </details>
        ))}
      </section>
    </>
  );
}

function RunErrors({
  id,
  tab,
  total,
}: {
  id: string;
  tab: string;
  total: number;
}) {
  const [items, setItems] = useState<RowIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      {items.map((issue) => (
        <details key={issue.line}>
          <summary>
            Linha {issue.line} · {issue.message}
          </summary>
          <dl>
            {issue.fields
              .filter((column) => column.value)
              .map((column, index) => (
                <div key={index}>
                  <dt>{column.header || "Coluna sem título"}</dt>
                  <dd>{column.value}</dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.length < total && (
        <button
          className="small secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const data: { items: RowIssue[] } = await api(
                `/sap/runs/${id}/errors?tab=${encodeURIComponent(tab)}&offset=${items.length}`,
              );
              setItems((previous) => [...previous, ...data.items]);
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {items.length
            ? `Mais erros (${items.length}/${total})`
            : `Ver erros por linha (${total})`}
        </button>
      )}
    </>
  );
}
