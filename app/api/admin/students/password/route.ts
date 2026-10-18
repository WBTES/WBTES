import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";
import { studentLoginUpdates, validateStudentPassword } from "@/lib/server/student-auth";
import { writeAuditLog } from "@/lib/server/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { id?: unknown; password?: unknown };
    const id = asString(body.id, "Student record", 500);
    const password = validateStudentPassword(body.password);
    const registry = await adminDb.collection("studentRegistry").doc(id).get();
    const uid = String(registry.data()?.claimedUid ?? "");
    if (!registry.exists || !uid) throw new ApiError(404, "This student record has no login account.");
    const profile = await adminDb.collection("users").doc(uid).get();
    if (!profile.exists || profile.data()?.role !== "student") {
      throw new ApiError(403, "Only a student's password can be reset with this action.");
    }
    if (profile.data()?.status === "disabled" || registry.data()?.status === "disabled") {
      throw new ApiError(409, "Reactivate this student before resetting their password.");
    }
    const account = await adminAuth.getUser(uid);
    await adminAuth.updateUser(uid, {
      password,
      ...studentLoginUpdates(account),
    });
    await adminAuth.revokeRefreshTokens(uid);
    await writeAuditLog({
      userId: admin.uid, userEmail: admin.email, userRole: "admin",
      action: "student_password_reset", metadata: { studentUid: uid, schoolId: String(profile.data()?.studentNumber ?? "") },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Student password could not be reset.");
  }
}
