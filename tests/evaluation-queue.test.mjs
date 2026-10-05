import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/evaluation-queue.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { MAX_EVALUATIONS_PER_SESSION, normalizeEvaluationQueue, evaluationQueueHref, nextPendingEvaluation } = module.exports;

test("a direct assignment link starts a single evaluation", () => {
  assert.deepEqual(normalizeEvaluationQueue("a", null), ["a"]);
  assert.deepEqual(normalizeEvaluationQueue("a", "b,c"), ["a"]);
});

test("the queue accepts one through five unique assignments", () => {
  for (let count = 1; count <= MAX_EVALUATIONS_PER_SESSION; count++) {
    const ids = Array.from({ length: count }, (_, i) => `assignment${i}`);
    assert.deepEqual(normalizeEvaluationQueue(ids[0], ids.join(",")), ids);
    assert.equal(new URL(evaluationQueueHref(ids), "http://localhost").searchParams.get("queue"), ids.join(","));
  }
});

test("duplicate and empty entries never become extra evaluations", () => {
  assert.deepEqual(normalizeEvaluationQueue("a", " a, ,a,b,b,c "), ["a", "b", "c"]);
});

test("a manually enlarged queue is limited to five", () => {
  assert.deepEqual(normalizeEvaluationQueue("a", "a,b,c,d,e,f"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(normalizeEvaluationQueue("f", "a,b,c,d,e,f"), ["f"]);
  assert.throws(() => evaluationQueueHref(["a", "b", "c", "d", "e", "f"]));
});

test("empty or mismatched queues cannot start", () => {
  assert.throws(() => evaluationQueueHref([]));
  assert.throws(() => evaluationQueueHref(["a"], "b"));
});

test("automatic continuation follows selection order and skips completed assignments", () => {
  assert.equal(nextPendingEvaluation(["a", "b", "c", "d", "e"], "a", new Set(["a", "b"])), "c");
  assert.equal(nextPendingEvaluation(["a", "b", "c"], "c", new Set(["a", "b", "c"])), null);
});

test("opening a later queued assignment still resumes earlier unfinished work", () => {
  assert.equal(nextPendingEvaluation(["a", "b", "c"], "c", new Set(["c"])), "a");
  assert.equal(nextPendingEvaluation(["a"], "a", new Set(["a"])), null);
});

test("route paths and queue query parameters are encoded", () => {
  assert.equal(evaluationQueueHref(["assignment #1", "assignment #2"]), "/student/evaluate/assignment%20%231?queue=assignment%20%231%2Cassignment%20%232");
});
