import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const projectId = required("FIREBASE_ADMIN_PROJECT_ID");
const app = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId,
    clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
    privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
  }),
});
const db = getFirestore(app);
const auth = getAuth(app);
const marker = db.collection("systemState").doc("legacyHrRoleMigrationV1");
if ((await marker.get()).exists) {
  console.log("Legacy HR migration was already completed; no changes made.");
  process.exit(0);
}
const legacyUsers = await db.collection("users").where("role", "==", "department_head").get();

for (const userDocument of legacyUsers.docs) {
  const profile = userDocument.data();
  const departmentId = typeof profile.departmentId === "string" ? profile.departmentId : "";
  const batch = db.batch();
  batch.update(userDocument.ref, { role: "hr", updatedAt: Date.now() });
  if (departmentId) {
    const departmentRef = db.collection("departments").doc(departmentId);
    const department = await departmentRef.get();
    if (department.exists && department.data()?.headId === userDocument.id) {
      batch.update(departmentRef, { hrId: userDocument.id, headId: null, updatedAt: Date.now() });
    }
  }
  await batch.commit();
  const authUser = await auth.getUser(userDocument.id);
  await auth.setCustomUserClaims(userDocument.id, {
    ...(authUser.customClaims ?? {}),
    role: "hr",
    status: profile.status ?? "active",
    departmentId: departmentId || null,
  });
  console.log(`Migrated ${profile.email ?? userDocument.id} to HR.`);
}

await marker.set({ completedAt: Date.now(), migratedAccounts: legacyUsers.size });
console.log(`Migration complete: ${legacyUsers.size} account(s). Existing sessions must sign in again.`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
