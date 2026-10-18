import * as XLSX from "xlsx-js-style";

function columnWidth(header: string, longestValue: number) {
  const key = header.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (/^Q\d+:/.test(header)) return 40;
  if (key === "questiontext") return 72;
  if (/(comment|summary|recommendation|examples|answerchoices)/.test(key)) return 64;
  if (/(teacher|studentname|fullname)/.test(key) || key === "student") return 30;
  if (/(department|period)/.test(key)) return 34;
  if (/(subject|category|theme)/.test(key)) return 30;
  if (/(program|course|feedbacktype)/.test(key)) return 24;
  return Math.max(14, Math.min(42, Math.max(header.length, longestValue) + 3));
}

function wrappedLineCount(value: unknown, width: number) {
  const capacity = Math.max(1, Math.floor(width * 0.85));
  return String(value ?? "").split(/\r?\n/).reduce((total, line) => {
    let lines = 1;
    let used = 0;
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const length = word.length;
      if (used && used + 1 + length <= capacity) used += 1 + length;
      else {
        if (used) lines++;
        lines += Math.floor(Math.max(0, length - 1) / capacity);
        used = ((length - 1) % capacity) + 1;
      }
    }
    return total + lines;
  }, 0);
}

export function formatReportWorkbook(workbook: XLSX.WorkBook) {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const summary = name === "Summary" || name === "Report Summary";
    const headers: string[] = [];
    const widths: number[] = [];
    for (let column = range.s.c; column <= range.e.c; column++) {
      const header = String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]?.v ?? "");
      headers[column] = header;
      let longest = 0;
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const value = sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
        for (const line of String(value ?? "").split(/\r?\n/)) longest = Math.max(longest, line.length);
      }
      widths[column] = summary ? (column === range.s.c ? 36 : 80) : columnWidth(header, longest);
    }
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    sheet["!rows"] = [];
    if (!summary && range.e.r > range.s.r) sheet["!autofilter"] = { ref: sheet["!ref"] };

    for (let row = range.s.r; row <= range.e.r; row++) {
      const headerRow = !summary && row === range.s.r;
      let lines = 1;
      for (let column = range.s.c; column <= range.e.c; column++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
        if (!cell) continue;
        const labelCell = summary && column === range.s.c;
        const numeric = cell.t === "n";
        const description = summary
          ? String(sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c })]?.v ?? "")
          : headers[column];
        cell.s = {
          font: { name: "Calibri", sz: 11, bold: headerRow || labelCell, color: { rgb: headerRow ? "FFFFFF" : "1F2937" } },
          fill: { patternType: "solid", fgColor: { rgb: headerRow ? "1E3A5F" : labelCell ? "EAF0F6" : row % 2 ? "FFFFFF" : "F8FAFC" } },
          alignment: { horizontal: headerRow || numeric ? "center" : "left", vertical: headerRow ? "center" : "top", wrapText: true },
          border: { bottom: { style: "thin", color: { rgb: "D6DFE8" } } },
        };
        if (numeric) {
          cell.z = !/^Q\d+:/.test(description) && /(average|rating|score)/i.test(description)
            && !/(count|responses)/i.test(description) ? "0.00" : Number.isInteger(cell.v) ? "0" : "0.00";
        }
        lines = Math.max(lines, wrappedLineCount(cell.v, widths[column]));
      }
      // Excel supports row heights up to 409.5 points. Cell values are never truncated.
      sheet["!rows"][row] = { hpt: Math.min(409.5, Math.max(headerRow ? 36 : 26, lines * (headerRow ? 17 : 15) + 12)) };
    }
  }
  return workbook;
}
