import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import ts from "typescript";

for (const variable of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  assert.match(process.env[variable] ?? "", /^(127\.0\.0\.1|localhost):\d+$/, "Use only local emulators, never production.");
}
const app = initializeApp({ projectId: "demo-wbtes" }, "shared-student-auth-tests");
const db = getFirestore(app), auth = getAuth(app);
after(() => deleteApp(app));
const require = createRequire(import.meta.url);
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function loadModule(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
beforeEach(async () => {
  for (const name of ["programs", "studentRegistry", "studentIdentities", "users", "teacherAssignments", "teachers", "evaluationPeriods", "evaluationCompletions", "passwordResetRequests"]) await db.recursiveDelete(db.collection(name));
  const accounts = await auth.listUsers(1000);
  if (accounts.users.length) await auth.deleteUsers(accounts.users.map((account) => account.uid));
  await db.collection("programs").doc("bsit").set({ code: "BSIT", departmentId: "cabait", status: "active" });
});
function fixture() {
  const messages = [], audits = [];
  let sessionUid;
  const base = { "server-only": {}, "@/lib/firebase/admin": { adminDb: db, adminAuth: auth, adminReady: true },
    "@/lib/server/require-admin": { ApiError, requireAdmin: async () => ({ uid: "admin", email: "admin@example.com" }),
      requireAuthenticatedUser: async () => { const account = await auth.getUser(sessionUid); return { uid: sessionUid, email: account.email, email_verified: true, firebase: { sign_in_provider: "custom" } }; },
    },
    "@/lib/server/audit": { writeAuditLog: async (value) => audits.push(value) },
    "@/lib/server/school-email": { assertAllowedSchoolEmail() {} },
    "@/lib/email/smtp": { isSmtpConfigured: () => true, sendSmtpEmail: async (value) => messages.push(value), SmtpSendingLimitError: class extends Error {} },
    "@/lib/server/verification-email": {},
    "@/lib/server/email-delivery-status": { isSmtpSendingPaused: async () => false, pauseSmtpSending: async () => {} },
  };
  base["@/lib/server/api-response"] = loadModule("lib/server/api-response.ts", { ...base, "@/lib/firebase/firestore-error": loadModule("lib/firebase/firestore-error.ts") });
  for (const name of ["student-identities", "student-auth", "student-registry", "student-registration"]) base[`@/lib/server/${name}`] = loadModule(`lib/server/${name}.ts`, base);
  base["@/lib/server/assignment-sync"] = loadModule("lib/server/assignment-sync.ts", {
    ...base, "@/lib/assignment-scope": loadModule("lib/assignment-scope.ts"), "@/lib/periods": loadModule("lib/periods.ts"),
  });
  const registration = loadModule("app/api/auth/registration/route.ts", base);
  const login = loadModule("app/api/auth/resolve-student/route.ts", base);
  const session = loadModule("app/api/auth/session/route.ts", base);
  const admin = loadModule("app/api/admin/students/route.ts", base);
  const reset = loadModule("app/api/admin/students/password/route.ts", base);
  const recovery = loadModule("app/api/auth/password-reset/route.ts", base);
  const form = { email: "shared@gmail.com", studentNumber: "001/A", displayName: "Student One", programId: "bsit", yearLevel: "3rd", section: "A", password: "password111" };
  const request = (path, body, method = "POST") => new Request(`http://local${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { messages, audits, form,
    register: (changes = {}) => registration.POST(request("/api/auth/registration", { ...form, ...changes })),
    login: (schoolId, password) => login.POST(request("/api/auth/resolve-student", { schoolId, password })),
    resume: (uid) => { sessionUid = uid; return session.POST(request("/api/auth/session", { method: "resume", mode: "claim" })); },
    edit: (id, changes) => admin.PATCH(request("/api/admin/students", { ...form, id, status: "active", ...changes }, "PATCH")),
    list: () => admin.GET(new Request("http://local/api/admin/students")),
    reset: (id, password) => reset.POST(request("/api/admin/students/password", { id, password })),
    recover: (email) => recovery.POST(request("/api/auth/password-reset", { email })),
  };
}
async function uidFromLogin(response) {
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["customToken"]);
  const result = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: body.customToken, returnSecureToken: true }),
  });
  const account = await result.json(); assert.equal(result.status, 200, JSON.stringify(account));
  assert.equal(typeof account.idToken, "string");
  return (await auth.verifyIdToken(account.idToken)).uid;
}

test("real Firebase Auth accepts separate password identities for students sharing the same contact email", async () => {
  const f = fixture();
  const responses = await Promise.all([f.register(), f.register({ studentNumber: "002/A", password: "password222" })]);
  for (const response of responses) assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const uid1 = await uidFromLogin(await f.login("001/a", "password111"));
  const uid2 = await uidFromLogin(await f.login("002/A", "password222"));
  assert.notEqual(uid1, uid2);
  assert.notEqual((await auth.getUser(uid1)).email, (await auth.getUser(uid2)).email);
  for (const uid of [uid1, uid2]) {
    const response = await f.resume(uid); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).profile.email, "shared@gmail.com");
    assert.equal((await db.collection("studentRegistry").doc(`student_${uid}`).get()).data().claimedUid, uid);
  }
  assert.equal((await db.collection("studentRegistry").get()).size, 2);
  assert.equal((await f.login("001/A", "password222")).status, 401);
});

test("real School ID edits retain the UID, password, contact email and assignment/completion links", async () => {
  const f = fixture(); await f.register();
  const uid = await uidFromLogin(await f.login("001/A", "password111"));
  await db.collection("teacherAssignments").doc("a").set({ studentIds: [uid] });
  await db.collection("evaluationCompletions").doc("c").set({ studentId: uid, assignmentId: "a" });
  const response = await f.edit(`student_${uid}`, { studentNumber: "new-001/A", email: "corrected@gmail.com" });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await f.login("001/A", "password111")).status, 401);
  assert.equal(await uidFromLogin(await f.login("new-001/a", "password111")), uid);
  assert.equal((await db.collection("users").doc(uid).get()).data().email, "corrected@gmail.com");
  assert.deepEqual((await db.collection("teacherAssignments").doc("a").get()).data().studentIds, [uid]);
  assert.equal((await db.collection("evaluationCompletions").doc("c").get()).data().studentId, uid);
  assert.equal((await f.register({ studentNumber: "001/A", email: "other@gmail.com" })).status, 409);
});

test("simultaneous shared-email registrations both receive their eligible teacher evaluation", async () => {
  const f = fixture();
  await db.collection("teachers").doc("t").set({ status: "active", departmentId: "cabait", programIds: ["bsit"], yearLevels: ["3rd"], sections: ["A"], subjectIds: ["s"] });
  await db.collection("evaluationPeriods").doc("p").set({ status: "open", startDate: Date.now() - 60_000, endDate: Date.now() + 3_600_000 });
  await db.collection("teacherAssignments").doc("a").set({ teacherId: "t", subjectId: "s", periodId: "p", departmentId: "cabait", studentIds: [] });
  const responses = await Promise.all([f.register(), f.register({ studentNumber: "002/A", password: "password222" })]);
  for (const response of responses) assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const uid1 = await uidFromLogin(await f.login("001/A", "password111"));
  const uid2 = await uidFromLogin(await f.login("002/A", "password222"));
  assert.deepEqual(new Set((await db.collection("teacherAssignments").doc("a").get()).data().studentIds), new Set([uid1, uid2]));
});

test("legacy student migration keeps original UID and password without merging records by shared email", async () => {
  const f = fixture();
  await auth.createUser({ uid: "legacy", email: f.form.email, password: f.form.password });
  await auth.updateUser("legacy", { providerToLink: { providerId: "google.com", uid: "google-legacy", email: f.form.email } });
  const profile = { ...f.form, emailNormalized: f.form.email, studentNumberNormalized: "001/a", role: "student", status: "active", departmentId: "cabait", course: "BSIT" };
  await db.collection("users").doc("legacy").set(profile);
  await db.collection("studentRegistry").doc(f.form.email).set({ ...profile, claimedUid: "legacy" });
  assert.equal((await f.register({ studentNumber: "002/A", password: "password222" })).status, 201);
  const listed = await f.list(); assert.equal(listed.status, 200, JSON.stringify(await listed.clone().json()));
  assert.equal((await listed.json()).registrations.length, 2);
  assert.equal(await uidFromLogin(await f.login("001/A", f.form.password)), "legacy");
  assert.match((await auth.getUser("legacy")).email, /@students\.wbte\.invalid$/);
  assert.ok(!(await auth.getUser("legacy")).providerData.some((provider) => provider.providerId === "google.com"));
  assert.equal((await db.collection("studentRegistry").doc(f.form.email).get()).data().claimedUid, "legacy");
  assert.equal((await db.collection("users").doc("legacy").get()).data().email, f.form.email);
});

test("real admin password reset changes only the chosen student's credentials", async () => {
  const f = fixture(); await f.register(); await f.register({ studentNumber: "002/A", password: "password222" });
  const uid1 = await uidFromLogin(await f.login("001/A", "password111"));
  const uid2 = await uidFromLogin(await f.login("002/A", "password222"));
  assert.equal((await f.reset(`student_${uid1}`, "resetpassword1")).status, 200);
  assert.equal((await f.login("001/A", "password111")).status, 401);
  assert.equal(await uidFromLogin(await f.login("001/A", "resetpassword1")), uid1);
  assert.equal(await uidFromLogin(await f.login("002/A", "password222")), uid2);
  assert.equal(f.messages.length, 0);
  assert.ok(!JSON.stringify(f.audits).includes("resetpassword1"));
});

test("student email reset is blocked while staff SMTP recovery remains available", async () => {
  const f = fixture();
  await auth.createUser({ uid: "legacy", email: f.form.email, password: f.form.password });
  await db.collection("users").doc("legacy").set({ role: "student", email: f.form.email });
  await auth.createUser({ uid: "staff", email: "hr@example.com", password: "staffpassword" });
  await db.collection("users").doc("staff").set({ role: "hr", email: "hr@example.com" });
  assert.equal((await f.recover(f.form.email)).status, 200);
  assert.equal(f.messages.length, 0);
  assert.equal((await f.recover("hr@example.com")).status, 200);
  assert.equal(f.messages.length, 1); assert.equal(f.messages[0].to, "hr@example.com");
});
