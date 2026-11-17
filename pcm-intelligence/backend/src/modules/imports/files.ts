import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import yauzl from "yauzl";
import { HttpError } from "../operations/helpers.js";
export type ParsedFile = {
  headers: string[];
  rows: string[][];
  sheets: string[];
  sheet: string;
  headerRow: number;
};
async function inspectZip(buffer: Buffer) {
  await new Promise<void>((resolve, reject) =>
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new HttpError(400, "XLSX inválido"));
          return;
        }
        let declared = 0,
          actual = 0,
          entries = 0,
          failed = false;
        const fail = (message: string) => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(new HttpError(400, message));
        };
        zip.on("error", () => fail("XLSX inválido"));
        zip.on("entry", (entry) => {
          declared += entry.uncompressedSize;
          if (++entries > 250 || declared > 20 * 1024 * 1024) {
            fail("Planilha excede 20 MB descompactados");
            return;
          }
          if (/vbaProject|externalLinks\//i.test(entry.fileName)) {
            fail("Exporte um XLSX sem macros ou vínculos externos");
            return;
          }
          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              fail("XLSX inválido");
              return;
            }
            stream.on("data", (chunk) => {
              actual += chunk.length;
              if (actual > 20 * 1024 * 1024) {
                stream.destroy();
                fail("Planilha excede 20 MB descompactados");
              }
            });
            stream.on("error", () => fail("XLSX inválido"));
            stream.on("end", () => {
              if (!failed) zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (!failed) resolve();
        });
        zip.readEntry();
      },
    ),
  );
}

export async function readFile(
  buffer: Buffer,
  filename: string,
  settings: { sheet?: string; headerRow?: number; delimiter?: string },
): Promise<ParsedFile> {
  if (!buffer.length || buffer.length > 3 * 1024 * 1024)
    throw new HttpError(400, "O arquivo deve ter até 3 MB");
  const headerRow = settings.headerRow || 1;
  let all: string[][], sheets: string[], sheet: string;
  if (filename.toLowerCase().endsWith(".csv")) {
    let text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (text.includes("\uFFFD"))
      throw new HttpError(400, "Salve o CSV com codificação UTF-8");
    let delimiter = settings.delimiter;
    const sep = /^sep=([^\r\n])\r?\n/i.exec(text);
    if (sep) {
      delimiter = delimiter || sep[1];
      text = text.slice(sep[0].length);
    }
    if (!delimiter) {
      const line = text.split(/\r?\n/)[headerRow - 1] || "";
      const counts = new Map([
        [";", 0],
        [",", 0],
        ["\t", 0],
      ]);
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
          if (quoted && line[i + 1] === '"') {
            i++;
            continue;
          }
          quoted = !quoted;
        } else if (!quoted && counts.has(line[i]))
          counts.set(line[i], counts.get(line[i])! + 1);
      }
      delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    }
    try {
      all = parse(text, {
        delimiter,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        max_record_size: 64000,
        cast: false,
      });
    } catch {
      throw new HttpError(400, "CSV malformado: confira delimitador e aspas");
    }
    sheets = ["CSV"];
    sheet = "CSV";
  } else if (filename.toLowerCase().endsWith(".xlsx")) {
    await inspectZip(buffer);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new HttpError(400, "Não foi possível ler o XLSX");
    }
    sheets = wb.worksheets.map((s) => s.name);
    const ws = settings.sheet
      ? wb.getWorksheet(settings.sheet)
      : wb.worksheets[0];
    if (!ws) throw new HttpError(400, "Aba não encontrada");
    sheet = ws.name;
    if (ws.rowCount > 1020 || ws.columnCount > 60)
      throw new HttpError(
        400,
        "Use até 1.000 linhas de dados e 60 colunas por importação",
      );
    all = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 60); c++) {
        const cell = ws.getCell(r, c),
          value = cell.value;
        if (value instanceof Date)
          row.push(value.toISOString().replace(/\.\d{3}Z$/, ""));
        else if (value && typeof value === "object" && "formula" in value)
          row.push(String(value.result ?? ""));
        else if (typeof value === "number") {
          if (!Number.isSafeInteger(value) && Number.isInteger(value))
            throw new HttpError(
              400,
              "Número longo perdeu precisão no Excel. Exporte identificadores como texto.",
            );
          row.push(
            /^0+$/.test(cell.numFmt || "")
              ? String(value).padStart(cell.numFmt.length, "0")
              : String(value),
          );
        } else row.push(cell.text || "");
      }
      all.push(row);
    }
  } else throw new HttpError(400, "Envie somente CSV ou XLSX");
  if (all.length - headerRow > 1000)
    throw new HttpError(
      400,
      "Divida a planilha em arquivos com até 1.000 linhas",
    );
  const headers = (all[headerRow - 1] || []).map((v) => v.trim());
  if (
    !headers.length ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length ||
    headers.length > 60
  )
    throw new HttpError(
      400,
      "Cabeçalhos precisam ser únicos, não vazios e ter até 60 colunas",
    );
  const rows = all
    .slice(headerRow)
    .filter((r) => r.some((v) => String(v).trim()));
  if (!rows.length)
    throw new HttpError(400, "A planilha não tem linhas de dados");
  return { headers, rows, sheets, sheet, headerRow };
}
