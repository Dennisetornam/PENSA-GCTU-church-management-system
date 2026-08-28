// Report serializers: CSV (pure) and Excel (SheetJS).
import * as XLSX from "xlsx";

export interface Column {
  key: string;
  label: string;
}
export type Row = Record<string, unknown>;

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: Column[], rows: Row[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(",")).join("\n");
  return body ? `${header}\n${body}` : header;
}

export function toXlsx(sheetName: string, columns: Column[], rows: Row[]): Uint8Array {
  const aoa = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r[c.key] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** One workbook with a sheet per group (e.g. a sheet per cell). Sheet names are
 *  sanitised + de-duplicated to satisfy Excel's constraints. */
export function toXlsxSheets(sheets: { name: string; columns: Column[]; rows: Row[] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const clean = (n: string) => {
    let base = (n || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
    let name = base, i = 2;
    while (used.has(name.toLowerCase())) name = `${base.slice(0, 25)} ${i++}`;
    used.add(name.toLowerCase());
    return name;
  };
  const list = sheets.length ? sheets : [{ name: "Empty", columns: [{ key: "x", label: "—" }], rows: [] }];
  for (const s of list) {
    const aoa = [s.columns.map((c) => c.label), ...s.rows.map((r) => s.columns.map((c) => r[c.key] ?? ""))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), clean(s.name));
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
