import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { loadWorkbook, readFile } from "../imports/files.js";
import { HttpError } from "../operations/helpers.js";

const field = (
  key: string,
  label: string,
  required = false,
  ...aliases: string[]
) => ({ key, label, required, aliases });
export const tabs = {
  Máquinas: [
    field("tag", "TAG", true),
    field(
      "equipmentNumber",
      "Nº equipamento",
      false,
      "Equipamento",
      "Número do equipamento",
    ),
    field("name", "Nome do equipamento", true, "Denominação"),
    field("sector", "Setor", true),
    field("criticality", "Criticidade"),
    field("status", "Situação"),
  ],
  Ordens: [
    field(
      "workCenter",
      "Centro de trabalho",
      false,
      "CenTrab",
      "Centro trabalho",
    ),
    field("orderType", "Tipo de ordem", false, "Tipo"),
    field("orderNumber", "Ordem", true, "Nº ordem", "Número da ordem"),
    field("noteNumber", "Nota", false, "Número da nota"),
    field("baseDate", "Data-base", false, "Data base"),
    field("entryDate", "Data de entrada", false, "Data entrada"),
    field("description", "Descritivo", false, "Descrição", "Texto breve"),
    field("importance", "Importância", false, "Prioridade"),
    field("systemStatus", "Status do sistema", false, "Status sistema"),
    field(
      "equipmentNumber",
      "Nº equipamento",
      false,
      "Equipamento",
      "Número do equipamento",
    ),
    field(
      "equipmentName",
      "Nome do equipamento",
      false,
      "Denominação do equipamento",
    ),
    field("locationName", "Nome do local de instalação"),
    field(
      "locationCode",
      "Local de instalação",
      false,
      "Local instalação",
      "Código do local de instalação",
    ),
    field("tag", "TAG"),
    field("sector", "Setor"),
  ],
  Notas: [
    field("noteNumber", "Nota", true, "Número da nota"),
    field("orderNumber", "Ordem", false, "Número da ordem"),
    field("description", "Descrição", false, "Descritivo", "Texto breve"),
    field("date", "Data da nota", false, "Data"),
    field("equipmentNumber", "Nº equipamento", false, "Equipamento"),
    field("equipmentName", "Nome do equipamento"),
    field("locationName", "Nome do local de instalação"),
    field(
      "locationCode",
      "Local de instalação",
      false,
      "Código do local de instalação",
    ),
    field("tag", "TAG"),
    field("sector", "Setor"),
  ],
  Apontamentos: [
    field("orderNumber", "Ordem", true, "Número da ordem"),
    field(
      "personnelNumber",
      "Matrícula",
      true,
      "Nº pessoal",
      "Nº pessoal técnico",
    ),
    field("technicianName", "Nome do técnico", false, "Nome"),
    field("date", "Data de início", false, "Data início"),
    field("startTime", "Hora inicial", false, "Hora início"),
    field("endTime", "Hora final", false, "Hora fim"),
    field(
      "hours",
      "Horas trabalhadas",
      false,
      "Total de horas",
      "Trabalho real",
    ),
    field("registeredBy", "Registrado por", false, "Usuário", "Criado por"),
    field("orderType", "Tipo de ordem", false, "Tipo"),
    field("workCenter", "Centro de trabalho"),
    field("executionLocation", "Local de execução"),
    field("locationCode", "Local de instalação"),
    field("systemStatus", "Status", false, "Status do sistema"),
    field(
      "confirmationText",
      "Texto de confirmação",
      false,
      "Texto confirmação",
    ),
    field(
      "confirmationId",
      "Confirmação",
      false,
      "Nº confirmação",
      "Identificador de confirmação",
    ),
    field("counter", "Contador", false, "Contador SAP"),
  ],
};
export type Tab = keyof typeof tabs;
export const tabNames = Object.keys(tabs) as Tab[];
export const mappingSchema = z
  .record(
    z.record(z.string().max(250)).refine((x) => Object.keys(x).length <= 25),
  )
  .refine((x) => Object.keys(x).every((key) => tabNames.includes(key as Tab)));
export type Mapping = z.infer<typeof mappingSchema>;
export type Values = Record<string, string>;
export type WorkbookRow = {
  line: number;
  values: Values;
  columns: { header: string; value: string }[];
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export async function workbookPreview(buffer: Buffer, mapping: Mapping) {
  const workbook = await loadWorkbook(buffer);
  return Promise.all(
    tabNames.map(async (tab) => {
      const parsed = await readFile(buffer, "sap.xlsx", {
        workbook,
        sheet: tab,
        allowEmpty: true,
        allowUnmapped: true,
      }).catch((error) => {
        throw new HttpError(400, `${tab}: ${(error as Error).message}`);
      });
      const issues: string[] = [];
      const resolved: Record<string, number> = {};
      for (const definition of tabs[tab]) {
        const selected = mapping[tab]?.[definition.key];
        const names = [definition.label, ...definition.aliases].map(normalize);
        const matches = parsed.headers.flatMap((header, index) =>
          (selected ? header === selected : names.includes(normalize(header)))
            ? [index]
            : [],
        );
        if (matches.length === 1) resolved[definition.key] = matches[0];
        else if (matches.length > 1)
          issues.push(
            `${definition.label}: cabeçalho ambíguo nas colunas ${matches.map((i) => i + 1).join(", ")}`,
          );
        else if (selected || definition.required)
          issues.push(
            `${definition.label}: cabeçalho “${selected || definition.label}” ausente`,
          );
      }
      for (const [key, index] of Object.entries(resolved)) {
        if (
          Object.values(resolved).filter((other) => other === index).length > 1
        )
          issues.push(`${key}: coluna ${index + 1} mapeada mais de uma vez`);
      }
      const rows = parsed.rows.map(
        (row, index): WorkbookRow => ({
          line: parsed.rowNumbers[index],
          values: Object.fromEntries(
            Object.entries(resolved).map(([key, column]) => {
              const value = row[column]?.trim() || "";
              if (key === "startTime" || key === "endTime") {
                const clock = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})/.exec(
                  value,
                );
                return [key, clock?.[1] ?? value];
              }
              return [key, value];
            }),
          ),
          columns: parsed.headers.map((header, column) => ({
            header,
            value: row[column] || "",
          })),
        }),
      );
      return {
        tab,
        headers: parsed.headers,
        issues,
        rows,
        fields: tabs[tab],
        mapping: Object.fromEntries(
          Object.entries(resolved).map(([key, index]) => [
            key,
            parsed.headers[index],
          ]),
        ),
      };
    }),
  );
}

export function sapDate(value?: string) {
  if (!value) return null;
  const br = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(value);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : value.split("T")[0];
  const date = new Date(iso + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(+date) ||
    date.toISOString().slice(0, 10) !== iso
  )
    throw new Error(`Data inválida: ${value}`);
  return date;
}

export function sapHours(value?: string) {
  if (!value) return null;
  const decimal =
    value.includes(",") && /^\d{1,3}(\.\d{3})+,\d+$/.test(value)
      ? value.replaceAll(".", "").replace(",", ".")
      : value.replace(",", ".");
  return /^\d{1,12}(\.\d{1,12})?$/.test(decimal)
    ? new Prisma.Decimal(decimal)
    : null;
}

export async function workbookTemplate() {
  const workbook = new ExcelJS.Workbook();
  for (const tab of tabNames) {
    const sheet = workbook.addWorksheet(tab, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = tabs[tab].map(({ label }) => ({
      header: label,
      width: Math.max(16, label.length + 3),
      style: { numFmt: "@" },
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF164E63" },
    };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
