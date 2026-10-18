import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/(app)/admin/reports/page.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("reports.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["deriveAccurateAnalysis", "AiAnalysisPreview", "AnalysisList"]);
const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, 3, "The custom analysis functions must remain available");
const compiled = ts.transpileModule(
  'import * as React from "react"; import { Sparkles } from "lucide-react";\n'
  + functions.map((node) => node.getText(parsed)).join("\n")
  + "\nexport { deriveAccurateAnalysis, AiAnalysisPreview };",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }
).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(require, module, module.exports);
const { deriveAccurateAnalysis, AiAnalysisPreview } = module.exports;

const report = {
  id: "r1", teacherId: "t1", subjectId: "s1", periodId: "p1", averageScore: 4.75,
  summary: "Saved report summary", graphInsights: ["Recorded graph insight"],
};
const evaluation = { teacherId: "t1", subjectId: "s1", periodId: "p1", comment: "Clear explanations but lessons are too fast." };
function render(reports = [report], evaluations = [evaluation]) {
  return renderToStaticMarkup(React.createElement(AiAnalysisPreview, {
    reports, evaluations,
    teachers: [{ id: "t1", displayName: "Teacher One" }],
    subjects: [{ id: "s1", name: "AP5" }, { id: "s2", name: "CAP102" }],
    periods: [{ id: "p1", name: "Second Semester" }],
  }));
}

test("custom report layout displays the user's title, cards, saved summary and graph insights", () => {
  const html = render();
  assert.ok(html.includes("Generated performance analysis (Accurate Student Feedback Insights)"));
  for (const text of ["Teacher One", "AP5", "Second Semester", "4.75 / 5", "Saved report summary", "Recorded graph insight", "Strengths", "Weaknesses", "Recommendations"]) {
    assert.ok(html.includes(text), `Missing custom report content: ${text}`);
  }
  assert.equal((html.match(/<article/g) ?? []).length, 1);
  assert.ok(!html.includes("<details"), "The custom card layout should not become the replacement accordion");
});

test("custom strengths and recommendations continue to derive from the matching teacher and subject comments", () => {
  const analysis = deriveAccurateAnalysis(report, [evaluation, { ...evaluation, teacherId: "other", comment: "Confusing and late" }]);
  assert.ok(analysis.strengths.some((text) => /clear explanations/.test(text)));
  assert.ok(analysis.weaknesses.some((text) => /rushed or too fast/.test(text)));
  assert.ok(analysis.recommendations.some((text) => /slowing down/.test(text)));
  assert.ok(!analysis.weaknesses.some((text) => /confusion|returning graded outputs/.test(text)));
});

test("custom reports preserve separate subject cards and the original lower-score feedback", () => {
  const html = render([report, { ...report, id: "r2", subjectId: "s2", averageScore: 2.5 }]);
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  assert.ok(html.includes("CAP102"));
  assert.ok(html.includes("2.50 / 5"));
  assert.ok(html.includes("Overall student ratings fall below expected threshold"));
});

test("reports page uses the custom preview once without reverting the finalized-rating duplicate fix", () => {
  const tags = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node.tagName.getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(tags.filter((name) => name === "AiAnalysisPreview").length, 1);
  assert.equal(tags.filter((name) => name === "GeneratedPerformanceAnalysis").length, 0);
  assert.equal(tags.filter((name) => name === "FinalizedRatingsTable").length, 1);
  assert.equal(tags.filter((name) => name === "ResponsePreview").length, 0);
  assert.ok(source.includes("groupReportRatings(filteredEvaluations, programs)"));
});
