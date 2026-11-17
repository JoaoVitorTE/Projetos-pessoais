import { readFile } from "./files.js";
export interface ImportAdapter {
  system: string;
  parse: typeof readFile;
}
// Formatos são definidos pelo mapeamento do usuário; nenhum layout proprietário é presumido.
export class SapExportImportAdapter implements ImportAdapter {
  system = "SAP";
  parse = readFile;
}
export class SkaReportsImportAdapter implements ImportAdapter {
  system = "SKA";
  parse = readFile;
}
export class GenericImportAdapter implements ImportAdapter {
  system = "GENERIC";
  parse = readFile;
}
export function adapter(system: string): ImportAdapter {
  return system === "SAP"
    ? new SapExportImportAdapter()
    : system === "SKA"
      ? new SkaReportsImportAdapter()
      : new GenericImportAdapter();
}
