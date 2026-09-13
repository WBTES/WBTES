import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = "demo-wbtes";
let testEnv;

function authenticatedDb(uid, role, departmentId = undefined, emailVerified = true) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    email_verified: emailVerified,
    role,
  }).firestore();
}

async function seedData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const documents = [
      ["users/admin", { role: "admin", status: "active" }],
      ["users/admin-unverified", { role: "admin", status: "active" }],
      ["users/hr-a", { role: "hr", status: "active", departmentId: "dept-a" }],
      ["users/hr-b", { role: "hr", status: "active", departmentId: "dept-b" }],
      ["users/head-a", { role: "department_head", status: "active", departmentId: "dept-a" }],
      ["users/student-a", { role: "student", status: "active", departmentId: "dept-a" }],
      ["users/student-unverified", { role: "student", status: "active", departmentId: "dept-a" }],
      ["users/hr-unverified", { role: "hr", status: "active", departmentId: "dept-a" }],
      ["users/head-unverified", { role: "department_head", status: "active", departmentId: "dept-a" }],
      ["departments/dept-a", { name: "Department A" }],
      ["departments/dept-b", { name: "Department B" }],
      ["programs/program-a", { name: "Program A", departmentId: "dept-a" }],
      ["programs/program-b", { name: "Program B", departmentId: "dept-b" }],
      ["subjects/subject-a", { name: "Subject A", departmentId: "dept-a" }],
      ["subjects/subject-b", { name: "Subject B", departmentId: "dept-b" }],
      ["teachers/teacher-a", { displayName: "Teacher A", departmentId: "dept-a" }],
      ["teachers/teacher-b", { displayName: "Teacher B", departmentId: "dept-b" }],
      ["evaluationPeriods/period-open", { name: "Open", status: "open" }],
      ["evaluationPeriods/period-closed", { name: "Closed", status: "closed" }],
      ["teacherAssignments/assignment-a", {
        departmentId: "dept-a",
        teacherId: "teacher-a",
        studentIds: ["student-a"],
      }],
      ["teacherAssignments/assignment-unverified", {
        departmentId: "dept-a",
        teacherId: "teacher-a",
        studentIds: ["student-unverified"],
      }],
      ["evaluationCompletions/completion-a", {
        studentId: "student-a",
        teacherId: "teacher-a",
        periodId: "period-closed",
      }],
      ["evaluations/eval-closed-a", {
        departmentId: "dept-a",
        teacherId: "teacher-a",
        subjectId: "subject-a",
        periodId: "period-closed",
        averageScore: 4.5,
      }],
      ["evaluations/eval-open-a", {
        departmentId: "dept-a",
        teacherId: "teacher-a",
        subjectId: "subject-a",
        periodId: "period-open",
        averageScore: 4.8,
      }],
      ["evaluations/eval-closed-b", {
        departmentId: "dept-b",
        teacherId: "teacher-b",
        subjectId: "subject-b",
        periodId: "period-closed",
        averageScore: 3.9,
      }],
      ["performanceReports/report-closed-a", {
        departmentId: "dept-a",
        teacherId: "teacher-a",
        periodId: "period-closed",
        averageScore: 4.5,
      }],
      ["performanceReports/report-open-a", {
        departmentId: "dept-a",
        teacherId: "teacher-a",
        periodId: "period-open",
        averageScore: 4.8,
      }],
      ["performanceReports/report-closed-b", {
        departmentId: "dept-b",
        teacherId: "teacher-b",
        periodId: "period-closed",
        averageScore: 3.9,
      }],
    ];

    await Promise.all(documents.map(([path, data]) => setDoc(doc(db, path), data)));
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedData();
});

after(async () => {
  await testEnv?.cleanup();
});

describe("HR Firestore access", () => {
  it("allows administrators to create, update, and delete academic records", async () => {
    const db = authenticatedDb("admin", "admin");
    const teacherRef = doc(db, "teachers", "teacher-new");

    await assertSucceeds(setDoc(teacherRef, { displayName: "New Teacher", departmentId: "dept-a" }));
    await assertSucceeds(updateDoc(teacherRef, { displayName: "Updated Teacher" }));
    await assertSucceeds(deleteDoc(teacherRef));
  });

  it("protects administrator profiles from deletion while allowing HR deletion", async () => {
    const db = authenticatedDb("admin", "admin");

    await assertFails(deleteDoc(doc(db, "users", "admin-unverified")));
    await assertSucceeds(deleteDoc(doc(db, "users", "hr-b")));
  });

  it("allows HR to read school-wide academic metadata", async () => {
    const db = authenticatedDb("hr-a", "hr", "dept-a");

    await assertSucceeds(getDoc(doc(db, "departments", "dept-a")));
    await assertSucceeds(getDoc(doc(db, "departments", "dept-b")));
    await assertSucceeds(getDoc(doc(db, "teachers", "teacher-a")));
    await assertSucceeds(getDoc(doc(db, "teachers", "teacher-b")));

    const ownTeachers = await assertSucceeds(getDocs(query(
      collection(db, "teachers"),
      where("departmentId", "==", "dept-a")
    )));
    assert.equal(ownTeachers.size, 1);
    const allTeachers = await assertSucceeds(getDocs(collection(db, "teachers")));
    assert.equal(allTeachers.size, 2);
  });

  it("prevents HR from creating, updating, or deleting academic records", async () => {
    const db = authenticatedDb("hr-a", "hr", "dept-a");

    await assertFails(setDoc(doc(db, "teachers", "teacher-new"), {
      displayName: "New Teacher",
      departmentId: "dept-a",
    }));
    await assertFails(updateDoc(doc(db, "teachers", "teacher-a"), { displayName: "Changed" }));
    await assertFails(deleteDoc(doc(db, "teachers", "teacher-a")));
  });

  it("does not expose identity-bearing student assignments to HR", async () => {
    const db = authenticatedDb("hr-a", "hr", "dept-a");
    await assertFails(getDoc(doc(db, "teacherAssignments", "assignment-a")));
  });

  it("releases closed-period evaluation results school-wide to HR", async () => {
    const db = authenticatedDb("hr-a", "hr", "dept-a");

    await assertSucceeds(getDoc(doc(db, "evaluations", "eval-closed-a")));
    await assertFails(getDoc(doc(db, "evaluations", "eval-open-a")));
    await assertSucceeds(getDoc(doc(db, "evaluations", "eval-closed-b")));

    const released = await assertSucceeds(getDocs(query(
      collection(db, "evaluations"),
      where("departmentId", "==", "dept-a"),
      where("periodId", "==", "period-closed")
    )));
    assert.equal(released.size, 1);
    await assertFails(getDocs(query(
      collection(db, "evaluations"),
      where("departmentId", "==", "dept-a"),
      where("periodId", "==", "period-open")
    )));
  });

  it("applies the same release rule to generated performance reports", async () => {
    const db = authenticatedDb("hr-a", "hr", "dept-a");

    await assertSucceeds(getDoc(doc(db, "performanceReports", "report-closed-a")));
    await assertFails(getDoc(doc(db, "performanceReports", "report-open-a")));
    await assertSucceeds(getDoc(doc(db, "performanceReports", "report-closed-b")));
  });

  it("rejects HR access until the account email is verified", async () => {
    const db = authenticatedDb("hr-unverified", "hr", "dept-a", false);
    await assertFails(getDoc(doc(db, "teachers", "teacher-a")));
    await assertFails(getDoc(doc(db, "evaluations", "eval-closed-a")));
  });

  it("allows department heads to read department metadata but not raw results", async () => {
    const db = authenticatedDb("head-a", "department_head", "dept-a");
    await assertSucceeds(getDoc(doc(db, "teachers", "teacher-a")));
    await assertSucceeds(getDoc(doc(db, "teachers", "teacher-b")));
    await assertFails(getDoc(doc(db, "evaluations", "eval-closed-a")));
    await assertFails(getDoc(doc(db, "performanceReports", "report-closed-a")));
    await assertFails(getDoc(doc(db, "teacherAssignments", "assignment-a")));
  });

  it("requires department-head email verification", async () => {
    const db = authenticatedDb("head-unverified", "department_head", "dept-a", false);
    await assertFails(getDoc(doc(db, "teachers", "teacher-a")));
  });

  it("does not require email verification for student or administrator access", async () => {
    const studentDb = authenticatedDb("student-unverified", "student", "dept-a", false);
    const adminDb = authenticatedDb("admin-unverified", "admin", undefined, false);

    await assertSucceeds(getDoc(doc(studentDb, "teachers", "teacher-a")));
    await assertSucceeds(getDoc(doc(adminDb, "teachers", "teacher-a")));
  });

  it("allows a student to query only their assignments and completions", async () => {
    const db = authenticatedDb("student-a", "student", "dept-a");

    const assignments = await assertSucceeds(getDocs(query(
      collection(db, "teacherAssignments"),
      where("studentIds", "array-contains", "student-a")
    )));
    assert.equal(assignments.size, 1);
    await assertFails(getDocs(collection(db, "teacherAssignments")));
    await assertFails(getDocs(query(
      collection(db, "teacherAssignments"),
      where("studentIds", "array-contains", "student-unverified")
    )));

    const completions = await assertSucceeds(getDocs(query(
      collection(db, "evaluationCompletions"),
      where("studentId", "==", "student-a")
    )));
    assert.equal(completions.size, 1);
    await assertFails(getDocs(collection(db, "evaluationCompletions")));
  });

  it("allows an unverified student to query their assignments", async () => {
    const db = authenticatedDb("student-unverified", "student", "dept-a", false);

    const assignments = await assertSucceeds(getDocs(query(
      collection(db, "teacherAssignments"),
      where("studentIds", "array-contains", "student-unverified")
    )));
    assert.equal(assignments.size, 1);

    const completions = await assertSucceeds(getDocs(query(
      collection(db, "evaluationCompletions"),
      where("studentId", "==", "student-unverified")
    )));
    assert.equal(completions.size, 0);
  });
});
