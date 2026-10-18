import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function fixture({ denied = false } = {}) {
  const queries = [];
  const data = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [
    `question${index}`, { text: `Question text ${index}`, type: "rating", order: index, active: false },
  ]));
  const compiled = ts.transpileModule(
    readFileSync(new URL("../lib/firebase/report-questions.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
  ).outputText;
  const dependencies = {
    "@/lib/firebase/client": { db: {} },
    "firebase/firestore": {
      collection: (_db, name) => { assert.equal(name, "evaluationQuestions"); return name; },
      documentId: () => "__name__",
      where: (field, operation, ids) => { assert.equal(field, "__name__"); assert.equal(operation, "in"); return ids; },
      query: (_collection, ids) => ids,
      async getDocs(ids) {
        if (denied) throw new Error("Missing or insufficient permissions.");
        queries.push(ids);
        return { docs: ids.filter((id) => data[id]).map((id) => ({ id, data: () => data[id] })) };
      },
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    assert.ok(id in dependencies, `Unexpected dependency ${id}`);
    return dependencies[id];
  }, module, module.exports);
  return { ...module.exports, queries };
}

test("report question lookup reads only used questions in batches of at most 30", async () => {
  const f = fixture();
  const ratings = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [`question${index}`, 5]));
  const result = await f.loadReportQuestions([{ ratings }, { ratings: { question0: 1 } }]);
  assert.deepEqual(f.queries.map((ids) => ids.length), [30, 5]);
  assert.equal(Object.keys(result).length, 35);
  assert.equal(result.question0.text, "Question text 0");
  assert.equal(result.question0.active, false);
});

test("empty exports perform no database reads and deleted questions are not assigned invented labels", async () => {
  const f = fixture();
  assert.deepEqual(await f.loadReportQuestions([]), {});
  assert.equal(f.queries.length, 0);
  const result = await f.loadReportQuestions([{ ratings: { question1: 5, removed: 2 } }]);
  assert.equal(result.question1.text, "Question text 1");
  assert.equal(Object.hasOwn(result, "removed"), false);
});

test("failed metadata lookup stops the export instead of silently using inaccurate question labels", async () => {
  const f = fixture({ denied: true });
  await assert.rejects(f.loadReportQuestions([{ ratings: { question0: 5 } }]), /permissions/);
});

test("report download handlers load question labels only for Excel exports", () => {
  const admin = readFileSync(new URL("../app/(app)/admin/reports/page.tsx", import.meta.url), "utf8");
  const hr = readFileSync(new URL("../app/(app)/hr/reports/page.tsx", import.meta.url), "utf8");
  assert.match(admin, /kind === "excel" \? await loadReportQuestions\(filteredSubmitted\) : undefined/);
  assert.match(hr, /await loadReportQuestions\(reportData\.evaluations\)/);
  assert.match(hr, /exportTeacherEvaluationReportExcel\(reportData, questions\)/);
});
