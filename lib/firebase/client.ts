// Client-side Firebase initialization
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isConfigured = !!firebaseConfig.apiKey;

export const app: FirebaseApp = isConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : ({} as FirebaseApp);

export const auth: Auth = isConfigured ? getAuth(app) : ({} as Auth);
export const db: Firestore = isConfigured ? getFirestore(app) : ({} as Firestore);
export const storage: FirebaseStorage = isConfigured ? getStorage(app) : ({} as FirebaseStorage);

export const firebaseReady = isConfigured;

/**
 * Secondary Firebase app for actions that would otherwise sign out the
 * current user (e.g. admin creating a new user account). Using a separate
 * `Auth` instance keeps the original session intact.
 */
let secondaryAuth: Auth | null = null;

export function getSecondaryAuth(): Auth {
  if (!isConfigured) throw new Error("Firebase is not configured");
  if (secondaryAuth) return secondaryAuth;
  const existing = getApps().find((a) => a.name === "secondary");
  const secondaryApp: FirebaseApp = existing
    ? existing
    : initializeApp(firebaseConfig, "secondary");
  secondaryAuth = getAuth(secondaryApp);
  return secondaryAuth;
}
