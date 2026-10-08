import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import ts from "typescript";

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost):\d+$/, "Run only through the local Firestore emulator; never against production.");
const app = initializeApp({ projectId: "demo-wbtes" }, "student-registration-tests");
const db = getFirestore(app);
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
  for (const collection of ["programs", "studentRegistry", "studentIdentities", "users"]) await db.recursiveDelete(db.collection(collection));
  await db.collection("programs").doc("bsit").set({ code: "BSIT", departmentId: "cabait", status: "active" });
});
function routes({ gateCreates = false } = {}) {
  const accounts = new Map(); let counter = 0; const waiters = []; const deleted = [];
  const adminAuth = {
    async getUserByEmail(email) { const account = [...accounts.values()].find((item) => item.email === email); if (!account) throw Object.assign(new Error("Not found"), { code: "auth/user-not-found" }); return account; },
    async createUser(input) {
      if ([...accounts.values()].some((item) => item.email === input.email)) throw Object.assign(new Error("Duplicate email"), { code: "auth/email-already-exists" });
      const account = { ...input, uid: `uid${++counter}` }; accounts.set(account.uid, account);
      if (gateCreates) await new Promise((resolve) => { waiters.push(resolve); if (waiters.length === 2) { gateCreates = false; waiters.splice(0).forEach((waiter) => waiter()); } });
      return account;
    },
    async setCustomUserClaims(uid, claims) { accounts.get(uid).claims = claims; },
    async updateUser(uid, changes) { Object.assign(accounts.get(uid), changes); return accounts.get(uid); },
    async deleteUser(uid) { deleted.push(uid); accounts.delete(uid); },
    async createCustomToken(uid) { return `token:${uid}`; },
    async revokeRefreshTokens() {},
  };
  const api = {
    asString: (value, name, max = 500) => { if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${name} is required.`); return value.trim().slice(0, max); },
    optionalString: (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "",
    normalizeEmail: (value) => String(value).trim().toLowerCase(),
    emailDocumentId: (value) => encodeURIComponent(value.toLowerCase()),
    apiErrorResponse: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
  };
  const base = {
    "server-only": {}, "@/lib/firebase/admin": { adminDb: db, adminAuth, adminReady: true }, "@/lib/server/api-response": api,
    "@/lib/server/require-admin": { ApiError, requireAdmin: async () => ({ uid: "admin", email: "admin@test.local" }), requireAuthenticatedUser: async (request) => ({ uid: request.headers.get("fixture-uid"), email: request.headers.get("fixture-email"), email_verified: true }) },
    "@/lib/server/audit": { writeAuditLog: async () => {} },
    "@/lib/server/assignment-sync": { synchronizeStudentAssignments: async () => ({ assignmentsAdded: 0 }) },
    "@/lib/server/school-email": { assertAllowedSchoolEmail() {} },
  };
  base["@/lib/server/student-identities"] = loadModule("lib/server/student-identities.ts", base);
  base["@/lib/server/student-registration"] = loadModule("lib/server/student-registration.ts", base);
  const registration = loadModule("app/api/auth/registration/route.ts", base);
  const admin = loadModule("app/api/admin/students/route.ts", base);
  const session = loadModule("app/api/auth/session/route.ts", { ...base, "@/lib/email/smtp": { isSmtpConfigured: () => false }, "@/lib/server/verification-email": { deliverVerificationEmail: async () => "sent" } });
  const form = { email: "first@gmail.com", studentNumber: "001-A", displayName: "Student One", programId: "bsit", yearLevel: "3rd", section: "A", password: "password123" };
  const register = (changes = {}, ip = "fixture") => registration.POST(new Request("http://local/api/auth/registration", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ ...form, ...changes }) }));
  return { accounts, deleted, register, admin, session, form };
}

test("real Firestore transactions prevent two simultaneous accounts with one School ID", async () => {
  const f = routes({ gateCreates: true });
  const responses = await Promise.all([f.register({}, "one"), f.register({ email: "second@gmail.com", studentNumber: " 001-a " }, "two")]);
  const statuses = responses.map((response) => response.status);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(statuses.sort(), [201, 409], JSON.stringify(bodies));
  assert.equal((await db.collection("users").get()).size, 1);
  assert.equal((await db.collection("studentRegistry").get()).size, 1);
  assert.equal((await db.collection("studentIdentities").get()).size, 2);
  assert.equal(f.accounts.size, 1);
  assert.equal(f.deleted.length, 1);
});

test("real concurrent same-email requests leave the winning student records untouched", async () => {
  const f = routes();
  const responses = await Promise.all([f.register({}, "one"), f.register({ studentNumber: "second-id" }, "two")]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const registry = (await db.collection("studentRegistry").get()).docs[0].data();
  assert.ok(f.accounts.has(registry.claimedUid));
  assert.equal((await db.collection("users").get()).size, 1);
});

test("admin School ID changes and student signup cannot claim the same new ID", async () => {
  const f = routes(); assert.equal((await f.register()).status, 201);
  const id = encodeURIComponent(f.form.email);
  const edit = new Request("http://local/api/admin/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f.form, id, studentNumber: "new-id", status: "active" }) });
  const responses = await Promise.all([f.admin.PATCH(edit), f.register({ email: "second@gmail.com", studentNumber: "new-id" })]);
  const statuses = responses.map((response) => response.status);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.ok((statuses[0] === 200 && statuses[1] === 409) || (statuses[0] === 409 && statuses[1] === 201), JSON.stringify(bodies));
  assert.equal((await db.collection("studentRegistry").where("studentNumberNormalized", "==", "new-id").get()).size, 1);
  assert.ok((await db.collection("users").doc("uid1").get()).exists);
});

test("a legacy student sign-in reserves its own identifiers without changing UID", async () => {
  const f = routes();
  f.accounts.set("legacy", { uid: "legacy", email: f.form.email });
  await db.collection("users").doc("legacy").set({ ...f.form, emailNormalized: f.form.email, departmentId: "cabait", course: "BSIT", role: "student", status: "active" });
  const response = await f.session.POST(new Request("http://local/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json", "fixture-uid": "legacy", "fixture-email": f.form.email }, body: JSON.stringify({ method: "resume", mode: "claim" }) }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).profile.uid, "legacy");
  assert.equal((await db.collection("studentIdentities").get()).size, 2);
  assert.equal((await f.register({ email: "second@gmail.com" })).status, 409);
});

test("session recovery cannot transfer a registration already claimed by another UID", async () => {
  const f = routes(); await f.register();
  const response = await f.session.POST(new Request("http://local/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json", "fixture-uid": "other", "fixture-email": f.form.email }, body: JSON.stringify({ method: "resume", mode: "claim" }) }));
  assert.equal(response.status, 409);
  assert.equal((await db.collection("studentRegistry").doc(encodeURIComponent(f.form.email)).get()).data().claimedUid, "uid1");
  assert.ok(!(await db.collection("users").doc("other").get()).exists);
});

test("admin edits cannot clear an assigned School ID", async () => {
  const f = routes(); await f.register();
  const response = await f.admin.PATCH(new Request("http://local/api/admin/students", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f.form, id: encodeURIComponent(f.form.email), studentNumber: "", status: "active" }) }));
  assert.equal(response.status, 400);
  assert.equal((await db.collection("users").doc("uid1").get()).data().studentNumber, "001-A");
});

test("deleting a legacy student retains their once-only email and School ID reservations", async () => {
  const f = routes();
  f.accounts.set("legacy", { uid: "legacy", email: f.form.email });
  const record = { ...f.form, emailNormalized: f.form.email, studentNumberNormalized: "001-a", departmentId: "cabait", claimedUid: "legacy", status: "active" };
  const id = encodeURIComponent(f.form.email);
  await db.collection("studentRegistry").doc(id).set(record);
  await db.collection("users").doc("legacy").set({ ...record, role: "student" });
  const deleteUrl = new URL("http://local/api/admin/students");
  deleteUrl.searchParams.set("id", id);
  const response = await f.admin.DELETE(new Request(deleteUrl));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.ok(!(await db.collection("studentRegistry").doc(id).get()).exists);
  assert.ok(!(await db.collection("users").doc("legacy").get()).exists);
  assert.equal((await db.collection("studentIdentities").get()).size, 2);
  assert.equal((await f.register({ studentNumber: "other" })).status, 409);
  assert.equal((await f.register({ email: "second@gmail.com" })).status, 409);
});
