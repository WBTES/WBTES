import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  apiErrorResponse,
  asString,
  emailDocumentId,
  optionalString,
} from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { synchronizeStudentAssignments } from "@/lib/server/assignment-sync";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";
import {
  assertStudentNumberAvailable,
  type StudentRegistrationInput,
  validateStudentRegistration,
} from "@/lib/server/student-registration";

export const runtime = "nodejs";

type StudentStatus = "pending" | "active" | "disabled";

type StudentInput = StudentRegistrationInput & {
  status?: unknown;
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    await migrateLegacyStudents();

    const [registrySnapshot, userSnapshot] = await Promise.all([
      adminDb.collection("studentRegistry").orderBy("displayName").get(),
      adminDb.collection("users").where("role", "==", "student").get(),
    ]);
    const profiles = new Map(
      userSnapshot.docs.map((item) => [item.id, item.data()])
    );
    const claimedUids = registrySnapshot.docs
      .map((item) => String(item.data().claimedUid ?? ""))
      .filter(Boolean);
    const authUsers = await loadAuthUsers(claimedUids);

    const registrations = registrySnapshot.docs.map((item) => {
      const data = item.data();
      const claimedUid = String(data.claimedUid ?? "");
      const profile = claimedUid ? profiles.get(claimedUid) : null;
      const authUser = claimedUid ? authUsers.get(claimedUid) : null;
      return {
        id: item.id,
        ...data,
        claimedUid: claimedUid || null,
        accountCreated: Boolean(profile || authUser),
        emailVerified: Boolean(authUser?.emailVerified),
        lastLoginAt: Number(profile?.lastLoginAt ?? 0),
        orphaned: Boolean(claimedUid && !profile && !authUser),
      };
    });
    return NextResponse.json({ registrations });
  } catch (error) {
    return apiErrorResponse(error, "Student records could not be loaded.");
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as StudentInput & { id?: unknown };
    const id = asString(body.id, "Student record", 500);
    const existingRef = adminDb.collection("studentRegistry").doc(id);
    const existing = await existingRef.get();
    if (!existing.exists) {
      throw new ApiError(404, "Student record was not found.");
    }

    const existingData = existing.data()!;
    const previousStatus = normalizeStatus(existingData.status);
    const status = normalizeStatus(body.status);
    if (status === "pending" && previousStatus !== "pending") {
      throw new ApiError(409, "An active account cannot be returned to pending activation.");
    }
    if (previousStatus === "pending" && status === "active") {
      throw new ApiError(
        409,
        "Legacy student accounts become active automatically at their next sign-in."
      );
    }

    const registration = await validateStudentRegistration({
      ...body,
      email: existingData.email,
    });
    if (registration.studentNumber) {
      await assertStudentNumberAvailable(registration.studentNumber, id);
    }
    const claimedUid = optionalString(existingData.claimedUid, 200);
    if (!claimedUid && status === "active") {
      throw new ApiError(
        409,
        "This legacy student record has no login account. Ask the student to self-register."
      );
    }

    const now = Date.now();
    const batch = adminDb.batch();
    batch.update(existingRef, {
      ...registration,
      status,
      updatedAt: now,
    });
    if (claimedUid) {
      batch.set(adminDb.collection("users").doc(claimedUid), {
        ...registration,
        role: "student",
        status,
        updatedAt: now,
      }, { merge: true });
    }
    await batch.commit();

    if (claimedUid) {
      await adminAuth.updateUser(claimedUid, {
        displayName: registration.displayName,
        disabled: status === "disabled",
      });
      await adminAuth.setCustomUserClaims(claimedUid, {
        role: "student",
        status,
        departmentId: registration.departmentId,
      });
      if (status === "disabled") {
        await adminAuth.revokeRefreshTokens(claimedUid);
      }
      await synchronizeStudentAssignments({
        uid: claimedUid,
        ...registration,
        role: "student",
        status,
      });
    }

    const action = status === "active" && previousStatus === "disabled"
        ? "student_reactivated"
        : status === "disabled"
          ? "student_deactivated"
          : "student_updated";
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action,
      metadata: {
        studentEmail: registration.email,
        previousStatus,
        status,
      },
    });
    return NextResponse.json({
      ok: true,
      status,
    });
  } catch (error) {
    return apiErrorResponse(error, "Student update failed.");
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const id = asString(
      new URL(request.url).searchParams.get("id"),
      "Student record",
      500
    );
    const registryRef = adminDb.collection("studentRegistry").doc(id);
    const registry = await registryRef.get();
    if (!registry.exists) {
      throw new ApiError(404, "Student record was not found.");
    }
    const claimedUid = optionalString(registry.data()?.claimedUid, 200);
    const email = String(registry.data()?.email ?? "");

    if (claimedUid) {
      try {
        await adminAuth.deleteUser(claimedUid);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found") {
          throw error;
        }
      }
      const [assignments, completions] = await Promise.all([
        adminDb
          .collection("teacherAssignments")
          .where("studentIds", "array-contains", claimedUid)
          .get(),
        adminDb
          .collection("evaluationCompletions")
          .where("studentId", "==", claimedUid)
          .get(),
      ]);
      const writer = adminDb.bulkWriter();
      writer.delete(adminDb.collection("users").doc(claimedUid));
      assignments.docs.forEach((assignment) => {
        writer.update(assignment.ref, {
          studentIds: FieldValue.arrayRemove(claimedUid),
          updatedAt: Date.now(),
        });
      });
      completions.docs.forEach((completion) => writer.delete(completion.ref));
      await writer.close();
    }
    await registryRef.delete();
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "student_deleted",
      metadata: {
        studentEmail: email,
        accountDeleted: Boolean(claimedUid),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Student deletion failed.");
  }
}

async function loadAuthUsers(uids: string[]) {
  const users = new Map<
    string,
    Awaited<ReturnType<typeof adminAuth.getUser>>
  >();
  const uniqueUids = [...new Set(uids)];
  for (let index = 0; index < uniqueUids.length; index += 100) {
    const result = await adminAuth.getUsers(
      uniqueUids.slice(index, index + 100).map((uid) => ({ uid }))
    );
    result.users.forEach((user) => users.set(user.uid, user));
  }
  return users;
}

function normalizeStatus(value: unknown): StudentStatus {
  if (value === "pending" || value === "disabled") return value;
  return "active";
}

async function migrateLegacyStudents() {
  const students = await adminDb
    .collection("users")
    .where("role", "==", "student")
    .get();
  const writer = adminDb.bulkWriter();
  for (const student of students.docs) {
    const data = student.data();
    if (!data.email || !data.programId || !data.departmentId) continue;
    const email = String(data.email).trim().toLowerCase();
    const reference = adminDb
      .collection("studentRegistry")
      .doc(emailDocumentId(email));
    writer.set(reference, {
      email,
      emailNormalized: email,
      displayName: String(data.displayName ?? email),
      studentNumber: String(data.studentNumber ?? ""),
      studentNumberNormalized: String(data.studentNumber ?? "").trim().toLowerCase(),
      programId: String(data.programId),
      departmentId: String(data.departmentId),
      course: String(data.course ?? ""),
      yearLevel: String(data.yearLevel ?? ""),
      section: String(data.section ?? ""),
      status: normalizeStatus(data.status),
      claimedUid: student.id,
      createdAt: Number(data.createdAt ?? Date.now()),
      updatedAt: Date.now(),
    }, { merge: true });
  }
  await writer.close();
}
