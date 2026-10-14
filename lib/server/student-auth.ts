import "server-only";

import { randomUUID } from "node:crypto";
import type { UpdateRequest } from "firebase-admin/auth";
import { ApiError } from "@/lib/server/require-admin";

export function createStudentAuthEmail() {
  // Firebase owns password storage; the real, reusable email stays in the profile.
  return `${randomUUID()}@students.wbte.invalid`;
}

export function studentLoginUpdates(account: { email?: string; providerData?: Array<{ providerId: string }> }): UpdateRequest {
  const updates: UpdateRequest = {};
  if (!account.email?.endsWith("@students.wbte.invalid")) {
    updates.email = createStudentAuthEmail();
    updates.emailVerified = true;
  }
  if (account.providerData?.some((provider) => provider.providerId === "google.com")) updates.providersToUnlink = ["google.com"];
  return updates;
}

export function validateStudentPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !value.trim()) {
    throw new ApiError(400, "Password must contain 8 to 128 characters.");
  }
  return value;
}

export async function verifyStudentPassword(email: string, password: string, expectedUid: string) {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (emulator ? "demo-api-key" : "");
  if (!apiKey) throw new ApiError(503, "Student sign-in is not configured.");
  const origin = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const response = await fetch(`${origin}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }), cache: "no-store",
  });
  const result = await response.json() as { localId?: string; error?: { message?: string } };
  if (!response.ok) {
    const message = result.error?.message ?? "";
    if (/TOO_MANY_ATTEMPTS|QUOTA_EXCEEDED/.test(message)) throw new ApiError(429, "Too many sign-in attempts. Wait before trying again.");
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED/.test(message)) {
      throw new ApiError(401, "The School ID or password is incorrect.");
    }
    console.warn("Firebase student sign-in is unavailable:", response.status, message);
    throw new ApiError(503, "Student sign-in is temporarily unavailable. Try again later.");
  }
  if (result.localId !== expectedUid) throw new ApiError(401, "The School ID or password is incorrect.");
}
