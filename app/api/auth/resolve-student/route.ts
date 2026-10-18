import { NextResponse } from "next/server";
import { adminAuth, adminDb, adminReady } from "@/lib/firebase/admin";
import { apiErrorResponse } from "@/lib/server/api-response";
import { ApiError } from "@/lib/server/require-admin";
import { studentIdentityKey } from "@/lib/server/student-identities";
import { studentLoginUpdates, verifyStudentPassword } from "@/lib/server/student-auth";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  try {
    if (!adminReady) throw new ApiError(503, "Student sign-in is not configured.");
    const body = await request.json() as { schoolId?: unknown; password?: unknown };
    const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
    if (!schoolId || schoolId.length > 100 || /[\x00-\x1f\x7f]/.test(schoolId)) {
      throw new ApiError(400, "Enter a valid School ID.");
    }
    if (typeof body.password !== "string" || !body.password || body.password.length > 128) {
      throw new ApiError(401, "The School ID or password is incorrect.");
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const normalized = schoolId.toLowerCase();
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const limits = [{ key: `ip:${ip}`, maximum: 300 }, { key: `school:${ip}:${normalized}`, maximum: 10 }];
    if (limits.some(({ key, maximum }) => (attempts.get(key)?.count ?? 0) >= maximum)) {
      throw new ApiError(429, "Too many sign-in attempts. Wait before trying again.");
    }
    for (const { key } of limits) {
      const attempt = attempts.get(key) ?? { count: 0, until: now + 60_000 };
      attempt.count++; attempts.set(key, attempt);
    }
    const identity = await adminDb.collection("studentIdentities").doc(studentIdentityKey("school_id", normalized)).get();
    const uid = String(identity.data()?.claimedUid ?? "");
    let matches;
    if (uid) {
      const profile = await adminDb.collection("users").doc(uid).get();
      matches = profile.exists ? [profile] : [];
    } else {
      const [current, legacy] = await Promise.all([
        adminDb.collection("users").where("studentNumberNormalized", "==", normalized).limit(2).get(),
        adminDb.collection("users").where("studentNumber", "==", schoolId).limit(2).get(),
      ]);
      matches = [...new Map([...current.docs, ...legacy.docs].map((item) => [item.id, item])).values()];
    }
    const students = matches.filter((item) => item.data()?.role === "student"
      && String(item.data()?.studentNumber ?? "").trim().toLowerCase() === normalized);
    if (students.length !== 1 || students[0].data()?.status === "disabled") {
      throw new ApiError(401, "The School ID or password is incorrect.");
    }
    const account = await adminAuth.getUser(students[0].id);
    if (account.disabled || !account.email) throw new ApiError(401, "The School ID or password is incorrect.");
    await verifyStudentPassword(account.email, body.password, account.uid);
    const updates = studentLoginUpdates(account);
    if (Object.keys(updates).length) {
      // Preserve the legacy UID and password while removing shared-inbox recovery.
      await adminAuth.updateUser(account.uid, updates);
    }
    const customToken = await adminAuth.createCustomToken(account.uid);
    return NextResponse.json({ customToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      return apiErrorResponse(new ApiError(401, "The School ID or password is incorrect."), "Student sign-in failed.");
    }
    return apiErrorResponse(error, "Student sign-in failed.");
  }
}
