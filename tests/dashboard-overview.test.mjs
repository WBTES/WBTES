import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const results = loadModule("lib/evaluation-results.ts");
const { buildAnalytics } = loadModule("lib/analytics.ts", {
  "./evaluation-results": results, "./report-participation": loadModule("lib/report-participation.ts"),
});
const { buildDashboardOverview } = loadModule("lib/dashboard-overview.ts", { "./analytics": { buildAnalytics }, "./evaluation-results": results });
const { buildPerformanceAnalysis } = loadModule("lib/performance-analysis.ts");
const commentAnalysis = loadModule("lib/comment-analysis.ts");

function fixture() {
  const scope = { teacherId: "t", subjectId: "s", departmentId: "d", periodId: "closed" };
  return {
    role: "hr",
    users: [{ role: "student" }, { role: "student" }, { role: "hr" }],
    teachers: [{ id: "t", displayName: "Active teacher", status: "active", departmentId: "d" }, { id: "inactive", displayName: "Inactive teacher", status: "inactive", departmentId: "d" }],
    departments: [{ id: "d", code: "CABAIT", name: "CABAIT" }],
    periods: [{ id: "closed", name: "Closed semester", status: "closed", endDate: 10 }, { id: "open", name: "Open semester", status: "open", endDate: 20 }],
    assignments: [
      { ...scope, id: "a", studentIds: ["private-u1", "private-u2", "private-u3"] },
      { ...scope, id: "open-a", teacherId: "inactive", periodId: "open", studentIds: ["private-u1", "private-u1", "private-u4"] },
      { ...scope, id: "orphan", teacherId: "archived", periodId: "open", studentIds: ["private-u5"] },
    ],
    completions: [
      ...["private-u1", "private-u2", "private-u3"].map((studentId, i) => ({ ...scope, id: `c${i}`, assignmentId: "a", studentId })),
      { ...scope, id: "open-c", periodId: "open", teacherId: "inactive", assignmentId: "open-a", studentId: "private-u1" },
    ],
    evaluations: [
      ...[4, 5, 3].map((averageScore, i) => ({ ...scope, id: `private-e${i}`, assignmentId: "a", averageScore, ratings: { q: averageScore }, comment: "Private anonymous comment", anonymous: true })),
      { ...scope, id: "partial", assignmentId: "open-a", teacherId: "inactive", periodId: "open", averageScore: 2, ratings: {}, anonymous: true },
      { ...scope, id: "legacy", teacherId: "archived", periodId: "open", averageScore: 5, ratings: {}, anonymous: true },
    ],
  };
}

test("Admin card totals match Analytics without confusing students, tasks and responses", () => {
  const input = fixture();
  const result = buildDashboardOverview({ ...input, role: "admin" });
  const analytics = buildAnalytics(input);
  assert.deepEqual(result.adminSummary, {
    students: 2, teachers: 2, departments: 1, evaluations: 5, assignedTasks: 6, completedTasks: 4, pendingTasks: 2,
    completedStudents: 3, pendingStudents: 2, completionRate: 67, finalizedResponses: 3, averageRating: 4,
  });
  assert.equal(result.adminSummary.averageRating, analytics.averageRating);
  assert.equal(result.adminSummary.completedStudents, analytics.completedStudents);
  assert.equal(result.adminSummary.pendingStudents, analytics.pendingStudents);
});

test("open tasks retain inactive and archived teacher assignments", () => {
  const result = buildDashboardOverview(fixture());
  assert.equal(result.teacherCount, 1);
  assert.equal(result.assignedTasks, 3);
  assert.equal(result.completedTasks, 1);
  assert.equal(result.pendingTasks, 2);
  assert.equal(result.submittedResponses, 2);
  assert.equal(result.completionRate, 33);
  assert.equal(result.teacherProgress.find((teacher) => teacher.teacherId === "inactive").assignedTasks, 2);
  assert.equal(result.teacherProgress.find((teacher) => teacher.teacherId === "archived").assignedTasks, 1);
});

test("duplicate or orphan completion records cannot inflate task completion", () => {
  const input = fixture();
  input.completions.push({ ...input.completions[3], id: "duplicate", teacherId: "wrong", periodId: "wrong" });
  input.completions.push({ ...input.completions[3], id: "not-assigned", studentId: "not-assigned" });
  input.completions.push({ ...input.completions[3], id: "missing-assignment", assignmentId: "missing" });
  const result = buildDashboardOverview(input);
  assert.equal(result.completedTasks, 1);
  assert.equal(result.pendingTasks, 2);
  assert.equal(result.completionRate, 33);
});

test("HR and Department Head use the same closed-period release rules as Analytics", () => {
  for (const role of ["hr", "department_head"]) {
    const input = { ...fixture(), role };
    const result = buildDashboardOverview(input);
    const analytics = buildAnalytics({ ...input, releasedPeriodIds: new Set(["closed"]), minimumResponses: role === "department_head" ? 5 : 1 });
    assert.equal(result.releasedEvaluations, analytics.releasedEvaluations);
    assert.equal(result.averageRating, analytics.averageRating);
    assert.equal(result.teacherProgress.find((teacher) => teacher.teacherId === "t").averageRating, analytics.topTeachers.find((teacher) => teacher.id === "t").average);
    assert.equal(result.adminSummary, undefined);
  }
  assert.equal(buildDashboardOverview(fixture()).averageRating, 4);
  assert.equal(buildDashboardOverview({ ...fixture(), role: "department_head" }).averageRating, null);
});

test("Department Head cannot receive a small teacher group's average", () => {
  const input = fixture();
  input.role = "department_head";
  input.assignments.push({ ...input.assignments[0], id: "other", teacherId: "other", studentIds: ["x", "y"] });
  for (const studentId of ["x", "y"]) {
    input.completions.push({ ...input.completions[0], id: studentId, studentId, assignmentId: "other", teacherId: "other" });
    input.evaluations.push({ ...input.evaluations[0], id: studentId, teacherId: "other", assignmentId: "other", averageScore: 5 });
  }
  const result = buildDashboardOverview(input);
  assert.equal(result.averageRating, 4.4);
  assert.equal(result.releasedEvaluations, 5);
  assert.ok(result.teacherProgress.every((teacher) => teacher.averageRating === null));
});

test("invalid scores cannot distort any overview average or released count", () => {
  const input = fixture();
  for (const averageScore of [NaN, 0, 6]) input.evaluations.push({ ...input.evaluations[0], id: String(averageScore), averageScore });
  const result = buildDashboardOverview({ ...input, role: "admin" });
  assert.equal(result.adminSummary.evaluations, 8);
  assert.equal(result.adminSummary.finalizedResponses, 3);
  assert.equal(result.adminSummary.averageRating, 4);
  assert.equal(result.releasedEvaluations, 3);
  assert.equal(result.averageRating, 4);
});

test("an all-open school has participation but no released HR or Department Head scores", () => {
  const input = fixture();
  input.periods.forEach((period) => { period.status = "open"; });
  for (const role of ["hr", "department_head"]) {
    const result = buildDashboardOverview({ ...input, role });
    assert.equal(result.releasedPeriods, 0);
    assert.equal(result.releasedEvaluations, 0);
    assert.equal(result.averageRating, null);
    assert.equal(result.assignedTasks, 6);
    assert.equal(result.completedTasks, 4);
    assert.equal(result.submittedResponses, 5);
  }
});

test("an empty school returns real zero counts and no fabricated zero rating", () => {
  const result = buildDashboardOverview({ role: "admin", users: [], teachers: [], departments: [], periods: [], assignments: [], completions: [], evaluations: [] });
  assert.equal(result.adminSummary.evaluations, 0);
  assert.equal(result.adminSummary.averageRating, null);
  assert.equal(result.assignedTasks, 0);
  assert.equal(result.completionRate, 0);
});

function endpoint(file, input, role, failCollection = "") {
  const calls = [];
  const collections = { users: input.users, teachers: input.teachers, departments: input.departments, evaluationPeriods: input.periods, teacherAssignments: input.assignments, evaluationCompletions: input.completions, evaluations: input.evaluations, evaluationQuestions: [{ id: "q", category: "Teaching" }], performanceReports: input.reports ?? [] };
  const adminDb = { collection(name) {
    calls.push(name);
    const collection = { select: () => collection, async get() {
      if (name === failCollection) throw new Error("Saved statistics unavailable");
      return { docs: collections[name].map((item) => ({ id: item.id, data: () => item })) };
    } };
    return collection;
  } };
  function authorize(allowed) {
    if (!allowed.includes(role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { role } };
  }
  const module = loadModule(file, {
    "@/lib/firebase/admin": { adminDb },
    "@/lib/dashboard-overview": { buildDashboardOverview },
    "@/lib/evaluation-results": results,
    "@/lib/performance-analysis": { buildPerformanceAnalysis },
    "@/lib/comment-analysis": commentAnalysis,
    "@/lib/server/require-admin": {
      async requireDepartmentStaff() { return authorize(["admin", "hr", "department_head"]); },
      async requireRole(request, allowed) { return authorize(allowed); },
      ApiError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
    },
    "@/lib/server/api-response": { apiErrorResponse: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }) },
  });
  return { ...module, calls };
}

test("overview endpoint uses saved records, omits private data and only reads user roles for Admin", async () => {
  for (const role of ["admin", "hr", "department_head"]) {
    const route = endpoint("app/api/department/overview/route.ts", fixture(), role);
    const response = await route.GET(new Request("http://local/api/department/overview"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(body.assignedTasks, 3);
    assert.equal(route.calls.includes("users"), role === "admin");
    assert.equal(Boolean(body.adminSummary), role === "admin");
    const serialized = JSON.stringify(body);
    for (const privateValue of ["private-u1", "private-e0", "Private anonymous comment"]) assert.ok(!serialized.includes(privateValue));
  }
});

test("overview endpoint returns a read failure instead of pretending every count is zero", async () => {
  const route = endpoint("app/api/department/overview/route.ts", fixture(), "admin", "evaluations");
  const response = await route.GET(new Request("http://local/api/department/overview"));
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.ok(body.error);
  assert.equal(body.adminSummary, undefined);
});

test("students cannot access staff overview records", async () => {
  const route = endpoint("app/api/department/overview/route.ts", fixture(), "student");
  const response = await route.GET(new Request("http://local/api/department/overview"));
  assert.equal(response.status, 403);
  assert.deepEqual(route.calls, []);
});

test("Department Head report response card counts finalized records, not incomplete closed assignments", async () => {
  const input = fixture();
  input.periods[1].status = "closed";
  const response = await endpoint("app/api/department-head/reports/route.ts", input, "department_head").GET(new Request("http://local/api/department-head/reports"));
  const body = await response.json();
  assert.equal(body.submittedResponses, 5);
  assert.equal(body.responseCount, 3);
  assert.equal(body.resultsProtected, true);
  assert.equal(body.averageRating, null);
  assert.equal(body.teachers.find((teacher) => teacher.teacherId === "t").responses, 3);
  assert.equal(body.teachers.find((teacher) => teacher.teacherId === "inactive").responses, 0);
  assert.ok(!JSON.stringify(body).includes("Private anonymous comment"));
});

test("Department Head filters and inactive historical results retain accurate counts and averages", async () => {
  const input = fixture();
  input.teachers[0].status = "inactive";
  for (let i = 4; i <= 5; i++) {
    input.assignments[0].studentIds.push(`u${i}`);
    input.completions.push({ ...input.completions[0], id: `c${i}`, studentId: `u${i}` });
    input.evaluations.push({ ...input.evaluations[0], id: `e${i}`, averageScore: 5 });
  }
  const response = await endpoint("app/api/department-head/reports/route.ts", input, "department_head").GET(new Request("http://local/api/department-head/reports?periodId=closed"));
  const body = await response.json();
  assert.equal(body.teacherCount, 0);
  assert.equal(body.responseCount, 5);
  assert.equal(body.averageRating, 4.4);
  assert.equal(body.teachers.find((teacher) => teacher.teacherId === "t").average, 4.4);
});

test("HR reports and comparison count only finalized valid closed-period records", async () => {
  const input = fixture();
  input.periods[1].status = "closed";
  input.evaluations.push({ ...input.evaluations[0], id: "bad", averageScore: 6, ratings: { q: 6 } });
  const route = endpoint("app/api/department/comparison/route.ts", input, "hr");
  const body = await (await route.GET(new Request("http://local/api/department/comparison?details=1"))).json();
  assert.equal(body.evaluations.length, 3);
  assert.equal(body.evaluations.reduce((sum, item) => sum + item.averageScore, 0) / body.evaluations.length, 4);
  assert.equal(body.evaluations[0].comment, "Private anonymous comment");
  assert.ok(!JSON.stringify(body).includes("private-u1"));
  assert.ok(!JSON.stringify(body).includes("studentId"));
  const publicFields = await (await route.GET(new Request("http://local/api/department/comparison"))).json();
  assert.ok(!JSON.stringify(publicFields).includes("Private anonymous comment"));
  assert.ok(!JSON.stringify(publicFields).includes("ratings"));
});

test("HR saved report analyses are deduplicated and stale snapshots cannot override current totals", async () => {
  const input = fixture();
  const base = { id: "r", teacherId: "t", subjectId: "s", periodId: "closed", totalEvaluations: 3, averageScore: 4, generatedAt: 1 };
  input.reports = [base, { ...base, id: "latest", generatedAt: 2 }];
  let body = await (await endpoint("app/api/department/comparison/route.ts", input, "hr").GET(new Request("http://local/api/department/comparison?details=1&reports=1"))).json();
  assert.equal(body.reports.length, 1);
  assert.equal(body.reports[0].id, "latest");
  input.reports[1].totalEvaluations = 99;
  body = await (await endpoint("app/api/department/comparison/route.ts", input, "hr").GET(new Request("http://local/api/department/comparison?details=1&reports=1"))).json();
  assert.equal(body.reports.length, 0);
  assert.equal(body.evaluations.length, 3);
});

test("Department Head cannot request HR-only anonymous answers or detailed comments", async () => {
  const route = endpoint("app/api/department/comparison/route.ts", fixture(), "department_head");
  const response = await route.GET(new Request("http://local/api/department/comparison?details=1&reports=1"));
  assert.equal(response.status, 403);
  assert.deepEqual(route.calls, []);
});

test("HR record loader uses the finalized endpoint and preserves department and period filters", async () => {
  const requested = [];
  const { loadReleasedDepartmentResults } = loadModule("lib/firebase/department-results.ts", {
    "@/lib/authenticated-fetch": {
      authenticatedFetch: async (url) => { requested.push(url); return Response.json({
        periods: [{ id: "old", endDate: 1 }, { id: "new", endDate: 2 }],
        evaluations: [{ id: "e1", departmentId: "d1" }, { id: "e2", departmentId: "d2" }],
        reports: [{ id: "r1", departmentId: "d1" }, { id: "r2", departmentId: "d2" }],
      }); },
      readApiResponse: (response) => response.json(),
    },
  });
  const result = await loadReleasedDepartmentResults("d1", true);
  assert.deepEqual(requested, ["/api/department/comparison?details=1&reports=1"]);
  assert.deepEqual(result.periods.map((period) => period.id), ["new", "old"]);
  assert.deepEqual(result.evaluations.map((evaluation) => evaluation.id), ["e1"]);
  assert.deepEqual(result.reports.map((report) => report.id), ["r1"]);
});

test("HR comment loader handles a response without generated reports", async () => {
  const { loadReleasedDepartmentResults } = loadModule("lib/firebase/department-results.ts", {
    "@/lib/authenticated-fetch": {
      authenticatedFetch: async () => Response.json({ periods: [], evaluations: [] }),
      readApiResponse: (response) => response.json(),
    },
  });
  assert.deepEqual(await loadReleasedDepartmentResults(), { periods: [], evaluations: [], reports: [] });
});
