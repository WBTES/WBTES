import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const analysisModule = loadModule("lib/performance-analysis.ts");
const { buildPerformanceAnalysis } = analysisModule;
const results = loadModule("lib/evaluation-results.ts");
const { buildAnalytics } = loadModule("lib/analytics.ts", {
  "./evaluation-results": results,
  "./report-participation": loadModule("lib/report-participation.ts"),
});
const { GeneratedPerformanceAnalysis } = loadModule("components/reports/generated-performance-analysis.tsx", {
  "@/lib/performance-analysis": analysisModule,
});

function evaluation(score = 5, overrides = {}) {
  return { id: "e", teacherId: "t", subjectId: "s", periodId: "p", departmentId: "d", assignmentId: "a", averageScore: score, ratings: {}, anonymous: true, ...overrides };
}
function report(overrides = {}) {
  return { id: "r", teacherId: "t", subjectId: "s", periodId: "p", departmentId: "d", averageScore: 5, totalEvaluations: 1, generatedAt: 1, summary: "Current analysis", strengths: ["Clear lessons"], weaknesses: [], recommendations: ["More examples"], graphInsights: [], aiGenerated: false, ...overrides };
}
function renderAnalysis(reports, evaluations, teachers = [{ id: "t", displayName: "Teacher One" }]) {
  return renderToStaticMarkup(React.createElement(GeneratedPerformanceAnalysis, {
    reports, evaluations, teachers, subjects: [{ id: "s", name: "Subject One" }, { id: "s2", name: "Subject Two" }], periods: [{ id: "p", name: "First semester" }, { id: "p2", name: "Second semester" }],
  }));
}

test("one teacher has a response-weighted average, not the mean of subject report scores", () => {
  const evaluations = [evaluation(5), ...Array.from({ length: 9 }, (_, i) => evaluation(3, { id: `e${i}`, subjectId: "s2" }))];
  const reports = [report(), report({ id: "r2", subjectId: "s2", averageScore: 3, totalEvaluations: 9 })];
  const original = structuredClone({ evaluations, reports });
  const groups = buildPerformanceAnalysis(reports, evaluations);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].average, 3.2);
  assert.equal(groups[0].responses, 10);
  assert.deepEqual(groups[0].reports.map((item) => [item.average, item.responses]), [[5, 1], [3, 9]]);
  assert.deepEqual({ evaluations, reports }, original);
});

test("duplicate subject/period snapshots use the latest analysis without doubling responses", () => {
  const reports = [report(), report({ id: "manual-duplicate", generatedAt: 2, summary: "Latest analysis" })];
  const groups = buildPerformanceAnalysis(reports, [evaluation()]);
  assert.equal(groups[0].reports.length, 1);
  assert.equal(groups[0].reports[0].report.summary, "Latest analysis");
  assert.equal(groups[0].responses, 1);
  const html = renderAnalysis(reports, [evaluation()]);
  assert.equal((html.match(/data-teacher-analysis=/g) ?? []).length, 1);
  assert.ok(html.includes("Latest analysis"));
  assert.ok(!html.includes("Current analysis"));
});

test("teacher totals include every finalized subject and period even before all analyses are generated", () => {
  const groups = buildPerformanceAnalysis([report()], [evaluation(5), evaluation(3, { id: "e2", periodId: "p2", subjectId: "s2" })]);
  assert.equal(groups[0].average, 4);
  assert.equal(groups[0].responses, 2);
  assert.equal(groups[0].reports.length, 1);
  const allReports = buildPerformanceAnalysis([report(), report({ id: "r2", periodId: "p2", subjectId: "s2", averageScore: 3 })], [evaluation(5), evaluation(3, { id: "e2", periodId: "p2", subjectId: "s2" })]);
  assert.equal(allReports.length, 1);
  assert.equal(allReports[0].reports.length, 2);
});

test("stale saved scores and response counts never override the recorded finalized ratings", () => {
  const evaluations = [evaluation(4), evaluation(5, { id: "e2" })];
  const groups = buildPerformanceAnalysis([report({ averageScore: 2, totalEvaluations: 99, summary: "Wrong historical score 2 / 5" })], evaluations);
  assert.equal(groups[0].average, 4.5);
  assert.equal(groups[0].reports[0].average, 4.5);
  assert.equal(groups[0].reports[0].stale, true);
  const html = renderAnalysis([report({ averageScore: 2, totalEvaluations: 99, summary: "Wrong historical score 2 / 5" })], evaluations);
  assert.ok(html.includes("4.50"));
  assert.ok(html.includes("Saved analysis is out of date"));
  assert.ok(!html.includes("Wrong historical score"));
});

test("unfinalized assignments remain protected and report averages match Top teachers exactly", () => {
  const assignments = [
    { id: "a", teacherId: "t", subjectId: "s", periodId: "p", departmentId: "d", studentIds: ["u1"] },
    { id: "a2", teacherId: "t", subjectId: "s2", periodId: "p", departmentId: "d", studentIds: ["u1", "u2", "u3"] },
    { id: "pending", teacherId: "t", subjectId: "s3", periodId: "p", departmentId: "d", studentIds: ["u1", "u2"] },
  ];
  const completions = [
    { assignmentId: "a", studentId: "u1" },
    ...["u1", "u2", "u3"].map((studentId) => ({ assignmentId: "a2", studentId })),
    { assignmentId: "pending", studentId: "u1" },
  ];
  const evaluations = [evaluation(5), ...[4.2, 3.6, 4.8].map((score, i) => evaluation(score, { id: `e${i}`, assignmentId: "a2", subjectId: "s2" })), evaluation(1, { id: "partial", assignmentId: "pending", subjectId: "s3" })];
  const reports = [report(), report({ id: "r2", subjectId: "s2", averageScore: 4.2, totalEvaluations: 3 }), report({ id: "partial", subjectId: "s3", averageScore: 1 })];
  const analytics = buildAnalytics({ assignments, completions, evaluations, teachers: [{ id: "t", displayName: "Teacher One" }], departments: [], periods: [] });
  const groups = buildPerformanceAnalysis(reports, results.reportableEvaluations(evaluations, assignments, completions));
  assert.equal(groups[0].average, analytics.topTeachers[0].average);
  assert.equal(groups[0].average, 4.4);
  assert.equal(groups[0].responses, 4);
  assert.equal(groups[0].reports.length, 2);
});

test("period filtering uses the same selected response scope as Analytics", () => {
  const evaluations = [evaluation(5), evaluation(3, { id: "e2", periodId: "p2" })];
  const reports = [report(), report({ id: "r2", periodId: "p2", averageScore: 3 })];
  const groups = buildPerformanceAnalysis(reports.filter((item) => item.periodId === "p2"), evaluations.filter((item) => item.periodId === "p2"));
  assert.equal(groups[0].average, 3);
  assert.equal(groups[0].responses, 1);
  assert.equal(groups[0].reports[0].report.periodId, "p2");
});

test("searching one subject analysis does not narrow the finalized teacher-wide average", () => {
  const evaluations = [evaluation(5), evaluation(3, { id: "e2", subjectId: "s2" })];
  const html = renderAnalysis([report()], evaluations);
  assert.ok(html.includes("4.00"));
  assert.ok(html.includes("2 finalized responses"));
  assert.equal((html.match(/<details/g) ?? []).length, 1);
  assert.ok(html.includes("Subject average: 5.00"));
});

test("invalid scores, orphaned snapshots and empty data cannot fabricate a finalized report", () => {
  assert.deepEqual(buildPerformanceAnalysis([report()], [evaluation(NaN), evaluation(0), evaluation(6)]), []);
  assert.deepEqual(buildPerformanceAnalysis([report()], []), []);
  assert.equal(renderAnalysis([report()], []), "");
  const groups = buildPerformanceAnalysis([report({ averageScore: 4.5, totalEvaluations: 2 })], [evaluation(4), evaluation(5), evaluation(0)]);
  assert.equal(groups[0].average, 4.5);
  assert.equal(groups[0].responses, 2);
  assert.equal(groups[0].reports[0].stale, false);
});

test("teacher identity, subject and period stay distinct while the header appears once", () => {
  const reports = [report(), report({ id: "r2", subjectId: "s2", periodId: "p2", averageScore: 3 })];
  const html = renderAnalysis(reports, [evaluation(5), evaluation(3, { subjectId: "s2", periodId: "p2" })]);
  assert.equal((html.match(/<h3/g) ?? []).length, 1);
  assert.equal((html.match(/<details/g) ?? []).length, 2);
  assert.ok(html.includes("4.00"));
  assert.ok(html.includes("Subject average: 5.00"));
  assert.ok(html.includes("Subject average: 3.00"));
  assert.ok(html.includes("Second semester"));
});

test("large report lists paginate rather than silently truncating teacher analyses", () => {
  const evaluations = Array.from({ length: 15 }, (_, i) => evaluation(5, { teacherId: `t${i}` }));
  const reports = evaluations.map((item, i) => report({ id: `r${i}`, teacherId: item.teacherId }));
  const html = renderAnalysis(reports, evaluations, evaluations.map((item) => ({ id: item.teacherId, displayName: item.teacherId })));
  assert.equal((html.match(/data-teacher-analysis=/g) ?? []).length, 6);
  assert.ok(html.includes("1-6 of 15 teachers"));
  assert.ok(html.includes('aria-label="Next teacher analyses"'));
});
