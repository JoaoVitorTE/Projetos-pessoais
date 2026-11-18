import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { tagSchema } from "../operations/equipment-identity.js";
import { taskSchema } from "../operations/plan-tasks.js";
import { createHash } from "node:crypto";
import { HttpError } from "../operations/helpers.js";
export const targets = [
  "EQUIPMENT",
  "ORDERS",
  "PLANS",
  "INTERRUPTIONS",
] as const;
export type Target = (typeof targets)[number];
export const fields: Record<
  Target,
  { key: string; label: string; required?: boolean; kind?: string }[]
> = {
  EQUIPMENT: [
    {
      key: "externalKey",
      label: "Chave externa (opcional; padrão TAG + setor)",
    },
    { key: "equipmentId", label: "TAG do equipamento", required: true },
    { key: "equipmentNumber", label: "Número do equipamento (opcional)" },
    { key: "name", label: "Nome do equipamento" },
    { key: "sector", label: "Nome do setor" },
    { key: "criticality", label: "Criticidade", kind: "priority" },
    { key: "status", label: "Estado do equipamento", kind: "equipmentStatus" },
  ],
  ORDERS: [
    { key: "externalKey", label: "Número externo da OS", required: true },
    {
      key: "equipmentId",
      label: "TAG ou número do equipamento",
      required: true,
    },
    { key: "description", label: "Descrição" },
    { key: "type", label: "Tipo de manutenção", kind: "orderType" },
    { key: "status", label: "Status da OS", kind: "orderStatus" },
    { key: "priority", label: "Prioridade", kind: "priority" },
    { key: "technician", label: "Nome do técnico" },
    { key: "openedAt", label: "Data de abertura", kind: "date" },
    { key: "scheduledAt", label: "Data programada / vencimento", kind: "date" },
    { key: "completedAt", label: "Data de conclusão", kind: "date" },
    { key: "notes", label: "Observações" },
    { key: "sector", label: "Setor do equipamento" },
    {
      key: "criticality",
      label: "Criticidade (para novos equipamentos)",
      kind: "priority",
    },
  ],
  PLANS: [
    {
      key: "externalKey",
      label: "Identificador externo do plano",
      required: true,
    },
    {
      key: "equipmentId",
      label: "TAG ou número do equipamento",
      required: true,
    },
    { key: "title", label: "Nome do plano" },
    {
      key: "taskListReference",
      label: "Referência da lista de tarefas (opcional)",
    },
    { key: "taskCode", label: "Código da tarefa / operação (opcional)" },
    {
      key: "taskDescription",
      label: "Descrição da tarefa / operação (opcional)",
    },
    {
      key: "estimatedMinutes",
      label: "Minutos estimados da tarefa (opcional)",
    },
    { key: "type", label: "Preventiva ou lubrificação", kind: "planType" },
    { key: "intervalDays", label: "Periodicidade em dias" },
    {
      key: "nextExecution",
      label: "Próxima execução / vencimento",
      required: true,
      kind: "date",
    },
    { key: "technician", label: "Nome do técnico", required: true },
    { key: "active", label: "Plano ativo", kind: "boolean" },
    { key: "sector", label: "Setor do equipamento" },
    {
      key: "criticality",
      label: "Criticidade (para novos equipamentos)",
      kind: "priority",
    },
  ],
  INTERRUPTIONS: [
    {
      key: "externalKey",
      label: "Identificador externo da ocorrência",
      required: true,
    },
    {
      key: "equipmentId",
      label: "TAG ou número do equipamento",
      required: true,
    },
    { key: "startedAt", label: "Início", required: true, kind: "date" },
    { key: "endedAt", label: "Término", kind: "date" },
    {
      key: "type",
      label: "Planejada ou não planejada",
      kind: "interruptionType",
    },
    { key: "reason", label: "Motivo informado", required: true },
    { key: "description", label: "Descrição" },
    { key: "sector", label: "Setor do equipamento" },
    {
      key: "criticality",
      label: "Criticidade (para novos equipamentos)",
      kind: "priority",
    },
  ],
};
export const choices: Record<string, string[]> = {
  orderStatus: [
    "OPEN",
    "ANALYSIS",
    "SCHEDULED",
    "IN_PROGRESS",
    "WAITING_PART",
    "WAITING_VENDOR",
    "COMPLETED",
    "CANCELLED",
  ],
  orderType: [
    "CORRECTIVE",
    "PREVENTIVE",
    "PREDICTIVE",
    "LUBRICATION",
    "INSPECTION",
  ],
  equipmentStatus: ["UNKNOWN", "RUNNING", "STOPPED", "MAINTENANCE"],
  planType: ["PREVENTIVE", "LUBRICATION"],
  interruptionType: ["PLANNED", "UNPLANNED"],
  priority: ["1", "2", "3"],
  boolean: ["true", "false"],
};
export const mappingSchema = z.record(z.string(), z.string().max(200));
export const optionsSchema = z
  .object({
    dateFormat: z.enum(["BR", "ISO"]).default("BR"),
    timezone: z.enum(["America/Sao_Paulo", "UTC"]).default("America/Sao_Paulo"),
    secondKeyColumn: z.string().max(200).optional(),
    createReferences: z.boolean().default(false),
    defaultSectorId: z.string().max(100).optional(),
    defaultCriticality: z.number().int().min(1).max(3).optional(),
    defaultPriority: z.number().int().min(1).max(3).optional(),
    defaultType: z.string().max(40).optional(),
    defaultStatus: z.string().max(40).optional(),
    defaultIntervalDays: z.number().int().min(1).max(3660).optional(),
    allowOverwriteModified: z.boolean().default(false),
    valueMappings: z
      .record(z.string(), z.record(z.string(), z.string().max(80)))
      .default({}),
  })
  .strict();
export type ImportOptions = z.infer<typeof optionsSchema>;
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export const fingerprint = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
function parseDate(value: string, o: ImportOptions) {
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const iso =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
        value,
      );
    if (!iso) throw Error("Data ISO inválida");
    const check = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (
      check.getUTCFullYear() !== +iso[1] ||
      check.getUTCMonth() !== +iso[2] - 1 ||
      check.getUTCDate() !== +iso[3] ||
      +iso[4] > 23 ||
      +iso[5] > 59 ||
      +(iso[6] || 0) > 59
    )
      throw Error("Data de calendário inválida");
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw Error("Data inválida");
    return date.toISOString();
  }
  let match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      value,
    );
  let y: number,
    m: number,
    d: number,
    h = 0,
    min = 0,
    s = 0;
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
    h = Number(match[4] || 0);
    min = Number(match[5] || 0);
    s = Number(match[6] || 0);
  } else if (
    o.dateFormat === "BR" &&
    (match =
      /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
        value,
      ))
  ) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    h = Number(match[4] || 0);
    min = Number(match[5] || 0);
    s = Number(match[6] || 0);
  } else
    throw Error(
      "Data fora do formato configurado. Use dd/MM/aaaa ou ISO, com horário opcional.",
    );
  const utc = new Date(Date.UTC(y!, m! - 1, d!, h, min, s));
  if (
    utc.getUTCFullYear() !== y! ||
    utc.getUTCMonth() !== m! - 1 ||
    utc.getUTCDate() !== d! ||
    h > 23 ||
    min > 59 ||
    s > 59
  )
    throw Error("Data de calendário inválida");
  const text = `${String(y!).padStart(4, "0")}-${String(m!).padStart(2, "0")}-${String(d!).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return fromZonedTime(text, o.timezone).toISOString();
}
export type Normalized = {
  rowNumber: number;
  externalKey: string;
  data: Record<string, any>;
  hash: string;
  error?: string;
};
export function normalizeRow(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  o: ImportOptions,
  target: Target,
  rowNumber: number,
): Normalized {
  const read = (column: string | undefined) =>
    column ? String(row[headers.indexOf(column)] ?? "").trim() : "";
  const data: Record<string, unknown> = {};
  let externalKey = read(mapping.externalKey);
  try {
    for (const spec of fields[target]) {
      const value = read(mapping[spec.key]);
      if (!value) {
        if (spec.required)
          throw Error("Campo obrigatório sem valor: " + spec.label);
        continue;
      }
      const maxLength =
        spec.key === "taskDescription"
          ? 1000
          : spec.key === "reason"
            ? 160
            : ["name", "title", "sector", "technician"].includes(spec.key)
              ? 120
              : 2000;
      if (value.length > maxLength || value.includes("\0"))
        throw Error("Conteúdo inválido ou muito longo: " + spec.label);
      if (spec.kind === "date") data[spec.key] = parseDate(value, o);
      else if (spec.kind && choices[spec.kind]) {
        const mapped = o.valueMappings[spec.key]?.[value] ?? value;
        if (!choices[spec.kind].includes(mapped))
          throw Error('Mapeie o valor "' + value + '" em ' + spec.label);
        data[spec.key] =
          spec.kind === "priority"
            ? Number(mapped)
            : spec.kind === "boolean"
              ? mapped === "true"
              : mapped;
      } else if (spec.key === "intervalDays") {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 3660)
          throw Error("Periodicidade deve ser de 1 a 3660 dias");
        data[spec.key] = n;
      } else data[spec.key] = value;
    }
    externalKey = String(data.externalKey || "");
    if (target === "EQUIPMENT") {
      data.tag = tagSchema.parse(data.equipmentId);
      data.equipmentId = data.tag;
      if (!externalKey)
        externalKey = JSON.stringify([
          data.tag,
          String(data.sector || o.defaultSectorId || "")
            .trim()
            .toUpperCase(),
        ]);
    }
    if (o.secondKeyColumn) {
      const second = read(o.secondKeyColumn);
      if (!second) throw Error("Segunda parte da chave está vazia");
      externalKey = JSON.stringify([externalKey, second]);
    }
    if (externalKey.length > 512) throw Error("Chave externa muito longa");
    delete data.externalKey;
    if (
      target === "PLANS" &&
      (data.taskCode || data.taskDescription || data.estimatedMinutes)
    ) {
      const duration = data.estimatedMinutes
        ? Number(String(data.estimatedMinutes).replace(",", "."))
        : null;
      data.tasks = [
        taskSchema.parse({
          code: data.taskCode || "",
          description: data.taskDescription || "",
          estimatedMinutes: duration,
        }),
      ];
    }
    delete data.taskCode;
    delete data.taskDescription;
    delete data.estimatedMinutes;
    if (data.equipmentId && String(data.equipmentId).length > 100)
      throw Error("Código de equipamento muito longo");
    if (
      data.endedAt &&
      (!data.startedAt ||
        new Date(String(data.endedAt)) < new Date(String(data.startedAt)))
    )
      throw Error("Término anterior ao início");
    if (data.startedAt && new Date(String(data.startedAt)) > new Date())
      throw Error("Início da interrupção está no futuro");
    if (data.endedAt && new Date(String(data.endedAt)) > new Date())
      throw Error("Término está no futuro");
    if (
      data.completedAt &&
      data.openedAt &&
      new Date(String(data.completedAt)) < new Date(String(data.openedAt))
    )
      throw Error("Conclusão anterior à abertura");
    if (data.completedAt && data.status && data.status !== "COMPLETED")
      throw Error("Conclusão informada para uma ordem não concluída");
    return {
      rowNumber,
      externalKey,
      data,
      hash: fingerprint(
        Object.fromEntries(
          Object.entries(data).filter(
            ([key]) =>
              target === "EQUIPMENT" ||
              !["sector", "criticality"].includes(key),
          ),
        ),
      ),
    };
  } catch (error) {
    return {
      rowNumber,
      externalKey,
      data,
      hash: "",
      error: (error as Error).message,
    };
  }
}
export function validateMapping(
  target: Target,
  mapping: Record<string, string>,
  headers: string[],
  o: ImportOptions,
) {
  for (const f of fields[target])
    if (f.required && !mapping[f.key])
      throw new HttpError(400, "Mapeie " + f.label);
  for (const column of Object.values(mapping))
    if (column && !headers.includes(column))
      throw new HttpError(400, "Coluna ausente: " + column);
  if (o.secondKeyColumn && !headers.includes(o.secondKeyColumn))
    throw new HttpError(400, "Segunda coluna da chave ausente");
}
