// Server-side Firebase Admin SDK (for API routes and Cloud Functions)
import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function formatPrivateKey() {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!key) return undefined;
  return key.replace(/\\n/g, "\n").replace(/^"|"$/g, "");
}

const hasAdminCreds =
  !!process.env.FIREBASE_ADMIN_PROJECT_ID &&
  !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
  !!formatPrivateKey();

const adminApp: App = hasAdminCreds
  ? getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
          privateKey: formatPrivateKey()!,
        }),
      })
  : ({} as App);

export const adminAuth: Auth = hasAdminCreds ? getAuth(adminApp) : ({} as Auth);
export const adminDb: Firestore = hasAdminCreds ? getFirestore(adminApp) : ({} as Firestore);

export const adminReady = hasAdminCreds;
