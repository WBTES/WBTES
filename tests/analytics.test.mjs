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
const { buildAnalytics } = loadModule("lib/analytics.ts", { "./evaluation-results": results });

function fixture() {
  return {
    departments: [{ id: "cabait", code: "CABAIT", name: "DEAN OF" }, { id: "educ", code: "EDUC", name: "DEAN" }],
    teachers: [{ id: "teacher1", displayName: "Teacher One", departmentId: "cabait" }],
    periods: [{ id: "period1", name: "First semester", status: "closed", endDate: 100 }],
    assignments: [{ id: "assignment1", teacherId: "teacher1", subjectId: "subject1", departmentId: "cabait", periodId: "period1", studentIds: ["student1", "student2"] }],
    evaluations: [
      { id: "evaluation1", assignmentId: "assignment1", teacherId: "teacher1", subjectId: "subject1", departmentId: "cabait", periodId: "period1", averageScore: 4, comment: "Private comment" },
      { id: "evaluation2", assignmentId: "assignment1", teacherId: "teacher1", subjectId: "subject1", departmentId: "cabait", periodId: "period1", averageScore: 5 },
    ],
    completions: [
      { id: "completion1", assignmentId: "assignment1", studentId: "student1", periodId: "period1" },
      { id: "completion2", assignmentId: "assignment1", studentId: "student2", periodId: "period1" },
    ],
  };
}

test("both departments stay visible without inventing an Education rating", () => {
  const data = buildAnalytics(fixture());
  assert.deepEqual(data.departmentAverages.map((item) => [item.name, item.average]), [["CABAIT", 4.5], ["EDUC", null]]);
  assert.deepEqual(data.departmentCounts.map((item) => [item.name, item.evaluations]), [["CABAIT", 2], ["EDUC", 0]]);
  assert.deepEqual(data.completionByDepartment.map((item) => [item.department, item.completed, item.pending]), [["CABAIT", 2, 0], ["EDUC", 0, 0]]);
});

test("Education responses, averages and task completion appear under Education", () => {
  const input = fixture();
  input.assignments[0].departmentId = "educ";
  input.evaluations.forEach((item) => { item.departmentId = "educ"; });
  const data = buildAnalytics(input);
  assert.equal(data.departmentAverages[1].average, 4.5);
  assert.equal(data.departmentCounts[1].evaluations, 2);
  assert.equal(data.completionByDepartment[1].completed, 2);
  assert.equal(data.departmentCounts.reduce((sum, item) => sum + item.evaluations, 0), data.totalEvaluations);
});

test("partial assignments count received responses but do not release ratings", () => {
  const input = fixture();
  input.evaluations.pop();
  input.completions.pop();
  const data = buildAnalytics(input);
  assert.equal(data.totalEvaluations, 1);
  assert.equal(data.averageRating, null);
  assert.equal(data.topTeachers[0].average, null);
  assert.equal(data.completionByDepartment[0].completed, 1);
  assert.equal(data.completionByDepartment[0].pending, 1);
  assert.equal(data.completedStudents, 1);
  assert.equal(data.pendingStudents, 1);
});

test("all evaluated teachers are returned, including pending and inactive teachers", () => {
  const input = fixture();
  for (let index = 2; index <= 14; index += 1) {
    input.teachers.push({ id: `teacher${index}`, displayName: `Teacher ${index}`, departmentId: "educ", status: "inactive" });
    input.evaluations.push({ ...input.evaluations[0], id: `evaluation${index + 2}`, teacherId: `teacher${index}`, assignmentId: `pending${index}`, departmentId: "educ" });
  }
  const data = buildAnalytics(input);
  assert.equal(data.topTeachers.length, 14);
  assert.equal(data.topTeachers[0].average, 4.5);
  assert.equal(data.topTeachers.filter((item) => item.average === null).length, 13);
});

test("duplicate roster and completion entries cannot inflate progress", () => {
  const input = fixture();
  input.assignments[0].studentIds.push("student1");
  input.completions.push({ ...input.completions[0], id: "duplicate" });
  input.completions.push({ ...input.completions[0], studentId: "not-assigned" });
  const data = buildAnalytics(input);
  assert.equal(data.completionByDepartment[0].completed, 2);
  assert.equal(data.completedStudents, 2);
  assert.equal(data.averageRating, 4.5);
});

test("closed-period and minimum-response protections do not hide participation", () => {
  const input = fixture();
  const closedOnly = buildAnalytics({ ...input, releasedPeriodIds: new Set() });
  assert.equal(closedOnly.averageRating, null);
  assert.equal(closedOnly.totalEvaluations, 2);
  const protectedData = buildAnalytics({ ...input, minimumResponses: 5 });
  assert.equal(protectedData.averageRating, null);
  assert.equal(protectedData.departmentAverages[0].average, null);
  assert.equal(protectedData.topTeachers[0].average, null);
  assert.equal(protectedData.trend[0].average, null);
  assert.equal(protectedData.completionByDepartment[0].completed, 2);
});

test("Department Head ratings release when a completed group reaches five responses", () => {
  const input = fixture();
  for (let index = 3; index <= 5; index += 1) {
    input.assignments[0].studentIds.push(`student${index}`);
    input.completions.push({ ...input.completions[0], id: `completion${index}`, studentId: `student${index}` });
    input.evaluations.push({ ...input.evaluations[0], id: `evaluation${index}`, averageScore: 4 });
  }
  const data = buildAnalytics({ ...input, minimumResponses: 5, releasedPeriodIds: new Set(["period1"]) });
  assert.equal(data.averageRating, 4.2);
  assert.equal(data.departmentAverages[0].average, 4.2);
  assert.equal(data.topTeachers[0].average, 4.2);
  assert.equal(data.trend[0].average, 4.2);
});

test("unresolved historical departments remain counted instead of disappearing", () => {
  const input = fixture();
  input.assignments[0].departmentId = "deleted";
  input.teachers[0].departmentId = "deleted";
  input.evaluations.forEach((item) => { item.departmentId = "deleted"; });
  const data = buildAnalytics(input);
  assert.equal(data.departmentCounts.at(-1).name, "Unassigned department");
  assert.equal(data.departmentCounts.at(-1).evaluations, 2);
  assert.equal(data.completionByDepartment.at(-1).completed, 2);
});

function analyticsRoute(input, role) {
  const collections = { evaluations: input.evaluations, evaluationCompletions: input.completions, teacherAssignments: input.assignments, teachers: input.teachers, departments: input.departments, evaluationPeriods: input.periods };
  return loadModule("app/api/analytics/route.ts", {
    "@/lib/firebase/admin": { adminDb: { collection(name) { return { async get() { return { docs: collections[name].map((item) => ({ id: item.id, data: () => item })) }; } }; } } },
    "@/lib/analytics": { buildAnalytics },
    "@/lib/server/require-admin": {
      ApiError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
      async requireDepartmentStaff() {
        if (!["admin", "hr", "department_head"].includes(role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
        return { profile: { role } };
      },
    },
    "@/lib/server/api-response": { apiErrorResponse: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }) },
  });
}

test("aggregate endpoint applies role-specific release rules and excludes private records", async () => {
  for (const role of ["admin", "hr", "department_head"]) {
    const response = await analyticsRoute(fixture(), role).GET(new Request("http://localhost/api/analytics"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.data.averageRating, role === "department_head" ? null : 4.5);
    const serialized = JSON.stringify(body);
    for (const privateValue of ["student1", "student2", "Private comment", "completion1", "evaluation1"]) {
      assert.equal(serialized.includes(privateValue), false);
    }
  }
  const input = fixture();
  input.periods[0].status = "open";
  const body = await (await analyticsRoute(input, "hr").GET(new Request("http://localhost/api/analytics"))).json();
  assert.equal(body.data.averageRating, null);
  assert.equal(body.data.totalEvaluations, 2);
});

test("aggregate endpoint rejects students and invalid period filters", async () => {
  const denied = await analyticsRoute(fixture(), "student").GET(new Request("http://localhost/api/analytics"));
  assert.equal(denied.status, 403);
  const invalid = await analyticsRoute(fixture(), "admin").GET(new Request("http://localhost/api/analytics?periodId=missing"));
  assert.equal(invalid.status, 400);
});

test("period filters scope both submitted responses and assigned task counts", async () => {
  const input = fixture();
  input.periods.push({ id: "period2", name: "Second semester", status: "open", endDate: 200 });
  input.assignments.push({ ...input.assignments[0], id: "assignment2", periodId: "period2", departmentId: "educ" });
  const body = await (await analyticsRoute(input, "admin").GET(new Request("http://localhost/api/analytics?periodId=period2"))).json();
  assert.equal(body.data.totalEvaluations, 0);
  assert.equal(body.data.averageRating, null);
  assert.equal(body.data.completionByDepartment[0].completed, 0);
  assert.equal(body.data.completionByDepartment[1].pending, 2);
});
