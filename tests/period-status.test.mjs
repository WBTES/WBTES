import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function loadModule(path, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", compiled)(
    (name) => dependencies[name] ?? require(name), module, module.exports, { env: {} }
  );
  return module.exports;
}

function fixture({ status = "closed", endDate = Date.now() + 86400000, startDate = Date.now() - 86400000 } = {}) {
  const records = {
    evaluationPeriods: { p: { name: "First Semester", status, startDate, endDate, questionIds: ["q"], formId: "form" } },
    teacherAssignments: { a: { periodId: "p", teacherId: "t", subjectId: "s", departmentId: "d", studentIds: ["done", "pending"] } },
    evaluationCompletions: { c: { periodId: "p", assignmentId: "a", studentId: "done" } },
    evaluations: { e: { periodId: "p", assignmentId: "a", teacherId: "t", subjectId: "s", departmentId: "d", averageScore: 4, ratings: { q: 4 } } },
    users: { done: { role: "student", status: "active", email: "done@example.test" }, pending: { role: "student", status: "active", email: "pending@example.test" }, hr: { role: "hr", status: "active" } },
    teachers: { t: { displayName: "Teacher" } }, subjects: { s: { name: "Subject" } }, evaluationQuestions: { q: { category: "Teaching" } },
    performanceReports: { old: { periodId: "p", totalEvaluations: 1 } }, notifications: {}, activityLogs: {},
  };
  const emails = [];
  const writes = [];
  let notificationFailure = false;
  const ref = (name, id) => ({ name, id, async set(data) { records[name][id] = { ...records[name][id], ...data }; writes.push([name, id]); } });
  const snapshot = ({ name, id }) => ({ id, exists: Boolean(records[name]?.[id]), data: () => records[name]?.[id] });
  function collection(name, filters = []) {
    records[name] ??= {};
    return {
      doc: (id) => ref(name, id),
      where: (field, op, value) => { assert.equal(op, "=="); return collection(name, [...filters, [field, value]]); },
      async get() {
        if (notificationFailure && name === "teacherAssignments") throw new Error("Notification lookup failed");
        return { docs: Object.keys(records[name]).filter((id) => filters.every(([field, value]) => records[name][id][field] === value)).map((id) => snapshot(ref(name, id))) };
      },
      async add(data) { records[name][Object.keys(records[name]).length] = data; },
    };
  }
  const adminDb = {
    collection,
    async getAll(...refs) { return refs.map(snapshot); },
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({ get: async (r) => snapshot(r), update: (r, data) => pending.push([r, data]) });
      pending.forEach(([r, data]) => { records[r.name][r.id] = { ...records[r.name][r.id], ...data }; writes.push([r.name, r.id]); });
      return result;
    },
    batch() {
      const pending = [];
      return { set: (r, data) => pending.push([r, data]), async commit() { pending.forEach(([r, data]) => { records[r.name][r.id] = { ...records[r.name][r.id], ...data }; }); } };
    },
  };
  const { setPeriodStatus } = loadModule("lib/server/period-status.ts", {
    "server-only": {}, "@/lib/firebase/admin": { adminDb }, "@/lib/server/require-admin": { ApiError },
    "@/lib/email/smtp": { isSmtpConfigured: () => true, sendSmtpEmails: async (messages) => { emails.push(...messages); return { sent: messages.length }; } },
    "@/lib/evaluation-results": { reportableEvaluations: (items) => items },
    "@/lib/comment-analysis": { analyzeWeightedComments: () => ({}), consolidateComments: () => ({ uniqueComments: [], analysis: { areasForImprovement: [], themes: [] } }) },
  });
  return { records, emails, writes, setPeriodStatus, failNotifications: () => { notificationFailure = true; } };
}

test("an accidentally closed period reopens without changing saved evaluations or its form", async () => {
  const f = fixture();
  const preserved = structuredClone({ assignments: f.records.teacherAssignments, evaluations: f.records.evaluations, completions: f.records.evaluationCompletions, reports: f.records.performanceReports });
  const result = await f.setPeriodStatus("p", "open", "admin");
  assert.equal(result.changed, true);
  assert.equal(result.previousStatus, "closed");
  assert.equal(f.records.evaluationPeriods.p.status, "open");
  assert.deepEqual(f.records.evaluationPeriods.p.questionIds, ["q"]);
  assert.equal(f.records.evaluationPeriods.p.formId, "form");
  assert.deepEqual({ assignments: f.records.teacherAssignments, evaluations: f.records.evaluations, completions: f.records.evaluationCompletions, reports: f.records.performanceReports }, preserved);
  assert.ok(f.writes.every(([name]) => name === "evaluationPeriods"));
  assert.equal(Object.values(f.records.activityLogs)[0].action, "evaluation_period_reopened");
});

test("reopening only notifies students who still have pending assignments", async () => {
  const f = fixture();
  const result = await f.setPeriodStatus("p", "open", "admin");
  assert.equal(result.notified, 1);
  assert.equal(result.emailed, 1);
  assert.deepEqual(f.emails.map((m) => m.to), ["pending@example.test"]);
  assert.equal(f.records.notifications.evaluation_open_p_pending.title, "Evaluation period reopened");
  assert.equal(f.records.notifications.evaluation_open_p_done, undefined);
});

test("a student completed for one teacher remains notified for another pending assignment", async () => {
  const f = fixture();
  f.records.teacherAssignments.b = { ...f.records.teacherAssignments.a, studentIds: ["done"] };
  await f.setPeriodStatus("p", "open", "admin");
  assert.deepEqual(f.emails.map((m) => m.to).sort(), ["done@example.test", "pending@example.test"]);
});

test("expired periods cannot reopen without a new future deadline", async () => {
  const f = fixture({ endDate: Date.now() - 1000 });
  await assert.rejects(f.setPeriodStatus("p", "open", "admin"), (e) => e.status === 400 && e.message.includes("future"));
  assert.equal(f.records.evaluationPeriods.p.status, "closed");
  assert.equal(f.writes.length, 0);
  assert.equal(f.emails.length, 0);
});

test("deadline extension and reopening commit together and preserve the original opening time", async () => {
  const f = fixture({ endDate: Date.now() - 1000 });
  const originalStart = f.records.evaluationPeriods.p.startDate;
  const endDate = Date.now() + 86400000;
  await f.setPeriodStatus("p", "open", "admin", { endDate });
  assert.equal(f.records.evaluationPeriods.p.endDate, endDate);
  assert.equal(f.records.evaluationPeriods.p.startDate, originalStart);
  assert.equal(f.records.evaluationPeriods.p.status, "open");
  assert.equal(f.writes.length, 1);
  assert.equal(Object.values(f.records.activityLogs)[0].metadata.endDate, endDate);
});

test("invalid, past and before-opening deadlines are rejected without writes", async () => {
  for (const endDate of [NaN, Infinity, Date.now() - 1000]) {
    const f = fixture();
    await assert.rejects(f.setPeriodStatus("p", "open", "admin", { endDate }), (e) => e.status === 400);
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ startDate: Date.now() + 86400000 });
  await assert.rejects(f.setPeriodStatus("p", "open", "admin", { endDate: Date.now() + 60000 }), (e) => e.status === 400);
  await assert.rejects(f.setPeriodStatus("p", "open", "admin"), (e) => e.status === 400);
});

test("repeated open requests do not resend notifications", async () => {
  const f = fixture();
  await f.setPeriodStatus("p", "open", "admin");
  const result = await f.setPeriodStatus("p", "open", "admin");
  assert.equal(result.changed, false);
  assert.equal(f.emails.length, 1);
  assert.equal(f.writes.length, 1);
});

test("deadline overrides are limited to reopening, not arbitrary status changes", async () => {
  const f = fixture({ status: "open" });
  await assert.rejects(f.setPeriodStatus("p", "closed", "admin", { endDate: Date.now() + 100000 }), (e) => e.status === 400);
  await assert.rejects(f.setPeriodStatus("p", "open", "admin", { endDate: Date.now() + 100000 }), (e) => e.status === 409);
  assert.equal(f.writes.length, 0);
});

test("retrying an extended reopening is idempotent if the first response was lost", async () => {
  const f = fixture({ endDate: Date.now() - 1000 });
  const endDate = Date.now() + 86400000;
  await f.setPeriodStatus("p", "open", "admin", { endDate });
  const retry = await f.setPeriodStatus("p", "open", "admin", { endDate });
  assert.equal(retry.changed, false);
  assert.equal(f.emails.length, 1);
  assert.equal(f.writes.length, 1);
});

test("closing a reopened period regenerates performance reports from saved responses", async () => {
  const f = fixture();
  await f.setPeriodStatus("p", "open", "admin");
  f.records.evaluations.e2 = { ...f.records.evaluations.e, averageScore: 5, ratings: { q: 5 } };
  const result = await f.setPeriodStatus("p", "closed", "admin");
  assert.equal(result.reports, 1);
  assert.equal(f.records.evaluationPeriods.p.status, "closed");
  assert.equal(f.records.performanceReports.p_t_s.totalEvaluations, 2);
  assert.equal(f.records.performanceReports.p_t_s.averageScore, 4.5);
});

test("notification failure returns a warning without reverting reopening", async () => {
  const f = fixture();
  f.failNotifications();
  const result = await f.setPeriodStatus("p", "open", "admin");
  assert.equal(f.records.evaluationPeriods.p.status, "open");
  assert.ok(result.warnings.some((w) => w.includes("Notification lookup failed")));
});

test("missing periods and invalid close transitions remain rejected", async () => {
  const f = fixture({ status: "draft" });
  await assert.rejects(f.setPeriodStatus("missing", "open", "admin"), (e) => e.status === 404);
  await assert.rejects(f.setPeriodStatus("p", "closed", "admin"), (e) => e.status === 409);
});

function route(role = "admin") {
  const calls = [];
  const { POST } = loadModule("app/api/periods/status/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/server/require-admin": { ApiError, requireAdmin: async () => { if (role !== "admin") throw new ApiError(403, "Forbidden"); return { uid: "admin" }; } },
    "@/lib/server/period-status": { setPeriodStatus: async (...args) => { calls.push(args); return { changed: true, previousStatus: "closed", status: "open" }; } },
  });
  const request = (data) => POST(new Request("http://localhost/api/periods/status", { method: "POST", body: JSON.stringify(data) }));
  return { calls, request };
}

test("only administrators can reopen periods through the endpoint", async () => {
  for (const role of ["student", "hr", "department_head", "anonymous"]) {
    const f = route(role);
    assert.equal((await f.request({ periodId: "p", status: "open" })).status, 403);
    assert.equal(f.calls.length, 0);
  }
});

test("the endpoint passes a valid new deadline and rejects non-numeric values", async () => {
  const f = route();
  const endDate = Date.now() + 100000;
  assert.equal((await f.request({ periodId: "p", status: "open", endDate })).status, 200);
  assert.deepEqual(f.calls[0], ["p", "open", "admin", { endDate }]);
  for (const value of [null, "tomorrow", {}, true]) {
    assert.equal((await f.request({ periodId: "p", status: "open", endDate: value })).status, 400);
  }
  assert.equal(f.calls.length, 1);
});
