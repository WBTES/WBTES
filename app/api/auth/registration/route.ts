import { NextResponse } from "next/server";
import { adminAuth, adminDb, adminReady } from "@/lib/firebase/admin";
import { apiErrorResponse, asString, emailDocumentId, optionalString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { synchronizeStudentAssignments } from "@/lib/server/assignment-sync";
import { ApiError } from "@/lib/server/require-admin";
import { claimStudentIdentities, EMAIL_ALREADY_REGISTERED, studentIdentityKey } from "@/lib/server/student-identities";
import { assertStudentNumberAvailable, type StudentRegistrationInput, validateStudentRegistration } from "@/lib/server/student-registration";

export const runtime = "nodejs";
const attempts = new Map<string, number[]>();
type RegistrationBody = StudentRegistrationInput & { password?: unknown; website?: unknown };

export async function POST(request: Request) {
  let createdUid = "";
  let registryId = "";
  let registrationCommitted = false;
  try {
    if (!adminReady) throw new ApiError(503, "Student registration is not configured yet.");
    const body = await request.json() as RegistrationBody;
    if (optionalString(body.website, 200)) return NextResponse.json({ ok: true }, { status: 201 });
    const registration = await validateStudentRegistration(body, { requireStudentNumber: true });
    enforceRateLimit(request, registration.email);
    const password = asString(body.password, "Password", 128);
    if (password.length < 8) throw new ApiError(400, "Password must contain at least 8 characters.");

    registryId = emailDocumentId(registration.email);
    const registryRef = adminDb.collection("studentRegistry").doc(registryId);
    const [existingRegistry, emailIdentity] = await Promise.all([
      registryRef.get(),
      adminDb.collection("studentIdentities").doc(studentIdentityKey("email", registration.email)).get(),
    ]);
    if (existingRegistry.exists || emailIdentity.exists) throw new ApiError(409, EMAIL_ALREADY_REGISTERED);
    await assertStudentNumberAvailable(registration.studentNumber);
    try {
      await adminAuth.getUserByEmail(registration.email);
      throw new ApiError(409, EMAIL_ALREADY_REGISTERED);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    }

    const account = await adminAuth.createUser({
      email: registration.email,
      password,
      displayName: registration.displayName,
      disabled: false,
      emailVerified: true,
    });
    createdUid = account.uid;
    await adminAuth.setCustomUserClaims(account.uid, {
      role: "student", status: "active", departmentId: registration.departmentId,
    });
    await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(registryRef);
      if (existing.exists) throw new ApiError(409, EMAIL_ALREADY_REGISTERED);
      await claimStudentIdentities(transaction, registration, registryId, account.uid);
      const now = Date.now();
      transaction.create(registryRef, {
        ...registration, status: "active", claimedUid: account.uid,
        registrationSource: "self_service", createdAt: now, updatedAt: now,
      });
      transaction.create(adminDb.collection("users").doc(account.uid), {
        ...registration, role: "student", status: "active", photoURL: null,
        emailVerified: true, createdAt: now, updatedAt: now,
      });
    });
    registrationCommitted = true;
    const customToken = await adminAuth.createCustomToken(account.uid);
    let assignmentsAdded = 0;
    let warning: string | undefined;
    try {
      const sync = await synchronizeStudentAssignments({ uid: account.uid, ...registration, role: "student", status: "active" });
      assignmentsAdded = sync.assignmentsAdded;
    } catch (error) {
      console.warn("Student registration assignment sync failed:", error);
      warning = "Your account was created, but evaluation assignments could not be linked. Contact an administrator.";
    }
    try {
      await writeAuditLog({
        userId: account.uid, userEmail: registration.email, userRole: "student",
        action: "student_registration_created",
        metadata: { programId: registration.programId, yearLevel: registration.yearLevel, activation: "automatic", assignmentsAdded },
        ipAddress: clientIp(request),
      });
    } catch (error) {
      console.warn("Student registration audit log failed:", error);
    }
    return NextResponse.json({ ok: true, status: "active", emailVerified: true, customToken, ...(warning ? { warning } : {}) }, { status: 201 });
  } catch (error) {
    if (createdUid && !registrationCommitted) {
      try {
        // A transaction may commit even if its network acknowledgement is lost.
        const registry = await adminDb.collection("studentRegistry").doc(registryId).get();
        registrationCommitted = registry.exists && registry.data()?.claimedUid === createdUid;
        if (!registrationCommitted) await adminAuth.deleteUser(createdUid);
      } catch (cleanupError) {
        console.warn("Student registration cleanup could not be confirmed:", cleanupError);
      }
    }
    if (registrationCommitted) return apiErrorResponse(new ApiError(503,
      "Your account was created, but automatic sign-in could not finish. Sign in using your email and password."
    ), "Automatic sign-in failed.");
    if ((error as { code?: string }).code === "auth/email-already-exists") {
      return apiErrorResponse(new ApiError(409, EMAIL_ALREADY_REGISTERED), EMAIL_ALREADY_REGISTERED);
    }
    return apiErrorResponse(error, "Student registration failed.");
  }
}

function enforceRateLimit(request: Request, email: string) {
  const now = Date.now();
  const limits = [
    { key: `ip:${clientIp(request)}`, maximum: 10, window: 60 * 60 * 1000 },
    { key: `email:${email}`, maximum: 3, window: 24 * 60 * 60 * 1000 },
  ];
  if (limits.some((limit) => (attempts.get(limit.key) ?? []).filter((timestamp) => now - timestamp < limit.window).length >= limit.maximum)) {
    throw new ApiError(429, "Too many registration attempts. Please try again later.");
  }
  limits.forEach((limit) => {
    const recent = (attempts.get(limit.key) ?? []).filter((timestamp) => now - timestamp < limit.window);
    recent.push(now);
    attempts.set(limit.key, recent);
  });
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
