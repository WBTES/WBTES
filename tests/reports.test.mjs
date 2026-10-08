import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default;
const XLSX = require("xlsx");

function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

const participationModule = loadModule("lib/report-participation.ts");
const { buildReportParticipation, participationStatus } = participationModule;
const { groupReportRatings } = loadModule("lib/report-ratings.ts");
function exporters() {
  const pdfs = [];
  const books = [];
  const tables = [];
  const reports = loadModule("lib/reports.ts", {
    "jspdf": { default: function (options) {
      const document = new jsPDF(options);
      document.save = (filename) => pdfs.push({ document, filename });
      return document;
    } },
    "jspdf-autotable": { default: (document, options) => {
      tables.push(options);
      autoTable(document, options);
    } },
    "xlsx": { ...XLSX, writeFile: (workbook, filename) => books.push({ workbook, filename }) },
    "@/lib/utils-extras": { fmtDateTime: () => "2026-10-05 10:00" },
    "@/lib/report-participation": participationModule,
  });
  return { ...reports, pdfs, books, tables };
}

const meta = { teacher: "Teacher One", department: "CABAIT", period: "First semester" };
const lookups = { teachers: { teacher1: "Teacher One" }, subjects: { subject1: "Subject One" }, departments: { cabait: "CABAIT" }, periods: { period1: "First semester" } };
function fixture(responseCount = 3, assigned = 43) {
  const scope = { teacherId: "teacher1", subjectId: "subject1", departmentId: "cabait", periodId: "period1" };
  const evaluations = Array.from({ length: responseCount }, (_, index) => ({
    ...scope, id: `evaluation${index}`, assignmentId: "assignment1", averageScore: index % 2 ? 5 : 4, ratings: { question1: 4 }, comment: "Anonymous feedback", anonymous: true,
  }));
  const progress = Array.from({ length: assigned }, (_, index) => ({
    ...scope, id: `task${index}`, studentId: `private-student-${index}`, status: index < responseCount ? "completed" : "pending",
  }));
  return { evaluations, progress, participation: buildReportParticipation(evaluations, progress) };
}

test("partial participation reports contain 3 evaluated, 43 assigned and 40 pending", () => {
  const input = fixture();
  assert.deepEqual(input.participation[0], { teacherId: "teacher1", subjectId: "subject1", departmentId: "cabait", periodId: "period1", assigned: 43, completed: 3, pending: 40, responses: 3 });
  assert.equal(participationStatus(input.participation[0]), "Partial");
  assert.equal(JSON.stringify(input.participation).includes("private-student"), false);
});

test("participation separates teacher subjects and periods and deduplicates tasks", () => {
  const input = fixture();
  input.progress.push(input.progress[0]);
  input.progress.push({ ...input.progress[0], id: "another-subject", subjectId: "subject2" });
  input.progress.push({ ...input.progress[0], id: "another-period", periodId: "period2" });
  const rows = buildReportParticipation(input.evaluations, input.progress);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].assigned, 43);
  assert.equal(rows[1].responses, 0);
  assert.equal(rows[2].responses, 0);
});

test("partial Admin PDF includes participation counts and preliminary scores", () => {
  const input = fixture();
  const exporter = exporters();
  exporter.exportToPDF(input.evaluations, meta, lookups, { participation: input.participation, partial: true });
  assert.equal(exporter.pdfs.length, 1);
  assert.deepEqual(exporter.tables[0].rows ?? exporter.tables[0].body, [["Teacher One", "Subject One", "CABAIT", "First semester", 43, 3, 40, "Partial"]]);
  assert.equal(exporter.tables[1].body.length, 3);
  const document = exporter.pdfs[0].document.output();
  assert.ok(document.includes("Partial Evaluation Report"));
  assert.ok(document.includes("Preliminary average"));
  assert.equal(document.includes("private-student"), false);
});

test("partial Admin Excel includes all submitted responses and a count summary", () => {
  const input = fixture();
  const exporter = exporters();
  exporter.exportToExcel(input.evaluations, meta, lookups, { participation: input.participation, partial: true });
  const workbook = exporter.books[0].workbook;
  const evaluations = XLSX.utils.sheet_to_json(workbook.Sheets.Evaluations);
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(workbook.Sheets.Summary, { header: 1 }));
  const counts = XLSX.utils.sheet_to_json(workbook.Sheets["Teacher Participation"]);
  assert.equal(evaluations.length, 3);
  assert.equal(summary.Responses, 3);
  assert.match(summary["Report status"], /^Partial/);
  assert.equal(summary["Assigned evaluation tasks"], 43);
  assert.equal(summary["Pending evaluation tasks"], 40);
  assert.equal(counts[0]["Students evaluated"], 3);
  assert.equal(counts[0].Assigned, 43);
  assert.equal(counts[0].Pending, 40);
  assert.equal(JSON.stringify(counts).includes("private-student"), false);
});

test("reports can be downloaded before the first student responds without a fake zero rating", () => {
  const input = fixture(0);
  const exporter = exporters();
  exporter.exportToPDF(input.evaluations, meta, lookups, { participation: input.participation, partial: true });
  exporter.exportToExcel(input.evaluations, meta, lookups, { participation: input.participation, partial: true });
  assert.ok(exporter.pdfs[0].document.output().includes("Not available - no submitted responses"));
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(exporter.books[0].workbook.Sheets.Summary, { header: 1 }));
  assert.equal(summary["Preliminary average"], "Not available");
  assert.equal(summary["Pending evaluation tasks"], 43);
});

test("completed reports retain their final label and count every evaluated student", () => {
  const input = fixture(43);
  const exporter = exporters();
  assert.equal(participationStatus(input.participation[0]), "Complete");
  exporter.exportToExcel(input.evaluations, meta, lookups, { participation: input.participation, partial: false });
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(exporter.books[0].workbook.Sheets.Summary, { header: 1 }));
  assert.equal(summary["Report status"], "Complete");
  assert.equal(summary.Responses, 43);
  assert.equal(summary["Pending evaluation tasks"], 0);
  assert.equal(Object.hasOwn(summary, "Preliminary average"), false);
});

test("HR and Department Head participation exports never contain scores, answers or comments", () => {
  const input = fixture();
  const exporter = exporters();
  exporter.exportParticipationReport("pdf", input.participation, meta.period, lookups);
  exporter.exportParticipationReport("excel", input.participation, meta.period, lookups);
  const counts = XLSX.utils.sheet_to_json(exporter.books[0].workbook.Sheets["Teacher Participation"]);
  assert.equal(counts[0]["Students evaluated"], 3);
  const output = JSON.stringify(counts) + exporter.pdfs[0].document.output();
  for (const forbidden of ["Anonymous feedback", "averageScore", "question1", "private-student"]) assert.equal(output.includes(forbidden), false);
  assert.equal(exporter.tables.length, 1);
});

test("large participation summaries paginate inside the PDF pages", () => {
  const input = fixture();
  const exporter = exporters();
  const participation = Array.from({ length: 80 }, (_, index) => ({ ...input.participation[0], teacherId: `teacher${index}` }));
  exporter.exportToPDF(input.evaluations, meta, lookups, { participation, partial: true });
  const document = exporter.pdfs[0].document;
  assert.ok(document.getNumberOfPages() > 1);
  assert.ok(document.lastAutoTable.finalY < document.internal.pageSize.getHeight());
});

test("historical responses with unavailable assignments are not labeled complete", () => {
  const input = fixture();
  const participation = buildReportParticipation(input.evaluations, []);
  const exporter = exporters();
  exporter.exportParticipationReport("excel", participation, meta.period, lookups);
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(exporter.books[0].workbook.Sheets.Summary, { header: 1 }));
  assert.equal(summary["Report status"], "Historical (assignment unavailable)");
  assert.equal(summary["Submitted responses"], 3);
});

test("PDF includes grouped finalized ratings without dropping anonymous response details", () => {
  const input = fixture(3, 3);
  const exporter = exporters();
  exporter.exportToPDF(input.evaluations, meta, lookups, { participation: input.participation, finalizedRatings: groupReportRatings(input.evaluations) });
  assert.equal(exporter.tables[1].body.length, 1);
  assert.deepEqual(exporter.tables[1].body[0], ["Teacher One", "Subject One", "CABAIT", "", "", "First semester", 3, "4.33"]);
  assert.equal(exporter.tables[2].body.length, 3);
  assert.ok(exporter.pdfs[0].document.output().includes("Finalized ratings"));
});

test("Excel includes one finalized summary row and keeps every anonymous evaluation", () => {
  const input = fixture(3, 3);
  const exporter = exporters();
  exporter.exportToExcel(input.evaluations, meta, lookups, { finalizedRatings: groupReportRatings(input.evaluations) });
  const workbook = exporter.books[0].workbook;
  const summaries = XLSX.utils.sheet_to_json(workbook.Sheets["Finalized Ratings"]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]["Finalized responses"], 3);
  assert.equal(summaries[0]["Average rating"], 4.33);
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Evaluations).length, 3);
});

test("partial exports distinguish finalized summaries from preliminary response details", () => {
  const input = fixture(3, 43);
  const exporter = exporters();
  exporter.exportToExcel(input.evaluations, meta, lookups, { participation: input.participation, partial: true, finalizedRatings: [] });
  const workbook = exporter.books[0].workbook;
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets["Finalized Ratings"]), []);
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Evaluations).length, 3);
  const summary = Object.fromEntries(XLSX.utils.sheet_to_json(workbook.Sheets.Summary, { header: 1 }));
  assert.match(summary["Report status"], /^Partial/);
  assert.equal(summary["Preliminary average"], 13 / 3);
});
