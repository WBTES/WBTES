import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function renderChart(teachers, overallAverage = null, showPreliminary = false) {
  const capture = {};
  const recharts = Object.fromEntries(["Bar", "BarChart", "CartesianGrid", "Cell", "LabelList", "ReferenceLine", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map((name) => [name, (props) => {
    capture[name] ??= [];
    capture[name].push(props);
    return React.createElement(React.Fragment, null, props.children);
  }]));
  const source = readFileSync(new URL("../components/reports/teacher-rating-chart.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => name === "recharts" ? recharts : require(name), module, module.exports);
  const html = renderToStaticMarkup(React.createElement(module.exports.TeacherRatingChart, { teachers, overallAverage, animate: false, showPreliminary }));
  return { html, capture };
}

test("only released scores are plotted, while every unreleased teacher and count remains visible", () => {
  const { html, capture } = renderChart([
    { id: "a", name: "Released teacher", average: 4.64, responses: 3 },
    { id: "b", name: "Pending teacher", average: null, responses: 4 },
  ], 4.64);
  assert.deepEqual(capture.BarChart[0].data.map((t) => [t.id, t.average, t.responses]), [["a", 4.64, 3]]);
  assert.ok(html.includes("Pending teacher"));
  assert.ok(html.includes("Awaiting release (1)"));
  assert.ok(html.includes("2 evaluated teachers"));
  assert.equal(capture.ReferenceLine[0].x, 4.64);
  assert.deepEqual(capture.XAxis[0].domain, [0, 5]);
});

test("released rankings sort accurately without mutating source records", () => {
  const teachers = [
    { id: "low", name: "Cora", average: 3.8, responses: 43 },
    { id: "tie2", name: "Ben", average: 5, responses: 10 },
    { id: "tie1", name: "Ana", average: 5, responses: 20 },
  ];
  const original = structuredClone(teachers);
  const { capture } = renderChart(teachers, 4.2);
  assert.deepEqual(capture.BarChart[0].data.map((t) => [t.name, t.rank]), [["Ana", 1], ["Ben", 1], ["Cora", 3]]);
  assert.deepEqual(teachers, original);
  assert.equal(capture.Cell[0].fill, "#10b981");
  assert.equal(capture.Cell[1].fill, "#10b981");
  assert.equal(capture.Cell[2].fill, "#3b82f6");
});

test("large rankings page eight teachers at a time rather than hiding the remainder", () => {
  const teachers = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `Teacher ${i}`, average: 4, responses: i + 1 }));
  const { html, capture } = renderChart(teachers, 4);
  assert.equal(capture.BarChart[0].data.length, 8);
  assert.ok(html.includes("1-8 of 20 released teachers"));
  assert.ok(html.includes('aria-label="Next teachers"'));
  assert.ok(html.includes('aria-label="Previous teachers"'));
});

test("empty and unreleased states never fabricate a rating", () => {
  const empty = renderChart([]);
  assert.equal(empty.capture.BarChart, undefined);
  assert.equal(empty.capture.ReferenceLine, undefined);
  assert.ok(empty.html.includes("No teachers evaluated yet."));
  const pending = renderChart([{ id: "a", name: "Teacher awaiting release", average: null, responses: 5 }]);
  assert.equal(pending.capture.BarChart, undefined);
  assert.ok(pending.html.includes("Teacher awaiting release"));
  assert.ok(pending.html.includes("No released teacher ratings yet."));
});

test("invalid out-of-scale values cannot draw misleading bars or overall markers", () => {
  const { capture, html } = renderChart([
    { id: "a", name: "No score", average: NaN, responses: 1 },
    { id: "b", name: "Too high", average: 6, responses: 2 },
  ], 6);
  assert.equal(capture.BarChart, undefined);
  assert.equal(capture.ReferenceLine, undefined);
  assert.ok(html.includes("Awaiting release (2)"));
});

test("tooltips retain full teacher names, exact recorded scores and response counts", () => {
  const teacher = { id: "a", name: "Maria Angelica Santos Villanueva", average: 4.64, responses: 43 };
  const { capture } = renderChart([teacher], 4.64);
  const tooltip = capture.Tooltip[0].content;
  const html = renderToStaticMarkup(React.cloneElement(tooltip, { active: true, payload: [{ payload: teacher }] }));
  assert.ok(html.includes(teacher.name));
  assert.ok(html.includes("4.64"));
  assert.ok(html.includes("43 submitted responses"));
  assert.equal(capture.LabelList[0].formatter(4.64), "4.64");
  assert.equal(capture.Bar[0].isAnimationActive, false);
});

test("Admin awaiting graph labels preliminary values and keeps final rankings separate", () => {
  const { html, capture } = renderChart([
    { id: "released", name: "Released", average: 4.64, responses: 3 },
    { id: "pending", name: "Pending", average: null, responses: 4, preliminaryAverage: 4.25, preliminaryResponses: 4 },
  ], 4.64, true);
  assert.deepEqual(capture.BarChart[0].data.map((t) => t.id), ["released"]);
  assert.deepEqual(capture.BarChart[1].data.map((t) => [t.id, t.average, t.responses]), [["pending", 4.25, 4]]);
  assert.equal(capture.ReferenceLine.length, 1);
  assert.ok(html.includes("Preliminary averages"));
  assert.ok(html.includes("1 released"));
  assert.equal(capture.Cell[1].fill, "#f59e0b");
  const tooltip = renderToStaticMarkup(React.cloneElement(capture.Tooltip[1].content, { active: true, payload: [{ payload: capture.BarChart[1].data[0] }] }));
  assert.ok(tooltip.includes("Preliminary - not final"));
  assert.ok(tooltip.includes("4 rated responses"));
});

test("preliminary charts are opt-in even if protected fields reach the view", () => {
  const { html, capture } = renderChart([{ id: "a", name: "Protected", average: null, responses: 4, preliminaryAverage: 4.25, preliminaryResponses: 4 }]);
  assert.equal(capture.BarChart, undefined);
  assert.ok(html.includes("Protected"));
  assert.equal(html.includes("Preliminary averages"), false);
});

test("Admin awaiting pagination keeps teachers accessible and excludes missing scores", () => {
  const teachers = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Pending ${i}`, average: null, responses: 1, preliminaryAverage: 4, preliminaryResponses: 1 }));
  teachers.push({ id: "unrated", name: "Unrated", average: null, responses: 1, preliminaryAverage: null, preliminaryResponses: 0 });
  const { html, capture } = renderChart(teachers, null, true);
  assert.equal(capture.BarChart[0].data.length, 8);
  assert.ok(html.includes("1-8 of 10 awaiting teachers"));
  assert.ok(html.includes('aria-label="Next awaiting teachers"'));
  assert.ok(html.includes("Unrated"));
  assert.ok(html.includes("No rated responses available"));
});
