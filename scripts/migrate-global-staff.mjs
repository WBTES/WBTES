import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const projectId = required("FIREBASE_ADMIN_PROJECT_ID");
const app = getApps()[0] ?? initializeApp({ credential: cert({
  projectId,
  clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
  privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
}) });
const db = getFirestore(app);
const auth = getAuth(app);
const users = await db.collection("users").get();
const staff = users.docs.filter((item) => ["hr", "department_head"].includes(item.data().role));

for (const item of staff) {
  const profile = item.data();
  await item.ref.set({ departmentId: FieldValue.delete(), updatedAt: Date.now() }, { merge: true });
  const user = await auth.getUser(item.id);
  await auth.setCustomUserClaims(item.id, {
    ...(user.customClaims ?? {}),
    role: profile.role,
    status: profile.status ?? "active",
    departmentId: null,
  });
}

const departments = await db.collection("departments").get();
for (let offset = 0; offset < departments.size; offset += 450) {
  const batch = db.batch();
  departments.docs.slice(offset, offset + 450).forEach((item) => batch.set(item.ref, {
    hrId: FieldValue.delete(),
    headId: FieldValue.delete(),
    updatedAt: Date.now(),
  }, { merge: true }));
  await batch.commit();
}
console.log(`Converted ${staff.length} staff account(s) to school-wide access.`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
