export type NumberStyle = "decimal" | "arabic-indic" | "persian";
export interface PageSetup { width: number; height: number; margin: number; numbering: boolean; numberStyle: NumberStyle; start: number }
export function validPageSetup(s: PageSetup): boolean {
  return [s.width, s.height, s.margin, s.start].every(Number.isFinite) && s.width >= 300 && s.height >= 300 &&
    s.width <= 2400 && s.height <= 2400 && s.margin >= 24 && s.margin * 2 < Math.min(s.width, s.height) - 100 &&
    Number.isInteger(s.start) && s.start >= 1 && s.start <= 99999;
}
export function pageNumber(value: number, style: NumberStyle): string {
  const digits = style === "persian" ? "۰۱۲۳۴۵۶۷۸۹" : style === "arabic-indic" ? "٠١٢٣٤٥٦٧٨٩" : "0123456789";
  return String(value).replace(/\d/g, n => digits[Number(n)]);
}
export function tableHtml(rows: number, columns: number): string {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > 20 || columns < 1 || columns > 10) throw new Error("Choose 1–20 rows and 1–10 columns.");
  return '<table data-harfsaz-table="true" style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody>' +
    Array.from({ length: rows }, () => '<tr>' + Array.from({ length: columns }, () => '<td style="border:1px solid #a89c8f;padding:8px;vertical-align:top"><div><br></div></td>').join('') + '</tr>').join('') + '</tbody></table><div><br></div>';
}

export function editTable(cell: HTMLTableCellElement, action: "row" | "column" | "remove-row" | "remove-column" | "remove-table"): void {
  const table = cell.closest("table");
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!table || !row) return;
  if (action === "remove-table") { table.remove(); return; }
  if (action === "row" && table.rows.length < 20) {
    const next = row.cloneNode(true) as HTMLTableRowElement;
    Array.from(next.cells).forEach(c => { c.innerHTML = "<div><br></div>"; });
    row.after(next);
  }
  if (action === "column" && row.cells.length < 10) {
    const index = cell.cellIndex;
    Array.from(table.rows).forEach(r => {
      const source = r.cells[index];
      if (!source) return;
      const next = source.cloneNode(false) as HTMLTableCellElement;
      next.innerHTML = "<div><br></div>"; source.after(next);
    });
  }
  if (action === "remove-row") { if (table.rows.length === 1) table.remove(); else row.remove(); }
  if (action === "remove-column") {
    if (row.cells.length === 1) table.remove();
    else { const index = cell.cellIndex; Array.from(table.rows).forEach(r => r.cells[index]?.remove()); }
  }
}
