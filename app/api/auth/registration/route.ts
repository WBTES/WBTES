import { NextResponse } from "next/server";
import { adminAuth, adminDb, adminReady } from "@/lib/firebase/admin";
import { apiErrorResponse, optionalString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { synchronizeStudentAssignments } from "@/lib/server/assignment-sync";
import { ApiError } from "@/lib/server/require-admin";
import { claimStudentIdentities } from "@/lib/server/student-identities";
import { createStudentAuthEmail, validateStudentPassword } from "@/lib/server/student-auth";
import { studentRegistryId } from "@/lib/server/student-registry";
import {
  assertStudentNumberAvailable,
  type StudentRegistrationInput,
  validateStudentRegistration,
} from "@/lib/server/student-registration";

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
    enforceRateLimit(request, typeof body.studentNumber === "string" ? body.studentNumber.trim().toLowerCase() : "");
    const registration = await validateStudentRegistration(body, { requireStudentNumber: true });
    const password = validateStudentPassword(body.password);
    await assertStudentNumberAvailable(registration.studentNumber);

    const account = await adminAuth.createUser({
      email: createStudentAuthEmail(), password, displayName: registration.displayName,
      disabled: false, emailVerified: true,
    });
    createdUid = account.uid;
    registryId = studentRegistryId(account.uid);
    await adminAuth.setCustomUserClaims(account.uid, {
      role: "student", status: "active", departmentId: registration.departmentId,
    });
    const now = Date.now();
    await adminDb.runTransaction(async (transaction) => {
      await claimStudentIdentities(transaction, registration, registryId, account.uid);
      transaction.create(adminDb.collection("studentRegistry").doc(registryId), {
        ...registration, status: "active", claimedUid: account.uid,
        registrationSource: "self_service", createdAt: now, updatedAt: now,
      });
      transaction.create(adminDb.collection("users").doc(account.uid), {
        ...registration, role: "student", status: "active", photoURL: null,
        studentRegistryId: registryId, studentLogin: "school_id", emailVerified: true,
        createdAt: now, updatedAt: now,
      });
    });
    registrationCommitted = true;
    const assignmentSync = await synchronizeStudentAssignments({
      uid: account.uid, ...registration, role: "student", status: "active",
    });
    const customToken = await adminAuth.createCustomToken(account.uid);
    await writeAuditLog({
      userId: account.uid, userEmail: registration.email, userRole: "student",
      action: "student_registration_created",
      metadata: { programId: registration.programId, yearLevel: registration.yearLevel,
        activation: "automatic", assignmentsAdded: assignmentSync.assignmentsAdded },
      ipAddress: clientIp(request),
    });
    return NextResponse.json({ ok: true, status: "active", emailVerified: true, customToken }, { status: 201 });
  } catch (error) {
    if (createdUid && !registrationCommitted) {
      // A lost commit acknowledgement must not delete a successfully registered account.
      try {
        const saved = await adminDb.collection("studentRegistry").doc(registryId).get();
        if (saved.data()?.claimedUid === createdUid) registrationCommitted = true;
        else await adminAuth.deleteUser(createdUid);
      } catch (cleanupError) {
        console.warn("Student registration cleanup could not be confirmed:", cleanupError);
      }
    }
    if (registrationCommitted) {
      return apiErrorResponse(new ApiError(503,
        "Your account was created. Sign in with your School ID and password."), "Student sign-in is temporarily unavailable.");
    }
    return apiErrorResponse(error, "Student registration failed. If your account was created, sign in with your School ID and password.");
  }
}

function enforceRateLimit(request: Request, schoolId: string) {
  const now = Date.now();
  const limits = [
    { key: `ip:${clientIp(request)}`, maximum: 200, window: 60 * 60 * 1000 },
    { key: `school:${schoolId}`, maximum: 3, window: 24 * 60 * 60 * 1000 },
  ];
  for (const [key, timestamps] of attempts) {
    const recent = timestamps.filter((timestamp) => now - timestamp < 24 * 60 * 60 * 1000);
    if (recent.length) attempts.set(key, recent); else attempts.delete(key);
  }
  if (limits.some((limit) => (attempts.get(limit.key) ?? [])
    .filter((timestamp) => now - timestamp < limit.window).length >= limit.maximum)) {
    throw new ApiError(429, "Too many registration attempts. Please try again later.");
  }
  for (const limit of limits) {
    const recent = (attempts.get(limit.key) ?? []).filter((timestamp) => now - timestamp < limit.window);
    recent.push(now); attempts.set(limit.key, recent);
  }
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip") || "local";
}
