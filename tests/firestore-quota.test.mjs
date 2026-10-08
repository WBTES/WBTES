import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const quota = loadModule("lib/firebase/firestore-error.ts");
const api = loadModule("lib/server/api-response.ts", {
  "server-only": {}, "@/lib/server/require-admin": { ApiError },
  "@/lib/firebase/firestore-error": quota,
});
const { getAuthErrorMessage } = loadModule("lib/firebase/auth-error.ts", { "./firestore-error": quota });
const client = loadModule("lib/authenticated-fetch.ts", { "@/lib/firebase/client": { auth: {} } });

test("Firestore quota errors are detected across Admin and browser SDK formats", () => {
  for (const code of [8, "8", "RESOURCE_EXHAUSTED", "resource-exhausted", "firestore/resource-exhausted"]) {
    assert.equal(quota.isFirestoreQuotaError({ code }), true);
  }
  assert.equal(quota.isFirestoreQuotaError(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded.")), true);
  for (const error of [null, "quota", { code: "auth/quota-exceeded", message: "Quota exceeded" },
    { code: "permission-denied" }, new Error("The email provider's daily sending limit was reached")]) {
    assert.equal(quota.isFirestoreQuotaError(error), false);
  }
});

test("API quota failures return a service error with an actionable message, not raw gRPC text", async () => {
  const response = api.apiErrorResponse(Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 }), "Failed");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: quota.FIRESTORE_QUOTA_MESSAGE, code: "firestore/resource-exhausted" });
});

test("permission, validation and mail failures keep their original meaning", async () => {
  for (const status of [400, 401, 403, 409, 429]) {
    const response = api.apiErrorResponse(new ApiError(status, "Original message"), "Fallback");
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: "Original message" });
  }
  assert.match(getAuthErrorMessage(new Error("Firebase: auth/invalid-credential"), "Failed"), /incorrect/);
  assert.match(getAuthErrorMessage(new Error("auth/too-many-requests"), "Failed"), /Too many attempts/);
  assert.equal(getAuthErrorMessage(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), "Failed"), quota.FIRESTORE_QUOTA_MESSAGE);
});

test("authenticated responses preserve quota codes and never retry a failed request", async () => {
  const response = api.apiErrorResponse({ code: 8 }, "Failed");
  await assert.rejects(client.readApiResponse(response), (error) =>
    error.code === "firestore/resource-exhausted" && quota.isFirestoreQuotaError(error));
  assert.deepEqual(await client.readApiResponse(Response.json({ count: 12 })), { count: 12 });
});

test("admin login refuses to fabricate or bypass a profile when Firestore is exhausted", async () => {
  let reads = 0;
  const route = loadModule("app/api/auth/session/route.ts", {
    "@/lib/firebase/admin": {
      adminAuth: new Proxy({}, { get() { throw new Error("Must not modify Auth after a quota read failure"); } }),
      adminDb: { collection(name) {
        assert.equal(name, "users");
        return { doc(uid) {
          assert.equal(uid, "admin-id");
          return { async get() { reads++; throw Object.assign(new Error("Quota exceeded"), { code: 8 }); } };
        } };
      } },
    },
    "@/lib/server/api-response": api,
    "@/lib/server/require-admin": { ApiError, requireAuthenticatedUser: async () => ({ uid: "admin-id", email: "admin@example.com" }) },
    "@/lib/email/smtp": {}, "@/lib/server/school-email": {},
    "@/lib/server/verification-email": {}, "@/lib/server/student-identities": {},
  });
  const response = await route.POST(new Request("http://local/api/auth/session", {
    method: "POST", body: JSON.stringify({ method: "password", mode: "login" }),
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "firestore/resource-exhausted");
  assert.equal(reads, 1);
});

function shellFixture() {
  let current = { uid: "admin-id", role: "admin", status: "active", displayName: "Admin", email: "admin@example.com" };
  let pathname = "/dashboard";
  let cursor = 0;
  const slots = [];
  const effects = [];
  const timers = new Map();
  const listeners = new Map();
  const calls = [];
  const messages = [];
  let quotaPath = "";
  let heldPath = "";
  let release;
  const original = { window: globalThis.window, document: globalThis.document, warn: console.warn };
  globalThis.window = {
    setInterval: (callback) => { const id = Symbol(); timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
    addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
  };
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  console.warn = () => {};
  const react = {
    ...require("react"),
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: initial };
      return [slots[i].value, (value) => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(callback, deps) {
      const i = cursor++;
      const previous = slots[i];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
      }
    },
  };
  const router = { push() {} };
  const { AppShell } = loadModule("components/app-shell.tsx", {
    react, "next/link": { default: () => null },
    "next/navigation": { usePathname: () => pathname, useRouter: () => router },
    "next-themes": { useTheme: () => ({ resolvedTheme: "dark", setTheme() {} }) },
    "@/lib/firebase/auth-context": { useAuth: () => ({ user: { uid: current.uid }, profile: current, configured: true, loading: false, signOut() {} }) },
    "@/lib/utils": { cn: (...values) => values.join(" "), formatRoleLabel: (role) => role },
    "react-hot-toast": { default: { error: (message) => messages.push(message) } },
    "firebase/firestore": { collection() {}, query() {}, where() {}, onSnapshot: () => () => {} },
    "@/lib/firebase/client": { db: {} },
    "@/lib/authenticated-fetch": {
      readApiResponse: client.readApiResponse,
      authenticatedFetch: async (path) => {
        calls.push(path);
        if (path === heldPath) await new Promise((resolve) => { release = resolve; });
        return path === quotaPath ? api.apiErrorResponse({ code: 8 }, "Failed") : Response.json({});
      },
    },
    "@/lib/admin-navigation": { ADMIN_NAVIGATION_REFRESH_EVENT: "refresh", requestAdminNavigationRefresh() {} },
    "@/components/brand-mark": { BrandMark: () => null }, "@/lib/firebase/firestore-error": quota,
  });
  return {
    calls, messages,
    render(changes = {}, path = pathname) {
      current = { ...current, ...changes }; pathname = path; cursor = 0;
      AppShell({ children: null }); effects.splice(0).forEach((effect) => effect());
    },
    tick() { [...timers.values()].forEach((callback) => callback()); },
    focus() { listeners.get("focus")?.forEach((callback) => callback()); },
    quota(path) { quotaPath = path; },
    hold(path) { heldPath = path; },
    release() { heldPath = ""; release?.(); },
    cleanup() {
      slots.forEach((slot) => slot?.cleanup?.());
      globalThis.window = original.window; globalThis.document = original.document; console.warn = original.warn;
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("profile updates do not restart maintenance; account status changes still do", async () => {
  const f = shellFixture();
  try {
    f.render(); await settle();
    for (let i = 0; i < 10; i++) { f.render({ updatedAt: i, photoURL: `photo${i}` }); await settle(); }
    assert.equal(f.calls.filter((path) => path === "/api/maintenance/run").length, 1);
    f.render({ status: "disabled" }); await settle(); f.tick(); await settle();
    assert.equal(f.calls.filter((path) => path === "/api/maintenance/run").length, 1);
    f.render({ status: "active" }); await settle();
    assert.equal(f.calls.filter((path) => path === "/api/maintenance/run").length, 2);
  } finally { f.cleanup(); }
});

test("quota failures pause maintenance and navigation through timers, focus and route changes", async () => {
  for (const path of ["/api/maintenance/run", "/api/admin/navigation-status"]) {
    const f = shellFixture();
    try {
      f.quota(path); f.render(); await settle();
      const before = f.calls.length;
      f.tick(); f.focus(); f.render({ updatedAt: 123 }, "/admin/reports"); await settle();
      assert.equal(f.calls.length, before);
      assert.ok(f.messages.includes(quota.FIRESTORE_QUOTA_MESSAGE));
      f.quota(""); f.render({ uid: "other-admin" }); await settle();
      assert.ok(f.calls.length > before, "A new authenticated session can load normally");
    } finally { f.cleanup(); }
  }
});

test("maintenance checks neither overlap nor read while a tab is hidden", async () => {
  const f = shellFixture();
  try {
    document.visibilityState = "hidden"; f.render(); await settle();
    assert.equal(f.calls.length, 0);
    document.visibilityState = "visible";
    f.hold("/api/maintenance/run"); f.tick(); await settle(); f.tick(); await settle();
    assert.equal(f.calls.filter((path) => path === "/api/maintenance/run").length, 1);
    f.release(); await settle();
    f.tick(); await settle();
    assert.equal(f.calls.filter((path) => path === "/api/maintenance/run").length, 2);
  } finally { f.cleanup(); }
});
