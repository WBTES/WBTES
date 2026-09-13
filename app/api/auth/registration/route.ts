import { NextResponse } from "next/server";
import { adminAuth, adminDb, adminReady } from "@/lib/firebase/admin";
import {
  apiErrorResponse,
  asString,
  emailDocumentId,
  optionalString,
} from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { synchronizeStudentAssignments } from "@/lib/server/assignment-sync";
import { ApiError } from "@/lib/server/require-admin";
import {
  assertStudentNumberAvailable,
  type StudentRegistrationInput,
  validateStudentRegistration,
} from "@/lib/server/student-registration";

export const runtime = "nodejs";

const attempts = new Map<string, number[]>();

type RegistrationBody = StudentRegistrationInput & {
  password?: unknown;
  website?: unknown;
};

export async function POST(request: Request) {
  let createdUid = "";
  let registryId = "";
  let registrationCommitted = false;
  let authUserCreated = false;

  try {
    if (!adminReady) {
      throw new ApiError(503, "Student registration is not configured yet.");
    }

    const body = await request.json() as RegistrationBody;
    if (optionalString(body.website, 200)) {
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const registration = await validateStudentRegistration(body, {
      requireStudentNumber: true,
    });
    enforceRateLimit(request, registration.email);

    const password = asString(body.password, "Password", 128);
    if (password.length < 8) {
      throw new ApiError(400, "Password must contain at least 8 characters.");
    }

    registryId = emailDocumentId(registration.email);
    const registryRef = adminDb.collection("studentRegistry").doc(registryId);
    const existingRegistry = await registryRef.get();
    if (existingRegistry.exists) {
      const status = String(existingRegistry.data()?.status ?? "active");
      const recovered = status === "pending"
        && await removeOrphanedPendingRegistration(
          registryRef,
          existingRegistry.data()?.claimedUid
        );
      if (status === "pending" && !recovered) {
        throw new ApiError(
          409,
          "A registration for this email already exists. Sign in to activate it."
        );
      }
      if (status !== "pending") {
        throw new ApiError(
          409,
          "This student email is already registered. Sign in or contact an administrator."
        );
      }
    }
    await assertStudentNumberAvailable(registration.studentNumber, registryId);

    let account: Awaited<ReturnType<typeof adminAuth.getUserByEmail>> | null = null;
    try {
      account = await adminAuth.getUserByEmail(registration.email);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") {
        throw error;
      }
    }

    if (account) {
      const existingProfile = await adminDb
        .collection("users")
        .doc(account.uid)
        .get();
      if (existingProfile.exists) {
        throw new ApiError(
          409,
          "An account already uses this email. Sign in or reset its password."
        );
      }
      account = await adminAuth.updateUser(account.uid, {
        password,
        displayName: registration.displayName,
        disabled: false,
        emailVerified: true,
      });
    } else {
      account = await adminAuth.createUser({
        email: registration.email,
        password,
        displayName: registration.displayName,
        disabled: false,
        emailVerified: true,
      });
      authUserCreated = true;
    }
    createdUid = account.uid;

    const now = Date.now();
    const batch = adminDb.batch();
    batch.create(registryRef, {
      ...registration,
      status: "active",
      claimedUid: account.uid,
      registrationSource: "self_service",
      createdAt: now,
      updatedAt: now,
    });
    batch.create(adminDb.collection("users").doc(account.uid), {
      ...registration,
      role: "student",
      status: "active",
      photoURL: null,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();
    await adminAuth.setCustomUserClaims(account.uid, {
      role: "student",
      status: "active",
      departmentId: registration.departmentId,
    });
    registrationCommitted = true;
    const assignmentSync = await synchronizeStudentAssignments({
      uid: account.uid,
      ...registration,
      role: "student",
      status: "active",
    });
    const customToken = await adminAuth.createCustomToken(account.uid);
    await writeAuditLog({
      userId: account.uid,
      userEmail: registration.email,
      userRole: "student",
      action: "student_registration_created",
      metadata: {
        programId: registration.programId,
        yearLevel: registration.yearLevel,
        activation: "automatic",
        assignmentsAdded: assignmentSync.assignmentsAdded,
      },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({
      ok: true,
      status: "active",
      emailVerified: true,
      customToken,
    }, { status: 201 });
  } catch (error) {
    if (
      createdUid
      && !registrationCommitted
    ) {
      await Promise.allSettled([
        authUserCreated
          ? adminAuth.deleteUser(createdUid)
          : Promise.resolve(),
        adminDb.collection("users").doc(createdUid).delete(),
        registryId
          ? adminDb.collection("studentRegistry").doc(registryId).delete()
          : Promise.resolve(),
      ]);
    }
    return apiErrorResponse(error, "Student registration failed.");
  }
}

async function removeOrphanedPendingRegistration(
  registryRef: FirebaseFirestore.DocumentReference,
  claimedUidValue: unknown
) {
  const claimedUid = optionalString(claimedUidValue, 200);
  if (claimedUid) {
    try {
      await adminAuth.getUser(claimedUid);
      return false;
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") {
        throw error;
      }
    }
  }

  const batch = adminDb.batch();
  batch.delete(registryRef);
  if (claimedUid) {
    batch.delete(adminDb.collection("users").doc(claimedUid));
  }
  await batch.commit();
  return true;
}

function enforceRateLimit(request: Request, email: string) {
  const now = Date.now();
  const limits = [
    {
      key: `ip:${clientIp(request)}`,
      maximum: 10,
      window: 60 * 60 * 1000,
    },
    {
      key: `email:${email}`,
      maximum: 3,
      window: 24 * 60 * 60 * 1000,
    },
  ];
  if (limits.some((limit) =>
    (attempts.get(limit.key) ?? []).filter(
      (timestamp) => now - timestamp < limit.window
    ).length >= limit.maximum
  )) {
    throw new ApiError(
      429,
      "Too many registration attempts. Please try again later."
    );
  }
  limits.forEach((limit) => {
    const recent = (attempts.get(limit.key) ?? []).filter(
      (timestamp) => now - timestamp < limit.window
    );
    recent.push(now);
    attempts.set(limit.key, recent);
  });
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}
