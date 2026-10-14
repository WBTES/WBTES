import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

function fixture(role = "admin") {
  const shared = "shared@gmail.com";
  const profile = (id) => ({ email: shared, emailNormalized: shared, displayName: `Student ${id}`, role: "student", studentNumber: `00${id}/A`, studentNumberNormalized: `00${id}/a`, studentRegistryId: `student_u${id}`, studentLogin: "school_id", status: "active", departmentId: "d", programId: "p", course: "BSIT", yearLevel: "3rd", section: "A", emailVerified: true });
  const records = { users: { u1: profile(1), u2: profile(2), admin: { role: "admin", email: "staff@example.com", status: "active" } },
    studentRegistry: { student_u1: { ...profile(1), claimedUid: "u1" }, student_u2: { ...profile(2), claimedUid: "u2" } }, studentIdentities: {}, passwordResetRequests: {}, programs: { p: { code: "BSIT", departmentId: "d", status: "active" } } };
  const accounts = new Map([
    ["u1", { uid: "u1", email: "private1@students.wbte.invalid", password: "password111", disabled: false }],
    ["u2", { uid: "u2", email: "private2@students.wbte.invalid", password: "password222", disabled: false }],
    ["admin", { uid: "admin", email: "staff@example.com", password: "staffpassword" }],
  ]);
  const updates = [], tokens = [], revoked = [], audits = [], messages = [], verified = [];
  function snapshot(reference) { return { id: reference.id, ref: reference, exists: Boolean(records[reference.name]?.[reference.id]), data: () => structuredClone(records[reference.name]?.[reference.id]) }; }
  function ref(name, id) {
    records[name] ??= {};
    return { name, id, get: async () => snapshot(ref(name, id)),
      set: async (value, options) => { records[name][id] = options?.merge ? { ...records[name][id], ...value } : structuredClone(value); },
      delete: async () => { delete records[name][id]; } };
  }
  function collection(name, filters = [], limit = Infinity) {
    records[name] ??= {};
    return { doc: (id) => ref(name, id), where: (field, op, value) => { assert.equal(op, "=="); return collection(name, [...filters, [field, value]], limit); },
      limit: (maximum) => collection(name, filters, maximum), orderBy: () => collection(name, filters, limit),
      async get() { return { docs: Object.keys(records[name]).filter((id) => filters.every(([field, value]) => records[name][id][field] === value)).slice(0, limit).map((id) => snapshot(ref(name, id))) }; },
    };
  }
  const db = { collection, async runTransaction(callback) {
    const writes = [];
    const result = await callback({ get: (reference) => reference.get(),
      set: (reference, value, options) => writes.push(() => reference.set(value, options)),
      update: (reference, value) => writes.push(() => reference.set(value, { merge: true })),
      create: (reference, value) => writes.push(() => { assert.ok(!records[reference.name][reference.id]); return reference.set(value); }),
    });
    for (const write of writes) await write(); return result;
  }, bulkWriter() { const writes = []; return {
    set: (reference, value, options) => writes.push(() => reference.set(value, options)),
    create: (reference, value) => writes.push(() => { assert.ok(!records[reference.name][reference.id]); return reference.set(value); }),
    update: (reference, value) => writes.push(() => reference.set(value, { merge: true })),
    async close() { for (const write of writes) await write(); },
  }; } };
  const auth = {
    async getUser(uid) { if (!accounts.has(uid)) throw Object.assign(new Error("Missing"), { code: "auth/user-not-found" }); return accounts.get(uid); },
    async getUsers(ids) { return { users: ids.map(({ uid }) => accounts.get(uid)).filter(Boolean) }; },
    async getUserByEmail(email) { const account = [...accounts.values()].find((item) => item.email === email); if (!account) throw Object.assign(new Error("Missing"), { code: "auth/user-not-found" }); return account; },
    async createCustomToken(uid) { tokens.push(uid); return `token:${uid}`; },
    async updateUser(uid, value) { updates.push({ uid, value }); Object.assign(accounts.get(uid), value); },
    async revokeRefreshTokens(uid) { revoked.push(uid); }, async setCustomUserClaims() {},
    async generatePasswordResetLink(email) { return `https://reset.example/?account=${email}`; },
  };
  let sessionUid = "u1", provider = "custom";
  const base = { "server-only": {}, "@/lib/firebase/admin": { adminDb: db, adminAuth: auth, adminReady: true },
    "@/lib/server/require-admin": { ApiError,
      requireAdmin: async () => { if (role !== "admin") throw new ApiError(403, "Forbidden"); return { uid: "admin", email: "staff@example.com" }; },
      requireAuthenticatedUser: async () => ({ uid: sessionUid, email: accounts.get(sessionUid).email, email_verified: true, firebase: { sign_in_provider: provider } }),
    },
    "@/lib/server/audit": { writeAuditLog: async (event) => audits.push(event) },
    "@/lib/server/school-email": { assertAllowedSchoolEmail() {} },
    "@/lib/server/assignment-sync": { synchronizeStudentAssignments: async () => ({ assignmentsAdded: 0 }) },
    "@/lib/email/smtp": { isSmtpConfigured: () => true, sendSmtpEmail: async (message) => messages.push(message), SmtpSendingLimitError: class extends Error {} },
    "@/lib/server/email-delivery-status": { isSmtpSendingPaused: async () => false, pauseSmtpSending: async () => {} },
    "@/lib/server/verification-email": {},
  };
  base["@/lib/server/api-response"] = loadModule("lib/server/api-response.ts", { ...base, "@/lib/firebase/firestore-error": loadModule("lib/firebase/firestore-error.ts") });
  base["@/lib/server/student-identities"] = loadModule("lib/server/student-identities.ts", base);
  base["@/lib/server/student-registry"] = loadModule("lib/server/student-registry.ts", base);
  base["@/lib/server/student-registration"] = loadModule("lib/server/student-registration.ts", base);
  base["@/lib/server/student-auth"] = { ...loadModule("lib/server/student-auth.ts", base),
    async verifyStudentPassword(email, password, uid) {
      verified.push({ email, uid });
      if (accounts.get(uid)?.email !== email || accounts.get(uid)?.password !== password) throw new ApiError(401, "The School ID or password is incorrect.");
    },
  };
  const request = (path, body) => new Request(`http://local${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const login = loadModule("app/api/auth/resolve-student/route.ts", base);
  const reset = loadModule("app/api/admin/students/password/route.ts", base);
  const session = loadModule("app/api/auth/session/route.ts", base);
  const recovery = loadModule("app/api/auth/password-reset/route.ts", base);
  const admin = loadModule("app/api/admin/students/route.ts", base);
  return { records, accounts, updates, tokens, revoked, audits, messages, verified, base, admin,
    login: (schoolId, password) => login.POST(request("/api/auth/resolve-student", { schoolId, password })),
    reset: (id, password) => reset.POST(request("/api/admin/students/password", { id, password })),
    resume: (uid = "u1", value = "custom") => { sessionUid = uid; provider = value; return session.POST(request("/api/auth/session", { method: "resume", mode: "claim" })); },
    recover: (email) => recovery.POST(request("/api/auth/password-reset", { email })),
  };
}

test("School ID login issues the correct token for each student sharing an email, without disclosing emails", async () => {
  const f = fixture();
  for (const [id, password, uid] of [[" 001/a ", "password111", "u1"], ["002/A", "password222", "u2"]]) {
    const response = await f.login(id, password);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { customToken: `token:${uid}` });
  }
  assert.deepEqual(f.tokens, ["u1", "u2"]);
  assert.equal(f.updates.length, 0);
});

test("one student's password cannot log into the other student's School ID", async () => {
  const f = fixture();
  for (const [id, password] of [["001/A", "password222"], ["missing", "password111"], ["001/A", ""], ["001/A", "x".repeat(129)]]) {
    const response = await f.login(id, password);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "The School ID or password is incorrect.");
  }
  assert.deepEqual(f.tokens, []);
});

test("repeated wrong passwords are limited per School ID without locking out another student on the same network", async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) assert.equal((await f.login("001/A", "wrongpassword")).status, 401);
  assert.equal((await f.login("001/A", "password111")).status, 429);
  assert.equal((await f.login("002/A", "password222")).status, 200);
});

test("legacy students sign in by School ID with their original password and UID", async () => {
  const f = fixture();
  f.accounts.get("u1").email = "old@gmail.com";
  delete f.records.users.u1.studentRegistryId; delete f.records.users.u1.studentLogin;
  assert.equal((await f.login("001/A", "password111")).status, 200);
  assert.equal(f.verified[0].email, "old@gmail.com");
  assert.match(f.accounts.get("u1").email, /@students\.wbte\.invalid$/);
  assert.equal(f.records.users.u1.email, "shared@gmail.com");
  assert.deepEqual(f.tokens, ["u1"]);
});

test("legacy Google links are removed only from the student authenticated by their School ID and password", async () => {
  const f = fixture();
  f.accounts.get("u1").providerData = [{ providerId: "password" }, { providerId: "google.com" }];
  assert.equal((await f.login("001/A", "wrongpassword")).status, 401);
  assert.equal(f.updates.length, 0);
  assert.equal((await f.login("001/A", "password111")).status, 200);
  assert.deepEqual(f.updates, [{ uid: "u1", value: { providersToUnlink: ["google.com"] } }]);
});

test("disabled, missing, ambiguous and obsolete School IDs cannot select another account", async () => {
  for (const setup of [
    (f) => { f.records.users.u1.status = "disabled"; },
    (f) => { f.accounts.delete("u1"); },
    (f) => { f.records.users.duplicate = { ...f.records.users.u1 }; },
    (f) => { const key = f.base["@/lib/server/student-identities"].studentIdentityKey("school_id", "001/a"); f.records.studentIdentities[key] = { claimedUid: "u2" }; },
  ]) {
    const f = fixture(); setup(f);
    assert.equal((await f.login("001/A", "password111")).status, 401);
    assert.equal(f.tokens.length, 0);
  }
});

test("session resume preserves the shared contact email, exact registry and existing UID", async () => {
  const f = fixture();
  for (const uid of ["u1", "u2"]) {
    const response = await f.resume(uid);
    assert.equal(response.status, 200);
    const { profile } = await response.json();
    assert.equal(profile.uid, uid); assert.equal(profile.email, "shared@gmail.com");
    assert.equal(profile.studentRegistryId, `student_${uid}`);
  }
  assert.equal(Object.keys(f.records.studentRegistry).length, 2);
  assert.equal(Object.keys(f.records.studentIdentities).length, 2);
});

test("a new Firebase account cannot claim an unlinked legacy student registration by shared email alone", async () => {
  const f = fixture();
  f.accounts.set("intruder", { uid: "intruder", email: "shared@gmail.com" });
  f.records.studentRegistry["shared%40gmail.com"] = { ...f.records.studentRegistry.student_u1, claimedUid: null, studentNumber: "victim-id" };
  const before = structuredClone(f.records);
  assert.equal((await f.resume("intruder")).status, 403);
  assert.deepEqual(f.records, before);
});

test("an existing trusted legacy profile can link its matching School ID without changing UID", async () => {
  const f = fixture();
  delete f.records.users.u1.studentRegistryId; delete f.records.users.u1.studentLogin;
  f.records.studentRegistry["shared%40gmail.com"] = { ...f.records.studentRegistry.student_u1, claimedUid: null };
  delete f.records.studentRegistry.student_u1;
  assert.equal((await f.resume("u1")).status, 200);
  assert.equal(f.records.studentRegistry["shared%40gmail.com"].claimedUid, "u1");
  assert.equal(f.records.users.u1.studentRegistryId, "shared%40gmail.com");
});

test("Google tokens cannot bypass School ID login by lying about the submitted login method", async () => {
  const f = fixture();
  const before = structuredClone(f.records);
  assert.equal((await f.resume("u1", "google.com")).status, 403);
  assert.deepEqual(f.records, before);
});

test("legacy pending activation cannot overwrite a sibling's registry or reactivate a disabled registration", async () => {
  for (const setup of [
    (f) => { f.records.users.u1.studentRegistryId = "student_u2"; },
    (f) => { f.records.studentRegistry.student_u1.status = "disabled"; },
  ]) {
    const f = fixture(); f.records.users.u1.status = "pending"; setup(f);
    const before = structuredClone(f.records);
    assert.ok([403, 409].includes((await f.resume()).status));
    assert.deepEqual(f.records, before);
  }
});

test("admin password reset affects exactly the selected UID and never resets a sibling sharing the email", async () => {
  const f = fixture();
  const before = structuredClone(f.records);
  assert.equal((await f.reset("student_u1", "newpassword1")).status, 200);
  assert.deepEqual(f.updates, [{ uid: "u1", value: { password: "newpassword1" } }]);
  assert.deepEqual(f.revoked, ["u1"]);
  assert.equal(f.accounts.get("u2").password, "password222");
  assert.deepEqual(f.records, before);
  assert.equal(f.messages.length, 0);
  assert.ok(!JSON.stringify(f.audits).includes("newpassword1"));
  assert.equal((await f.login("001/A", "newpassword1")).status, 200);
});

test("student password resets reject non-admin actors, staff targets and disabled records", async () => {
  for (const role of ["student", "hr", "department_head"]) {
    const f = fixture(role); assert.equal((await f.reset("student_u1", "newpassword1")).status, 403); assert.equal(f.updates.length, 0);
  }
  const f = fixture();
  f.records.studentRegistry.staff = { claimedUid: "admin" };
  assert.equal((await f.reset("staff", "newpassword1")).status, 403);
  f.records.users.u1.status = "disabled";
  assert.equal((await f.reset("student_u1", "newpassword1")).status, 409);
  assert.equal((await f.reset("student_u2", "short")).status, 400);
  assert.equal(f.updates.length, 0);
});

test("public email recovery sends only staff links and cannot reset a shared-email student", async () => {
  const f = fixture();
  f.accounts.get("u1").email = "shared@gmail.com";
  for (const email of ["shared@gmail.com", "private2@students.wbte.invalid", "unknown@gmail.com"]) {
    assert.equal((await f.recover(email)).status, 200);
  }
  assert.equal(f.messages.length, 0);
  assert.equal((await f.recover("staff@example.com")).status, 200);
  assert.equal(f.messages.length, 1); assert.equal(f.messages[0].to, "staff@example.com");
});

test("admin migration preserves separate records and stops rewriting records on every view", async () => {
  const f = fixture();
  const before = structuredClone(f.records.studentRegistry);
  const response = await f.admin.GET(new Request("http://local/api/admin/students"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).registrations.length, 2);
  assert.deepEqual(f.records.studentRegistry, before);
  delete f.records.studentRegistry.student_u2; delete f.records.users.u2.studentRegistryId;
  assert.equal((await f.admin.GET(new Request("http://local/api/admin/students"))).status, 200);
  assert.equal(f.records.studentRegistry.student_u1.claimedUid, "u1");
  assert.equal(f.records.studentRegistry.student_u2.claimedUid, "u2");
  assert.equal(f.records.users.u2.studentRegistryId, "student_u2");
});

test("admin contact-email corrections preserve the UID and password and do not alter a sibling's record", async () => {
  const f = fixture(); const sibling = structuredClone(f.records.users.u2);
  const account = structuredClone(f.accounts.get("u1"));
  const response = await f.admin.PATCH(new Request("http://local/api/admin/students", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...f.records.studentRegistry.student_u1, id: "student_u1", email: "corrected@gmail.com" }),
  }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(f.records.users.u1.email, "corrected@gmail.com");
  assert.equal(f.records.studentRegistry.student_u1.email, "corrected@gmail.com");
  assert.equal(f.accounts.get("u1").email, account.email);
  assert.equal(f.accounts.get("u1").password, account.password);
  assert.deepEqual(f.records.users.u2, sibling);
});

test("password validation preserves leading and trailing spaces instead of silently changing credentials", () => {
  const f = fixture();
  const password = " spaced password ";
  assert.equal(f.base["@/lib/server/student-auth"].validateStudentPassword(password), password);
  assert.throws(() => f.base["@/lib/server/student-auth"].validateStudentPassword(" ".repeat(10)), /8 to 128/);
});

test("Firebase password verification validates the returned UID and hides provider error details", async () => {
  const f = fixture(); const helper = loadModule("lib/server/student-auth.ts", f.base);
  const originalFetch = globalThis.fetch; const previous = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fixture-api-key";
  try {
    globalThis.fetch = async () => Response.json({ localId: "u1" });
    await helper.verifyStudentPassword("private@students.wbte.invalid", "password123", "u1");
    await assert.rejects(helper.verifyStudentPassword("private@students.wbte.invalid", "password123", "u2"), (error) => error.status === 401);
    globalThis.fetch = async () => Response.json({ error: { message: "INVALID_PASSWORD" } }, { status: 400 });
    await assert.rejects(helper.verifyStudentPassword("private@students.wbte.invalid", "password123", "u1"), (error) => error.status === 401 && !error.message.includes("INVALID_PASSWORD"));
    globalThis.fetch = async () => Response.json({ error: { message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }, { status: 400 });
    await assert.rejects(helper.verifyStudentPassword("private@students.wbte.invalid", "password123", "u1"), (error) => error.status === 429);
  } finally { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY; else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = previous; }
});
