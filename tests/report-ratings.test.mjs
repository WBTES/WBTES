import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadModule(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const { groupReportRatings } = loadModule("lib/report-ratings.ts");
const results = loadModule("lib/evaluation-results.ts");
const { buildAnalytics } = loadModule("lib/analytics.ts", { "./evaluation-results": results, "./report-participation": loadModule("lib/report-participation.ts") });
const { FinalizedRatingsTable } = loadModule("components/reports/finalized-ratings-table.tsx");
const programs = [{ id: "bsit", code: "BSIT", departmentId: "cabait" }];
const scope = { teacherId: "eulalia", subjectId: "cap102", departmentId: "cabait", programId: "bsit", course: "BSIT", yearLevel: "4th", periodId: "p" };
function fixture() {
  return [
    ...[5, 4, 1, 5, 5, 5].map((averageScore, index) => ({ ...scope, id: `e${index}`, averageScore })),
    ...[5, 4, 4.96, 2.92, 4.75, 4.79].map((averageScore, index) => ({ ...scope, id: `l${index}`, teacherId: "lovelight", subjectId: "ap5", averageScore })),
  ];
}
function renderTable(evaluations, loading = false) {
  return renderToStaticMarkup(React.createElement(FinalizedRatingsTable, {
    ratings: groupReportRatings(evaluations, programs), loading,
    teachers: [{ id: "eulalia", displayName: "Eulalia Daguman" }, { id: "lovelight", displayName: "Lovelight Villanueva" }],
    subjects: [{ id: "cap102", name: "CAP102" }, { id: "ap5", name: "AP5" }],
    periods: [{ id: "p", name: "2nd Semester Evaluation" }], departments: [{ id: "cabait", code: "CABAIT", name: "DEAN OF" }],
  }));
}

test("the screenshot's twelve individual ratings become two accurate summary rows", () => {
  const evaluations = fixture();
  const before = structuredClone(evaluations);
  const groups = groupReportRatings(evaluations, programs);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => [group.teacherId, group.responses, group.average]), [["eulalia", 6, 4.17], ["lovelight", 6, 4.4]]);
  assert.equal(groups.reduce((sum, group) => sum + group.responses, 0), 12);
  assert.deepEqual(evaluations, before);
});

test("separate responses with identical scores are all counted", () => {
  const evaluations = Array.from({ length: 50 }, (_, index) => ({ ...scope, id: `e${index}`, averageScore: 5 }));
  const groups = groupReportRatings(evaluations, programs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].responses, 50);
  assert.equal(groups[0].average, 5);
});

test("teacher, subject, department, program, year and period keep genuinely different results separate", () => {
  const base = { ...scope, id: "base", averageScore: 4 };
  for (const field of ["teacherId", "subjectId", "departmentId", "programId", "yearLevel", "periodId"]) {
    const groups = groupReportRatings([base, { ...base, id: field, [field]: "different", averageScore: 5 }], programs);
    assert.equal(groups.length, 2, field);
    assert.equal(new Set(groups.map((row) => row.id)).size, 2);
  }
});

test("legacy course-only records join the same registered program instead of appearing duplicated", () => {
  const groups = groupReportRatings([
    { ...scope, id: "new", averageScore: 4 },
    { ...scope, id: "legacy", programId: null, course: " bsit ", yearLevel: " 4TH ", averageScore: 5 },
  ], programs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].course, "BSIT");
  assert.equal(groups[0].programId, "bsit");
  assert.equal(groups[0].responses, 2);
  assert.equal(groups[0].average, 4.5);
});

test("ambiguous or archived program references are not silently assigned to another program", () => {
  const duplicatedCodes = [...programs, { id: "other", code: "BSIT", departmentId: "educ" }];
  const matched = groupReportRatings([{ ...scope, id: "old", programId: null, averageScore: 4 }], duplicatedCodes);
  assert.equal(matched[0].programId, "bsit");
  const ambiguous = groupReportRatings([{ ...scope, id: "unknown", programId: null, departmentId: "missing", averageScore: 4 }], duplicatedCodes);
  assert.equal(ambiguous[0].programId, null);
  const archived = groupReportRatings([{ ...scope, id: "archived", programId: "deleted-program", averageScore: 4 }], programs);
  assert.equal(archived[0].programId, "deleted-program");
});

test("invalid ratings cannot fabricate a zero average or inflate the rating response count", () => {
  const evaluations = [NaN, Infinity, 0, 6].map((averageScore, index) => ({ ...scope, id: String(index), averageScore }));
  assert.deepEqual(groupReportRatings(evaluations, programs), []);
  const groups = groupReportRatings([...evaluations, { ...scope, id: "valid", averageScore: 4.5 }], programs);
  assert.equal(groups[0].responses, 1);
  assert.equal(groups[0].average, 4.5);
});

test("already-finalized summary averages match Analytics for the same teacher and response scope", () => {
  const evaluations = fixture().map((row) => ({ ...row, assignmentId: row.teacherId }));
  const assignments = ["eulalia", "lovelight"].map((teacherId) => ({ ...scope, id: teacherId, teacherId, subjectId: teacherId === "eulalia" ? "cap102" : "ap5", studentIds: ["u1", "u2", "u3", "u4", "u5", "u6"] }));
  const completions = assignments.flatMap((assignment) => assignment.studentIds.map((studentId) => ({ assignmentId: assignment.id, studentId })));
  const finalized = results.reportableEvaluations(evaluations, assignments, completions);
  const groups = groupReportRatings(finalized, programs);
  const analytics = buildAnalytics({ evaluations, assignments, completions, teachers: [], departments: [], periods: [] });
  for (const group of groups) assert.equal(group.average, analytics.topTeachers.find((teacher) => teacher.id === group.teacherId).average);
  assert.equal(groups.reduce((sum, row) => sum + row.responses, 0), analytics.releasedEvaluations);
});

test("one summary per group is rendered with its average and finalized response count", () => {
  const html = renderTable(fixture());
  assert.equal((html.match(/Eulalia Daguman/g) ?? []).length, 1);
  assert.equal((html.match(/Lovelight Villanueva/g) ?? []).length, 1);
  assert.equal((html.match(/<tbody[^>]*>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g) ?? []).length, 2);
  assert.ok(html.includes("4.17"));
  assert.ok(html.includes("4.40"));
  assert.ok(html.includes("12 finalized responses"));
  assert.ok(html.includes("1-2 of 2 rating summaries"));
  assert.ok(html.includes("Average rating"));
  assert.ok(html.includes("CABAIT"));
  assert.ok(!html.includes("DEAN OF"));
});

test("more than one hundred source responses are counted without silently truncating summaries", () => {
  const evaluations = Array.from({ length: 145 }, (_, index) => ({ ...scope, teacherId: `teacher${index}`, id: `e${index}`, averageScore: 4 }));
  const html = renderTable(evaluations);
  assert.ok(html.includes("145 finalized responses"));
  assert.ok(html.includes("1-20 of 145 rating summaries"));
  assert.ok(html.includes('aria-label="Next rating summaries"'));
  assert.equal((html.match(/<tbody[^>]*>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g) ?? []).length, 20);
});

test("empty and loading states never show fabricated ratings", () => {
  assert.ok(renderTable([]).includes("No finalized responses match these filters."));
  assert.ok(renderTable([], true).includes("Loading reports..."));
  assert.ok(!renderTable([]).includes("0.00"));
});
