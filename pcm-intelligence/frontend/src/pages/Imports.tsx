import { SapWorkbook } from "./SapWorkbook";
import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { useResource } from "../hooks/useResource";
import { Modal, Pager, State, Empty } from "../components/OperationalUI";
import { fmt, type Page, type Lookups } from "../types/operations";
type Source = {
  id: string;
  name: string;
  system: string;
  scope: string;
  target: string;
  isDemo: boolean;
  active: boolean;
  mapping?: Record<string, string>;
  options?: any;
};
type Field = { key: string; label: string; required?: boolean; kind?: string };
type Spec = {
  fields: Record<string, Field[]>;
  choices: Record<string, string[]>;
};
type Preview = {
  totalRows: number;
  truncated: boolean;
  id: string;
  rows: any[];
  counts: Record<string, number>;
};
const targetLabel: Record<string, string> = {
  EQUIPMENT: "Equipamentos",
  ORDERS: "Ordens de serviço",
  PLANS: "Planos preventivos / lubrificação",
  INTERRUPTIONS: "Interrupções",
};
const changedFieldNames: Record<string, string> = {
  tag: "TAG",
  equipmentNumber: "Número do equipamento",
  tasks: "Lista de tarefas",
  taskListReference: "Referência da lista",
  sectorId: "Setor",
  equipmentId: "Equipamento",
  technicianId: "Técnico",
  nextExecution: "Vencimento",
  intervalDays: "Periodicidade",
  name: "Nome",
  title: "Nome do plano",
  type: "Tipo",
  status: "Situação",
  criticality: "Criticidade",
  active: "Ativo",
};
function changedValue(value: unknown) {
  if (value == null || value === "") return "Não informado";
  if (Array.isArray(value))
    return (
      value
        .map(
          (t: any) =>
            t?.code +
            ": " +
            t?.description +
            (t?.estimatedMinutes ? " (" + t.estimatedMinutes + " min)" : ""),
        )
        .join("; ") || "Lista vazia"
    );
  return typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value);
}
const actionLabel: Record<string, string> = {
  CREATE: "Novo",
  UPDATE: "Atualização",
  SKIP: "Sem alteração",
  DUPLICATE: "Repetida no arquivo",
  GROUPED: "Tarefa agrupada no plano",
  CONFLICT: "Conflito",
  INVALID: "Inválida",
};
const batchLabel: Record<string, string> = {
  UPLOADED: "Enviado",
  PREVIEW: "Prévia",
  RUNNING: "Em processamento",
  APPLIED: "Aplicado",
  PARTIAL: "Parcial / com pendências",
  REVERTING: "Desfazendo",
  REVERTED: "Desfeito",
  EXPIRED: "Prévia expirada",
};
const aliases: Record<string, string[]> = {
  externalKey: [
    "chave",
    "os",
    "ordem",
    "numeroos",
    "numeroordem",
    "plano",
    "ocorrencia",
    "identificador",
  ],
  equipmentId: [
    "tag",
    "equipamento",
    "codigoequipamento",
    "equipmentid",
    "nequipamento",
    "numeroequipamento",
    "numerodoequipamento",
  ],
  equipmentNumber: [
    "nequipamento",
    "numeroequipamento",
    "numerodoequipamento",
    "equipmentnumber",
  ],
  taskListReference: [
    "listadetarefas",
    "listatarefas",
    "referencialista",
    "grupolista",
  ],
  taskCode: ["operacao", "codigotarefa", "codigooperacao", "tarefa"],
  taskDescription: [
    "descricaotarefa",
    "descricaodatarefa",
    "descricaooperacao",
    "textobreveoperacao",
  ],
  estimatedMinutes: ["minutos", "minutosestimados", "duracaominutos"],
  name: ["nome", "nomeequipamento"],
  sector: ["setor", "sector"],
  criticality: ["criticidade"],
  status: ["status", "estado", "situacao"],
  description: ["descricao", "descricaoproblema"],
  type: ["tipo", "tipomanutencao"],
  priority: ["prioridade"],
  technician: ["tecnico", "responsavel"],
  openedAt: ["abertura", "dataabertura"],
  scheduledAt: ["programacao", "vencimento", "dataprogramada"],
  completedAt: ["conclusao", "dataconclusao"],
  notes: ["observacoes"],
  title: ["nome", "tituloplano"],
  intervalDays: ["dias", "periodicidade"],
  nextExecution: ["vencimento", "proximaexecucao"],
  active: ["ativo"],
  startedAt: ["inicio", "datainicio"],
  endedAt: ["termino", "fim"],
  reason: ["motivo"],
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
const baseOptions = {
  dateFormat: "BR",
  timezone: "America/Sao_Paulo",
  createReferences: false,
  allowOverwriteModified: false,
  valueMappings: {} as Record<string, Record<string, string>>,
};
export function ImportsPage(props: {
  lookups: Lookups;
  onChanged: () => void;
}) {
  const [workbook, setWorkbook] = useState(true);
  return (
    <>
      <div className="tabs">
        <button
          className={workbook ? "" : "secondary"}
          onClick={() => setWorkbook(true)}
        >
          Planilha SAP
        </button>
        <button
          className={workbook ? "secondary" : ""}
          onClick={() => setWorkbook(false)}
        >
          Outras importações
        </button>
      </div>
      {workbook ? (
        <SapWorkbook onChanged={props.onChanged} />
      ) : (
        <LegacyImportsPage {...props} />
      )}
    </>
  );
}
function LegacyImportsPage({
  lookups,
  onChanged,
}: {
  lookups: Lookups;
  onChanged: () => void;
}) {
  const sources = useResource<Source[]>("/imports/sources"),
    specs = useResource<Spec>("/imports/specs"),
    [page, setPage] = useState(1),
    history = useResource<Page<any>>("/imports?page=" + page),
    [sourceId, setSourceId] = useState(""),
    [creating, setCreating] = useState(false),
    [sourceAction, setSourceAction] = useState<"edit" | "remove" | null>(null),
    [sourceNotice, setSourceNotice] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [sheet, setSheet] = useState(""),
    [header, setHeader] = useState(1),
    [delimiter, setDelimiter] = useState(""),
    [upload, setUpload] = useState<any>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [options, setOptions] = useState<any>(baseOptions),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [validOnly, setValidOnly] = useState(false),
    [job, setJob] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [undo, setUndo] = useState<any>(null),
    [undoText, setUndoText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const running = useRef(true),
    paused = useRef(false);
  useEffect(() => {
    running.current = true;
    return () => {
      running.current = false;
      paused.current = true;
    };
  }, []);
  const source = sources.data?.find((s) => s.id === sourceId),
    fields = source ? specs.data?.fields[source.target] || [] : [];
  function choose(id: string) {
    setSourceId(id);
    setUpload(null);
    setPreview(null);
    setJob(null);
    setMapping({});
    setConfirmation("");
    setError("");
  }
  async function sendFile() {
    if (!file || !source) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      if (file.size > 3 * 1024 * 1024)
        throw new Error("Use arquivos de até 3 MB");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      const result = await api("/imports/upload", {
        method: "POST",
        body: JSON.stringify({
          sourceId,
          filename: file.name,
          base64,
          headerRow: header,
          ...(sheet ? { sheet } : {}),
          ...(delimiter ? { delimiter } : {}),
        }),
      });
      setUpload(result);
      const next: Record<string, string> = {};
      for (const field of specs.data!.fields[source.target]) {
        const old = result.mapping?.[field.key];
        next[field.key] =
          (field.key === "equipmentId" &&
            source.target === "EQUIPMENT" &&
            result.headers.find((h: string) => norm(h) === "tag")) ||
          (old && result.headers.includes(old)
            ? old
            : result.headers.find(
                (h: string) =>
                  norm(h) === norm(field.key) ||
                  (aliases[field.key] || []).includes(norm(h)),
              ) || "");
      }
      setMapping(next);
      setOptions({ ...baseOptions, ...(result.options || {}) });
      history.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/imports/" + upload.id + "/preview", {
        method: "POST",
        body: JSON.stringify({
          mapping: Object.fromEntries(
            Object.entries(mapping).filter(([, v]) => v),
          ),
          options,
          saveMapping: true,
        }),
      });
      setPreview(result);
      setConfirmation("");
      history.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function process(id: string) {
    setBusy(true);
    setError("");
    paused.current = false;
    try {
      let result: any;
      do {
        result = await api("/imports/" + id + "/process", { method: "POST" });
        if (running.current) setJob(result);
      } while (
        running.current &&
        !paused.current &&
        result.status === "RUNNING"
      );
      history.refresh();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (running.current) setBusy(false);
    }
  }
  async function show(id: string) {
    setError("");
    try {
      setDetail(await api("/imports/" + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function prepareUndo(id: string) {
    setError("");
    setBusy(true);
    try {
      setUndo({ id, ...(await api("/imports/" + id + "/undo-preview")) });
      setUndoText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel import-intro">
        <h2>Exportação autorizada → prévia → atualização local</h2>
        <p>
          Exporte uma listagem no SAP conforme as permissões da empresa e envie
          CSV/XLSX. Não há conexão automática ou envio de alterações ao SAP. Os
          adaptadores não presumem o layout real de nenhuma transação.
        </p>
        <p>
          <strong>Reutilize a identificação da mesma base SAP:</strong> o número
          externo e o tipo de registro identificam o item, mesmo que o arquivo
          de amanhã tenha outro nome. Zeros à esquerda são preservados.
        </p>
      </section>
      <State
        error={error || sources.error || specs.error}
        loading={sources.loading || specs.loading}
      />
      <div className="import-steps">
        <span>1 · Origem e arquivo</span>
        <span>2 · Mapeamento e prévia</span>
        <span>3 · Confirmação e histórico</span>
      </div>
      <section className="panel">
        <div className="action-row">
          <h2>Origem dos dados</h2>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            Criar origem
          </button>
        </div>
        <label>
          Origem salva
          <select
            aria-label="Origem da importação"
            disabled={busy}
            value={sourceId}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Selecione uma origem ou crie a primeira</option>
            {sources.data?.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} · {targetLabel[s.target]} · base {s.scope}
                {!s.active && " · Inativa"}
              </option>
            ))}
          </select>
        </label>
        {sourceNotice && <p role="status">{sourceNotice}</p>}
        {source && (
          <div className="row-actions">
            <button
              className="small secondary"
              disabled={busy}
              onClick={() => setSourceAction("edit")}
            >
              Editar origem
            </button>
            <button
              className="small secondary danger-text"
              disabled={busy}
              onClick={() => setSourceAction("remove")}
            >
              Remover origem
            </button>
          </div>
        )}
        {source && !source.active && (
          <p>
            Origem inativa. Reative em Editar origem para importar novos
            arquivos.
          </p>
        )}
        {source && (
          <>
            <p className="muted">
              {source.isDemo
                ? "Dados fictícios de teste"
                : "Dados fornecidos em exportação autorizada"}{" "}
              · Sistema: {source.system} · Identificação da base: {source.scope}
            </p>
            {source.target === "PLANS" && (
              <div className="form-guidance import-plan-guide">
                <div>
                  <strong>
                    Preventivas, lubrificação e tarefas no mesmo arquivo
                  </strong>
                  <p>
                    Use uma coluna Tipo para distinguir PREVENTIVE (preventiva)
                    e LUBRICATION (lubrificação). Para listas de tarefas, repita
                    os dados do plano em cada linha e preencha Operação,
                    Descrição da tarefa e, se disponível, Minutos.
                  </p>
                  <p>
                    O mesmo plano é agrupado na prévia. Se houver itens
                    diferentes dentro de um plano SAP, use Plano + Item como
                    chave. A disponibilidade de um relatório conjunto depende do
                    SAP da sua unidade.
                  </p>
                  <p>
                    As tarefas mapeadas substituem a lista do plano após sua
                    revisão. Arquivos sem tarefas preservam a lista atual. Baixe
                    o exemplo para conferir o formato.
                  </p>
                </div>
              </div>
            )}
            {source.target === "EQUIPMENT" && (
              <p className="form-guidance">
                Mapeie TAG como identificação obrigatória e Nº Equipamento como
                campo opcional. A mesma TAG pode existir em setores diferentes.
                Sem chave externa, o sistema usa TAG + setor para reconhecer
                repetidos.
              </p>
            )}
            <div className="sample-links">
              <a href={"/api/imports/sample/" + source.target}>
                Baixar CSV fictício
              </a>
              <a href={"/api/imports/sample/" + source.target + "?format=xlsx"}>
                Baixar XLSX fictício
              </a>
            </div>
            <div className="form-grid">
              <label className="span-2">
                Planilha CSV/XLSX
                <input
                  aria-label="Arquivo de importação"
                  type="file"
                  accept=".csv,.xlsx"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setUpload(null);
                    setPreview(null);
                  }}
                />
              </label>
              <label>
                Linha dos cabeçalhos
                <input
                  aria-label="Linha dos cabeçalhos"
                  type="number"
                  min={1}
                  max={20}
                  value={header}
                  onChange={(e) => setHeader(Number(e.target.value))}
                />
              </label>
              <label>
                Aba XLSX (opcional)
                <input
                  aria-label="Aba da planilha"
                  value={sheet}
                  onChange={(e) => setSheet(e.target.value)}
                  placeholder="Primeira aba por padrão"
                />
              </label>
              <label>
                Delimitador CSV
                <select
                  aria-label="Delimitador CSV"
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                >
                  <option value="">Detectar no cabeçalho</option>
                  <option value=";">Ponto e vírgula</option>
                  <option value=",">Vírgula</option>
                  <option value={"\t"}>Tabulação</option>
                </select>
              </label>
            </div>
            <p className="muted">
              Até 3 MB, 1.000 linhas de dados e 60 colunas. CSV deve estar em
              UTF-8. Para testar os exemplos, escolha uma origem de dados
              fictícios.
            </p>
            <button
              disabled={busy || !file || !source.active}
              onClick={sendFile}
            >
              {busy ? "Aguarde…" : "Ler arquivo"}
            </button>
          </>
        )}
      </section>
      {upload && source && (
        <section className="panel import-section">
          <h2>Mapear colunas</h2>
          <p>
            {file?.name} · {upload.totalRows} linhas · aba {upload.sheet}.
            Sugestões de cabeçalhos são genéricas; revise antes de confirmar.
          </p>
          {upload.previousIdenticalFile && (
            <p className="notice-text">
              Este mesmo arquivo já foi aplicado. A prévia verificará quais
              registros continuam iguais.
            </p>
          )}
          <div className="mapping-grid">
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.required ? " *" : ""}
                <select
                  aria-label={"Mapear " + field.label}
                  value={mapping[field.key] || ""}
                  onChange={(e) => {
                    setMapping({ ...mapping, [field.key]: e.target.value });
                    setPreview(null);
                  }}
                >
                  <option value="">
                    {field.required
                      ? "Selecione uma coluna"
                      : "Não importar este campo"}
                  </option>
                  {upload.headers.map((h: string) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <details className="subform">
            <summary>Conferir primeiras linhas do arquivo</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {upload.headers.map((h: string) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upload.rows.map((r: string[], i: number) => (
                    <tr key={i}>
                      {upload.headers.map((_: string, c: number) => (
                        <td key={c} title={r[c]}>
                          {String(r[c] || "").slice(0, 90)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="form-grid">
            <label>
              Formato de data
              <select
                aria-label="Formato de data"
                value={options.dateFormat}
                onChange={(e) => {
                  setOptions({ ...options, dateFormat: e.target.value });
                  setPreview(null);
                }}
              >
                <option value="BR">Dia/mês/ano ou ISO</option>
                <option value="ISO">Ano-mês-dia (ISO)</option>
              </select>
            </label>
            <label>
              Fuso das datas sem deslocamento
              <select
                aria-label="Fuso horário"
                value={options.timezone}
                onChange={(e) => {
                  setOptions({ ...options, timezone: e.target.value });
                  setPreview(null);
                }}
              >
                <option value="America/Sao_Paulo">São Paulo</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label>
              Segunda coluna da chave (opcional)
              <select
                aria-label="Segunda coluna da chave"
                value={options.secondKeyColumn || ""}
                onChange={(e) => {
                  const next = { ...options };
                  if (e.target.value) next.secondKeyColumn = e.target.value;
                  else delete next.secondKeyColumn;
                  setOptions(next);
                  setPreview(null);
                }}
              >
                <option value="">Usar somente a chave principal</option>
                {upload.headers.map((h: string) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Setor padrão para novos equipamentos
              <select
                aria-label="Setor padrão"
                value={options.defaultSectorId || ""}
                onChange={(e) => {
                  const next = { ...options };
                  if (e.target.value) next.defaultSectorId = e.target.value;
                  else delete next.defaultSectorId;
                  setOptions(next);
                  setPreview(null);
                }}
              >
                <option value="">Usar coluna de setor</option>
                {lookups.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["defaultCriticality", "Criticidade padrão", "priority"],
              ...(source.target === "ORDERS"
                ? [
                    ["defaultPriority", "Prioridade padrão", "priority"],
                    ["defaultStatus", "Status padrão", "orderStatus"],
                  ]
                : []),
              ...(source.target !== "EQUIPMENT"
                ? [
                    [
                      "defaultType",
                      "Tipo padrão",
                      source.target === "ORDERS"
                        ? "orderType"
                        : source.target === "PLANS"
                          ? "planType"
                          : "interruptionType",
                    ],
                  ]
                : []),
            ].map(([key, label, kind]) => (
              <label key={key}>
                {label}
                <select
                  aria-label={label}
                  value={options[key] || ""}
                  onChange={(e) => {
                    const next = { ...options };
                    if (e.target.value)
                      next[key] =
                        kind === "priority"
                          ? Number(e.target.value)
                          : e.target.value;
                    else delete next[key];
                    setOptions(next);
                    setPreview(null);
                  }}
                >
                  <option value="">Não presumir valor</option>
                  {specs.data?.choices[kind]?.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {source.target === "PLANS" && (
              <label>
                Periodicidade padrão (dias)
                <input
                  aria-label="Periodicidade padrão"
                  type="number"
                  min={1}
                  max={3660}
                  value={options.defaultIntervalDays || ""}
                  onChange={(e) => {
                    const next = { ...options };
                    if (e.target.value)
                      next.defaultIntervalDays = Number(e.target.value);
                    else delete next.defaultIntervalDays;
                    setOptions(next);
                    setPreview(null);
                  }}
                />
              </label>
            )}
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.createReferences}
              onChange={(e) => {
                setOptions({ ...options, createReferences: e.target.checked });
                setPreview(null);
              }}
            />
            Autorizar criação de setores, equipamentos e técnicos ainda não
            cadastrados
          </label>
          <p className="muted">
            Novos equipamentos sem estado operacional ficarão como “Não
            informado”. Criticidade precisa vir do arquivo ou de um padrão
            escolhido por você. Campos vazios não apagam dados existentes.
          </p>
          <details className="subform">
            <summary>Traduzir códigos e valores da planilha</summary>
            <p>
              Associe os códigos usados pela sua empresa aos valores do PCM.
              Nenhum código de status SAP é presumido.
            </p>
            {fields
              .filter(
                (f) => f.kind && specs.data?.choices[f.kind] && mapping[f.key],
              )
              .map((field) => (
                <div key={field.key}>
                  <h3>{field.label}</h3>
                  {(upload.values?.[mapping[field.key]] || []).map(
                    (value: any) => (
                      <label className="value-map" key={value}>
                        <span>{value}</span>
                        <select
                          aria-label={field.label + " valor " + value}
                          value={
                            options.valueMappings?.[field.key]?.[value] ||
                            (specs.data!.choices[field.kind!].includes(value)
                              ? value
                              : "")
                          }
                          onChange={(e) => {
                            setOptions({
                              ...options,
                              valueMappings: {
                                ...options.valueMappings,
                                [field.key]: {
                                  ...(options.valueMappings?.[field.key] || {}),
                                  [value]: e.target.value,
                                },
                              },
                            });
                            setPreview(null);
                          }}
                        >
                          <option value="">Selecionar significado</option>
                          {specs.data!.choices[field.kind!].map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    ),
                  )}
                </div>
              ))}
          </details>
          <label className="check-label warning-option">
            <input
              type="checkbox"
              checked={options.allowOverwriteModified}
              onChange={(e) => {
                setOptions({
                  ...options,
                  allowOverwriteModified: e.target.checked,
                });
                setPreview(null);
              }}
            />
            Permitir atualizar registros que tiveram alteração manual após a
            última importação (revise as diferenças)
          </label>
          <button disabled={busy} onClick={validate}>
            Validar e gerar prévia
          </button>
        </section>
      )}
      {preview && (
        <section className="panel import-section">
          <h2>Prévia das mudanças</h2>
          {preview.truncated && (
            <p className="muted">
              Exibindo as primeiras 200 de {preview.totalRows} linhas. Os
              totais, a validação e o relatório de erros consideram o arquivo
              inteiro.
            </p>
          )}
          <div className="import-counts">
            {Object.entries(preview.counts).map(([action, count]) => (
              <span
                key={action}
                className={"import-count " + action.toLowerCase()}
              >
                {actionLabel[action]}: <b>{count}</b>
              </span>
            ))}
          </div>
          <div className="table-wrap preview-table">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Chave externa</th>
                  <th>Ação</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td className="code">{row.externalKey || "—"}</td>
                    <td>{actionLabel[row.action]}</td>
                    <td>
                      {row.reason || ""}
                      {row.changes?.length > 0 && (
                        <details>
                          <summary>
                            {row.changes.length} campos alterados
                          </summary>
                          {row.changes.map((c: any) => (
                            <p key={c.field}>
                              {changedFieldNames[c.field] || c.field}:{" "}
                              {changedValue(c.before)} → {changedValue(c.after)}
                            </p>
                          ))}
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <a href={"/api/imports/" + preview.id + "/errors.csv"}>
              Baixar relatório de erros
            </a>
          </p>
          {(preview.counts.INVALID || preview.counts.CONFLICT) && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={validOnly}
                onChange={(e) => setValidOnly(e.target.checked)}
              />
              Importar somente linhas válidas e registrar as demais como
              pendência
            </label>
          )}
          <label>
            Digite IMPORTAR para confirmar
            <input
              aria-label="Confirmar importação"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button
            disabled={
              busy ||
              confirmation !== "IMPORTAR" ||
              (!!(preview.counts.INVALID || preview.counts.CONFLICT) &&
                !validOnly)
            }
            onClick={async () => {
              setError("");
              setBusy(true);
              try {
                await api("/imports/" + preview.id + "/confirm", {
                  method: "POST",
                  body: JSON.stringify({
                    acceptValidOnly: validOnly,
                    confirmation: "IMPORTAR",
                  }),
                });
                setPreview(null);
                setUpload(null);
                await process(preview.id);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Confirmar e processar lote
          </button>
        </section>
      )}
      {job && (
        <section className="panel import-section">
          <h2>{batchLabel[job.status] || job.status}</h2>
          <p>
            {job.processed} de {job.total} linhas processadas. Cada trecho é
            confirmado no banco.
          </p>
          <progress value={job.processed} max={job.total || 1} />
          <p>
            {job.counts?.created || 0} novos · {job.counts?.updated || 0}{" "}
            atualizados · {job.counts?.unchanged || 0} sem alteração ·{" "}
            {job.counts?.duplicates || 0} repetidos · {job.counts?.grouped || 0}{" "}
            tarefas agrupadas · {job.counts?.errors || 0} pendências
          </p>
          {busy ? (
            <button
              className="secondary"
              onClick={() => {
                paused.current = true;
              }}
            >
              Pausar após o trecho atual
            </button>
          ) : (
            job.status === "RUNNING" && (
              <button onClick={() => process(job.id)}>
                Retomar processamento
              </button>
            )
          )}
        </section>
      )}
      <section className="panel import-section">
        <div className="action-row">
          <h2>Histórico de importações</h2>
          <button className="secondary" onClick={history.refresh}>
            Atualizar histórico
          </button>
        </div>
        <State {...history} />
        {history.data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Quando / quem",
                      "Origem / arquivo",
                      "Situação",
                      "Linhas",
                      "Ações",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {fmt(b.createdAt)}
                        <small>{b.actor?.name || "Sistema"}</small>
                      </td>
                      <td>
                        {b.sourceConfig?.name || b.source}
                        <small>{b.filename}</small>
                      </td>
                      <td>{batchLabel[b.status] || b.status}</td>
                      <td>
                        {b.processed}/{b.rowCount}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="secondary small"
                            onClick={() => show(b.id)}
                          >
                            Detalhes
                          </button>
                          {b.status === "RUNNING" && (
                            <button
                              disabled={busy}
                              className="small"
                              onClick={() => process(b.id)}
                            >
                              Retomar
                            </button>
                          )}
                          {["APPLIED", "PARTIAL", "REVERTING"].includes(
                            b.status,
                          ) && (
                            <button
                              disabled={busy}
                              className="secondary small"
                              onClick={() => prepareUndo(b.id)}
                            >
                              Desfazer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!history.data.items.length && <Empty />}
            <Pager {...history.data} onChange={setPage} />
          </>
        )}
      </section>
      {source && sourceAction && (
        <SourceMaintenance
          source={source}
          removal={sourceAction === "remove"}
          onClose={() => setSourceAction(null)}
          onSaved={(outcome) => {
            setSourceAction(null);
            setSourceNotice(
              outcome === "deactivated"
                ? "Origem desativada. O histórico foi preservado."
                : outcome === "deleted"
                  ? "Origem removida."
                  : "Origem atualizada.",
            );
            if (outcome === "deleted") choose("");
            sources.refresh();
          }}
        />
      )}
      {creating && (
        <SourceForm
          onClose={() => setCreating(false)}
          onSaved={(s) => {
            sources.refresh();
            choose(s.id);
            setCreating(false);
          }}
        />
      )}
      {detail && (
        <Modal title="Detalhes do lote" onClose={() => setDetail(null)}>
          <p>
            {detail.filename} · {batchLabel[detail.status] || detail.status} ·{" "}
            {detail.processed}/{detail.total}
          </p>
          <pre className="json-view">
            {JSON.stringify(detail.counts, null, 2)}
          </pre>
          <p>
            <a href={"/api/imports/" + detail.id + "/errors.csv"}>
              Baixar erros CSV
            </a>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Chave</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {detail.errors?.map((e: any, i: number) => (
                  <tr key={i}>
                    <td>{e.row}</td>
                    <td>{e.key}</td>
                    <td>{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.status === "RUNNING" && !busy && (
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await api("/imports/" + detail.id + "/stop", {
                    method: "POST",
                    body: JSON.stringify({ confirmation: "ENCERRAR" }),
                  });
                  setDetail(null);
                  history.refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Encerrar lote parcial para revisar ou desfazer
            </button>
          )}
        </Modal>
      )}
      {undo && (
        <Modal
          title="Desfazer importação"
          onClose={() => !busy && setUndo(null)}
        >
          <p>
            Serão revertidas {undo.changes} alterações deste lote. Registros
            alterados depois ou vinculados a novos trabalhos não serão apagados.
          </p>
          {undo.blockers?.map((b: string) => (
            <p className="error" key={b}>
              {b}
            </p>
          ))}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {undo.canUndo && (
            <>
              <label>
                Digite DESFAZER
                <input
                  aria-label="Confirmar reversão"
                  value={undoText}
                  onChange={(e) => setUndoText(e.target.value)}
                />
              </label>
              <button
                disabled={busy || undoText !== "DESFAZER"}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    let result;
                    do {
                      result = await api("/imports/" + undo.id + "/undo", {
                        method: "POST",
                        body: JSON.stringify({ confirmation: "DESFAZER" }),
                      });
                    } while (result.status === "REVERTING" && running.current);
                    setUndo(null);
                    history.refresh();
                    onChanged();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Revertendo…" : "Confirmar reversão"}
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function SourceMaintenance({
  source,
  removal,
  onClose,
  onSaved,
}: {
  source: Source;
  removal: boolean;
  onClose: () => void;
  onSaved: (outcome?: "deleted" | "deactivated") => void;
}) {
  const [name, setName] = useState(source.name);
  const [active, setActive] = useState(source.active);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={removal ? "Remover origem" : "Editar origem"}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api(
              "/imports/sources/" + encodeURIComponent(source.id),
              removal
                ? { method: "DELETE" }
                : {
                    method: "PATCH",
                    body: JSON.stringify({ name, active }),
                  },
            );
            onSaved(result.outcome);
          } catch (cause) {
            setError((cause as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {removal ? (
          <>
            <p>
              <strong>{source.name}</strong>
            </p>
            <p>Origens com lotes ou registros vinculados serão desativadas.</p>
          </>
        ) : (
          <>
            <label>
              Nome da origem
              <input
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />{" "}
              Origem ativa
            </label>
            <p>Identificação da base · {source.scope}</p>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row-actions">
          <button
            type="button"
            disabled={busy}
            className="secondary"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            className={removal ? "danger-button" : undefined}
          >
            {removal ? "Confirmar remoção" : "Salvar origem"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SourceForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (s: Source) => void;
}) {
  const [form, setForm] = useState({
      name: "",
      system: "SAP",
      scope: "SAP-PRINCIPAL",
      target: "ORDERS",
      isDemo: true,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Nova origem de importação" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            onSaved(
              await api("/imports/sources", {
                method: "POST",
                body: JSON.stringify(form),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome da origem
          <input
            aria-label="Nome da origem"
            required
            minLength={3}
            maxLength={120}
            placeholder="Ordens exportadas do SAP"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Sistema de origem
          <select
            aria-label="Sistema de origem"
            value={form.system}
            onChange={(e) =>
              setForm({
                ...form,
                system: e.target.value,
                scope: e.target.value + "-PRINCIPAL",
              })
            }
          >
            <option value="SAP">SAP — arquivo exportado</option>
            <option value="SKA">SKA — arquivo exportado</option>
            <option value="GENERIC">Planilha genérica</option>
          </select>
        </label>
        <label>
          Identificação da base
          <input
            aria-label="Identificação da base"
            required
            minLength={2}
            maxLength={100}
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
          />
        </label>
        <p>
          Use a mesma identificação para relatórios da mesma base. Ela permite
          reconhecer itens repetidos entre arquivos e origens de mapeamento
          diferentes. Para outra base, escolha outra identificação.
        </p>
        <label>
          O que será importado
          <select
            aria-label="Tipo de importação"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
          >
            {Object.entries(targetLabel).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Classificação
          <select
            aria-label="Classificação dos dados"
            value={String(form.isDemo)}
            onChange={(e) =>
              setForm({ ...form, isDemo: e.target.value === "true" })
            }
          >
            <option value="true">Dados fictícios para teste</option>
            <option value="false">
              Dados fornecidos em exportação autorizada
            </option>
          </select>
        </label>
        <p>
          Envie apenas arquivos que você está autorizado a armazenar nesta
          aplicação. Não são usadas credenciais do SAP.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? "Criando…" : "Salvar origem"}</button>
      </form>
    </Modal>
  );
}
