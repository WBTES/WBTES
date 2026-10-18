import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx-js-style");
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/spreadsheet-format.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(require, module, module.exports);
const { formatReportWorkbook } = module.exports;

function fixture() {
  const workbook = XLSX.utils.book_new();
  const rows = [{
    Teacher: "Sample Teacher With A Longer Name", Subject: "Professional Education",
    Department: "College of Education", Program: "BSED", YearLevel: "4th",
    Period: "First Semester Evaluation 2026-2027", AverageScore: 4.6,
    AnonymousComment: "Explains difficult topics carefully and gives practical examples. ".repeat(9),
    "Q1: Is approachable and pleasant when students ask for clarification": 5,
    "Q2: Maintains poise or calmness in handling conflicts and challenging classroom situations": 4,
  }];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Evaluations");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Teacher", rows[0].Teacher], ["Average", 4.6], ["Report status", "Partial - evaluation is still in progress"],
  ]), "Summary");
  return { workbook, rows };
}

test("Excel headings and comments wrap with readable column widths and sufficient row height", () => {
  const { workbook } = fixture();
  formatReportWorkbook(workbook);
  const sheet = workbook.Sheets.Evaluations;
  assert.equal(sheet.A1.s.font.bold, true);
  assert.equal(sheet.A1.s.font.color.rgb, "FFFFFF");
  assert.deepEqual(sheet.I1.s.alignment, { horizontal: "center", vertical: "center", wrapText: true });
  assert.equal(sheet.H2.s.alignment.horizontal, "left");
  assert.equal(sheet.H2.s.alignment.wrapText, true);
  assert.equal(sheet.G2.s.alignment.horizontal, "center");
  assert.equal(sheet.G2.z, "0.00");
  assert.equal(sheet.I2.z, "0");
  assert.equal(sheet["!cols"][7].wch, 64);
  assert.equal(sheet["!cols"][8].wch, 40);
  assert.ok(sheet["!rows"][0].hpt >= 63);
  assert.ok(sheet["!rows"][1].hpt > 100);
  assert.deepEqual(sheet["!autofilter"], { ref: sheet["!ref"] });
});

test("summary sheets use readable key/value alignment without a misleading table filter", () => {
  const { workbook } = fixture();
  formatReportWorkbook(workbook);
  const sheet = workbook.Sheets.Summary;
  assert.equal(sheet.A1.s.font.bold, true);
  assert.equal(sheet.A1.s.alignment.horizontal, "left");
  assert.equal(sheet.B1.s.alignment.wrapText, true);
  assert.equal(sheet.B2.z, "0.00");
  assert.deepEqual(sheet["!cols"].map((column) => column.wch), [36, 80]);
  assert.equal(sheet["!autofilter"], undefined);
});

test("serialized Excel preserves numeric values, text, widths, row heights and actual wrap styles", () => {
  const { workbook, rows } = fixture();
  formatReportWorkbook(workbook);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const restored = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.Evaluations), rows);
  assert.equal(restored.Sheets.Evaluations.G2.t, "n");
  assert.equal(restored.Sheets.Evaluations.G2.v, 4.6);
  assert.equal(restored.Sheets.Evaluations.G2.z, "0.00");
  assert.ok(restored.Sheets.Evaluations["!cols"][7].wch >= 63);
  assert.equal(restored.Sheets.Evaluations["!rows"][0].hpt, workbook.Sheets.Evaluations["!rows"][0].hpt);
  const archive = XLSX.CFB.read(buffer, { type: "buffer" });
  const index = archive.FullPaths.findIndex((path) => path.endsWith("xl/styles.xml"));
  assert.ok(index >= 0);
  const xml = Buffer.from(archive.FileIndex[index].content).toString("utf8");
  assert.match(xml, /wrapText="true"/);
  assert.match(xml, /horizontal="center"/);
  assert.match(xml, /horizontal="left"/);
});

test("very long or multiline text is not truncated and row heights stay within Excel's limit", () => {
  const workbook = XLSX.utils.book_new();
  const comment = "A full anonymous comment with details.\n".repeat(100);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ AnonymousComment: comment }]), "Comments");
  formatReportWorkbook(workbook);
  assert.equal(workbook.Sheets.Comments.A2.v, comment);
  assert.equal(workbook.Sheets.Comments["!rows"][1].hpt, 409.5);
  assert.equal(workbook.Sheets.Comments.A2.s.alignment.wrapText, true);
});

test("formatting handles empty sheets and existing anonymous reports without inventing cells or values", () => {
  const { workbook } = fixture();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([]), "Empty");
  const before = XLSX.utils.sheet_to_json(workbook.Sheets.Evaluations);
  assert.equal(formatReportWorkbook(workbook), workbook);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Evaluations), before);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Empty), []);
});
