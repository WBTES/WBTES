"use client";

import * as React from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, firebaseReady } from "@/lib/firebase/client";
import type { AppUser } from "@/lib/types";

type AuthContextValue = {
  user: FirebaseUser | null;
  profile: AppUser | null;
  loading: boolean;
  configured: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeStudentRegistration: (customToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<FirebaseUser | null>(null);
  const [profile, setProfile] = React.useState<AppUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const interactiveAuth = React.useRef(false);

  const verifyServerSession = React.useCallback(async (
    currentUser: FirebaseUser,
    options: {
      method: "password" | "google" | "resume";
      mode?: "login" | "claim";
      eventId?: string;
    }
  ) => {
    const token = await currentUser.getIdToken(true);
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    });
    const data = await response.json() as { profile?: AppUser; error?: string };
    if (!response.ok || !data.profile) {
      throw new Error(data.error ?? "Account verification failed.");
    }
    if (
      (data.profile.role === "student" || data.profile.role === "admin")
      && !currentUser.emailVerified
    ) {
      await currentUser.reload();
      await currentUser.getIdToken(true);
    }
    setUser(currentUser);
    setProfile(data.profile);
    return data.profile;
  }, []);

  React.useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      if (interactiveAuth.current) return;
      try {
        await verifyServerSession(currentUser, { method: "resume" });
      } catch (error) {
        console.warn("Session validation failed:", error);
        await firebaseSignOut(auth);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [verifyServerSession]);

  React.useEffect(() => {
    if (!firebaseReady || !user) return;
    const reference = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      reference,
      async (snapshot) => {
        if (!snapshot.exists()) {
          setProfile(null);
          return;
        }
        const next = {
          uid: user.uid,
          ...(snapshot.data() as Omit<AppUser, "uid">),
        };
        if (next.status === "disabled") {
          await firebaseSignOut(auth);
          setProfile(null);
          return;
        }
        setProfile(next);
      },
      (error) => console.warn("Profile subscription failed:", error.message)
    );
    return () => unsubscribe();
  }, [user]);

  const signIn = React.useCallback(async (
    identifier: string,
    password: string
  ) => {
    interactiveAuth.current = true;
    try {
      const email = await resolveLoginIdentifier(identifier);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await verifyServerSession(credential.user, {
        method: "password",
        mode: "login",
        eventId: crypto.randomUUID(),
      });
    } catch (error) {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
      throw error;
    } finally {
      interactiveAuth.current = false;
    }
  }, [verifyServerSession]);

  const signInWithGoogle = React.useCallback(async () => {
    interactiveAuth.current = true;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const credential = await signInWithPopup(auth, provider);
      await verifyServerSession(credential.user, {
        method: "google",
        mode: "login",
        eventId: crypto.randomUUID(),
      });
    } catch (error) {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
      throw error;
    } finally {
      interactiveAuth.current = false;
    }
  }, [verifyServerSession]);

  const completeStudentRegistration = React.useCallback(async (customToken: string) => {
    interactiveAuth.current = true;
    try {
      const credential = await signInWithCustomToken(auth, customToken);
      await verifyServerSession(credential.user, {
        method: "password",
        mode: "login",
        eventId: crypto.randomUUID(),
      });
    } catch (error) {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
      throw error;
    } finally {
      interactiveAuth.current = false;
    }
  }, [verifyServerSession]);

  const signOut = React.useCallback(async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error ?? "Password reset failed. Please try again later.");
    }
  }, []);

  const resendVerification = React.useCallback(async () => {
    if (!auth.currentUser) throw new Error("Sign in before requesting another verification email.");
    const hostname = window.location.hostname.toLowerCase();
    const isLoopback = hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname.endsWith(".localhost");
    await sendEmailVerification(
      auth.currentUser,
      isLoopback
        ? undefined
        : { url: `${window.location.origin}/login?verified=1` }
    );
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (!auth.currentUser) return;
    await verifyServerSession(auth.currentUser, { method: "resume" });
  }, [verifyServerSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        configured: firebaseReady,
        signIn,
        signInWithGoogle,
        completeStudentRegistration,
        signOut,
        resetPassword,
        resendVerification,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

async function resolveLoginIdentifier(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (value.includes("@")) return value;
  const response = await fetch(
    `/api/auth/resolve-username?username=${encodeURIComponent(value)}`
  );
  const data = await response.json() as { email?: string; error?: string };
  if (!response.ok || !data.email) {
    throw new Error(data.error ?? "Username was not found.");
  }
  return data.email;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider />");
  }
  return context;
}
