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

function fixture() {
  const records = { programs: { bsit: { code: "BSIT", departmentId: "cabait", status: "active" } }, users: {}, studentRegistry: {}, studentIdentities: {} };
  const auth = new Map();
  const calls = { created: [], deleted: [], updated: [], tokens: [], assignments: [] };
  let counter = 0;
  let transactionTail = Promise.resolve();
  let gateCreates = false;
  const createWaiters = [];
  let failBeforeCommit = false;
  let failAfterCommit = false;
  let failToken = false;
  let failClaims = false;
  function ref(name, id) {
    return { name, id, async get() { return snapshot(this); }, async set(data, options) { records[name][id] = options?.merge ? { ...records[name][id], ...data } : structuredClone(data); }, async delete() { delete records[name][id]; } };
  }
  function snapshot(reference) { return { id: reference.id, ref: reference, exists: Boolean(records[reference.name]?.[reference.id]), data: () => structuredClone(records[reference.name]?.[reference.id]) }; }
  function collection(name, filters = [], maximum = Infinity) {
    records[name] ??= {};
    return {
      name, filters, maximum,
      doc: (id) => ref(name, id),
      where: (field, operation, value) => { assert.equal(operation, "=="); return collection(name, [...filters, [field, value]], maximum); },
      limit: (limit) => collection(name, filters, limit),
      async get() { return { docs: Object.keys(records[name]).filter((id) => filters.every(([field, value]) => records[name][id][field] === value)).slice(0, maximum).map((id) => snapshot(ref(name, id))) }; },
    };
  }
  const adminDb = {
    collection,
    async runTransaction(callback) {
      let release;
      const before = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await before;
      try {
        if (failBeforeCommit) { failBeforeCommit = false; throw Object.assign(new Error("Quota exceeded"), { code: 8 }); }
        const writes = [];
        const result = await callback({
          async get(reference) { assert.equal(writes.length, 0, "All transaction reads must precede writes"); return reference.filters ? reference.get() : snapshot(reference); },
          create: (reference, data) => writes.push(["create", reference, data]),
          set: (reference, data, options) => writes.push([options?.merge ? "update" : "set", reference, data]),
          update: (reference, data) => writes.push(["update", reference, data]),
        });
        for (const [operation, reference] of writes) if (operation === "create") assert.ok(!records[reference.name][reference.id]);
        for (const [operation, reference, data] of writes) records[reference.name][reference.id] = operation === "update" ? { ...records[reference.name][reference.id], ...data } : structuredClone(data);
        if (failAfterCommit) { failAfterCommit = false; throw new Error("Commit acknowledgement lost"); }
        return result;
      } finally { release(); }
    },
  };
  const adminAuth = {
    async getUserByEmail(email) { const account = [...auth.values()].find((item) => item.email === email); if (!account) throw Object.assign(new Error("Not found"), { code: "auth/user-not-found" }); return account; },
    async createUser(input) {
      if ([...auth.values()].some((item) => item.email === input.email)) throw Object.assign(new Error("Duplicate email"), { code: "auth/email-already-exists" });
      const account = { ...input, uid: `uid${++counter}` }; auth.set(account.uid, account); calls.created.push(account);
      if (gateCreates) await new Promise((resolve) => { createWaiters.push(resolve); if (createWaiters.length === 2) { gateCreates = false; createWaiters.splice(0).forEach((waiter) => waiter()); } });
      return account;
    },
    async deleteUser(uid) { calls.deleted.push(uid); auth.delete(uid); },
    async updateUser(uid, data) { calls.updated.push(uid); Object.assign(auth.get(uid), data); return auth.get(uid); },
    async setCustomUserClaims(uid, claims) { if (failClaims) throw new Error("Claims failed"); auth.get(uid).claims = claims; },
    async createCustomToken(uid) { if (failToken) throw new Error("Token failed"); calls.tokens.push(uid); return `token:${uid}`; },
  };
  const api = {
    asString: (value, name, max = 500) => { if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${name} is required.`); return value.trim().slice(0, max); },
    optionalString: (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "",
    normalizeEmail: (value) => { if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new ApiError(400, "Enter a valid email address."); return value.trim().toLowerCase(); },
    emailDocumentId: (email) => encodeURIComponent(email.toLowerCase()),
    apiErrorResponse: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
  };
  const deps = { "server-only": {}, "@/lib/firebase/admin": { adminDb, adminAuth, adminReady: true }, "@/lib/server/api-response": api, "@/lib/server/require-admin": { ApiError } };
  const identities = loadModule("lib/server/student-identities.ts", deps);
  deps["@/lib/server/student-identities"] = identities;
  const validation = loadModule("lib/server/student-registration.ts", { ...deps, "@/lib/server/school-email": { assertAllowedSchoolEmail() {} } });
  const route = loadModule("app/api/auth/registration/route.ts", {
    ...deps, "@/lib/server/student-registration": validation,
    "@/lib/server/audit": { writeAuditLog: async () => {} },
    "@/lib/server/assignment-sync": { synchronizeStudentAssignments: async (student) => { calls.assignments.push(student); return { assignmentsAdded: 1 }; } },
  });
  const register = (changes = {}, ip = "fixture") => route.POST(new Request("http://local/api/auth/registration", {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ displayName: "Student One", email: "student@gmail.com", studentNumber: "001-AB", programId: "bsit", yearLevel: "3rd", section: "A", password: "password123", ...changes }),
  }));
  return { records, auth, calls, adminDb, identities, validation, register,
    raceCreates: () => { gateCreates = true; }, failBeforeCommit: () => { failBeforeCommit = true; }, failAfterCommit: () => { failAfterCommit = true; },
    failToken: () => { failToken = true; }, failClaims: () => { failClaims = true; },
  };
}

test("registration creates one active student, linked School ID and email, and automatic login token", async () => {
  const f = fixture();
  const response = await f.register({ email: " Student@GMAIL.com ", studentNumber: " 001-AB " });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.customToken, "token:uid1");
  assert.equal(body.status, "active");
  assert.equal(f.records.users.uid1.role, "student");
  assert.equal(f.records.users.uid1.studentNumber, "001-AB");
  assert.equal(f.records.users.uid1.studentNumberNormalized, "001-ab");
  assert.equal(f.records.studentRegistry[encodeURIComponent("student@gmail.com")].claimedUid, "uid1");
  assert.equal(Object.keys(f.records.studentIdentities).length, 2);
  assert.equal(f.calls.assignments[0].uid, "uid1");
  assert.equal(f.auth.get("uid1").emailVerified, true);
  assert.deepEqual(f.auth.get("uid1").claims, { role: "student", status: "active", departmentId: "cabait" });
});

test("the same Gmail cannot register a second student with a different School ID", async () => {
  const f = fixture(); await f.register();
  const response = await f.register({ email: " STUDENT@gmail.com ", studentNumber: "other-id" });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /email.*already registered.*Forgot password/i);
  assert.equal(f.auth.size, 1);
  assert.equal(Object.keys(f.records.users).length, 1);
});

test("the same normalized School ID cannot register with a different Gmail", async () => {
  const f = fixture(); await f.register();
  const response = await f.register({ email: "another@gmail.com", studentNumber: " 001-ab " });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /School ID.*already registered/);
  assert.equal(f.auth.size, 1);
});

test("simultaneous registrations for the same School ID produce exactly one account", async () => {
  const f = fixture(); f.raceCreates();
  const responses = await Promise.all([f.register({}, "one"), f.register({ email: "another@gmail.com" }, "two")]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(f.auth.size, 1);
  assert.equal(Object.keys(f.records.users).length, 1);
  assert.equal(Object.keys(f.records.studentRegistry).length, 1);
  assert.equal(Object.keys(f.records.studentIdentities).length, 2);
  assert.equal(f.calls.deleted.length, 1);
  const winner = Object.keys(f.records.users)[0];
  assert.ok(f.auth.has(winner));
  assert.ok(!f.calls.deleted.includes(winner));
});

test("simultaneous registrations for the same email return a clear conflict", async () => {
  const f = fixture();
  const responses = await Promise.all([f.register({}, "one"), f.register({ studentNumber: "other" }, "two")]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(f.auth.size, 1);
  assert.equal(Object.keys(f.records.users).length, 1);
});

test("public registration never resets an existing Firebase account without a profile", async () => {
  const f = fixture(); f.auth.set("existing", { uid: "existing", email: "student@gmail.com", password: "original", disabled: true, emailVerified: false });
  const before = structuredClone(f.auth.get("existing"));
  const response = await f.register();
  assert.equal(response.status, 409);
  assert.deepEqual(f.auth.get("existing"), before);
  assert.deepEqual(f.calls.updated, []);
  assert.deepEqual(f.calls.deleted, []);
  assert.equal(Object.keys(f.records.studentIdentities).length, 0);
});

test("pending, disabled and active registrations are not deleted or replaced", async () => {
  for (const status of ["pending", "disabled", "active"]) {
    const f = fixture();
    const id = encodeURIComponent("student@gmail.com"); f.records.studentRegistry[id] = { email: "student@gmail.com", studentNumber: "001-AB", status };
    const before = structuredClone(f.records.studentRegistry[id]);
    assert.equal((await f.register()).status, 409);
    assert.deepEqual(f.records.studentRegistry[id], before);
    assert.equal(f.auth.size, 0);
  }
});

test("legacy profiles and registry records still prevent duplicate School IDs", async () => {
  for (const name of ["users", "studentRegistry"]) {
    const f = fixture(); f.records[name].legacy = { email: "legacy@gmail.com", studentNumber: "001-AB", status: "disabled" };
    assert.equal((await f.register()).status, 409);
    assert.equal(f.auth.size, 0);
  }
});

test("email and School ID reservations remain unavailable after account records are removed", async () => {
  const f = fixture(); await f.register();
  f.records.users = {}; f.records.studentRegistry = {}; f.auth.clear();
  assert.equal((await f.register({ studentNumber: "other" })).status, 409);
  assert.equal((await f.register({ email: "other@gmail.com" })).status, 409);
  assert.equal(f.auth.size, 0);
});

test("empty School IDs, overlong IDs, invalid years and weak passwords cannot create accounts", async () => {
  for (const changes of [{ studentNumber: " " }, { studentNumber: "x".repeat(101) }, { yearLevel: "5th" }, { password: "short" }, { email: "invalid" }]) {
    const f = fixture(); const response = await f.register(changes);
    assert.equal(response.status, 400);
    assert.equal(f.auth.size, 0);
    assert.equal(Object.keys(f.records.studentIdentities).length, 0);
  }
});

test("leading zeros and punctuation in School IDs remain intact", async () => {
  const f = fixture();
  assert.equal((await f.register({ studentNumber: "0012" })).status, 201);
  assert.equal((await f.register({ studentNumber: "12", email: "second@gmail.com" })).status, 201);
  assert.equal(f.records.users.uid1.studentNumber, "0012");
  assert.equal(f.records.users.uid2.studentNumber, "12");
  assert.notEqual(f.identities.studentIdentityKey("school_id", "0012"), f.identities.studentIdentityKey("school_id", "12"));
  assert.ok(!f.identities.studentIdentityKey("school_id", "01/A").includes("/"));
});

test("a failed transaction cleans up only the new Auth account, not existing student records", async () => {
  const f = fixture(); f.records.users.other = { email: "other@gmail.com", role: "student" }; f.failBeforeCommit();
  assert.equal((await f.register()).status, 500);
  assert.equal(f.auth.size, 0);
  assert.deepEqual(f.records.users.other, { email: "other@gmail.com", role: "student" });
  assert.equal(Object.keys(f.records.studentRegistry).length, 0);
  assert.equal(Object.keys(f.records.studentIdentities).length, 0);
});

test("a lost commit acknowledgement cannot delete an account whose registration succeeded", async () => {
  const f = fixture(); f.failAfterCommit();
  const response = await f.register();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /account was created.*Sign in/i);
  assert.equal(f.auth.size, 1);
  assert.equal(Object.keys(f.records.users).length, 1);
  assert.equal(Object.keys(f.records.studentIdentities).length, 2);
  assert.deepEqual(f.calls.deleted, []);
});

test("failure to create an automatic login token keeps the completed registration", async () => {
  const f = fixture(); f.failToken();
  assert.equal((await f.register()).status, 503);
  assert.equal(f.auth.size, 1);
  assert.equal(Object.keys(f.records.users).length, 1);
  assert.deepEqual(f.calls.deleted, []);
});

test("failure to set claims does not leave duplicate identifier reservations", async () => {
  const f = fixture(); f.failClaims();
  assert.equal((await f.register()).status, 500);
  assert.equal(f.auth.size, 0);
  assert.equal(Object.keys(f.records.studentIdentities).length, 0);
});

test("admin edits reserve a new School ID without releasing the previously used ID", async () => {
  const f = fixture(); await f.register();
  const id = encodeURIComponent("student@gmail.com");
  await f.adminDb.runTransaction((transaction) => f.identities.claimStudentIdentities(transaction, { email: "student@gmail.com", studentNumber: "new-id" }, id, "uid1", true));
  assert.equal(Object.keys(f.records.studentIdentities).length, 3);
  assert.equal((await f.register({ email: "other@gmail.com", studentNumber: "new-id" })).status, 409);
  assert.equal((await f.register({ email: "other@gmail.com" })).status, 409);
});

test("reusing one's own identity reservations is idempotent and cannot change their owner", async () => {
  const f = fixture(); await f.register();
  const id = encodeURIComponent("student@gmail.com");
  const before = structuredClone(f.records.studentIdentities);
  await f.adminDb.runTransaction((transaction) => f.identities.claimStudentIdentities(transaction, { email: "student@gmail.com", studentNumber: "001-AB" }, id, "uid1", true));
  assert.deepEqual(f.records.studentIdentities, before);
  await assert.rejects(f.adminDb.runTransaction((transaction) => f.identities.claimStudentIdentities(transaction, { email: "student@gmail.com", studentNumber: "001-AB" }, id, "attacker", true)), (error) => error.status === 409);
  assert.deepEqual(f.records.studentIdentities, before);
});
