import { NextResponse } from "next/server";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { synchronizeTeacherAssignments } from "@/lib/server/assignment-sync";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { teacherId?: unknown };
    const teacherId = asString(body.teacherId, "Teacher", 200);
    const result = await synchronizeTeacherAssignments(teacherId);
    if (!result) throw new ApiError(404, "Teacher was not found.");
    const { assignmentsUpdated, studentLinks } = result;

    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "teacher_assignments_synchronized",
      metadata: { teacherId, assignmentsUpdated, studentLinks },
    });
    return NextResponse.json({ ok: true, assignmentsUpdated, studentLinks });
  } catch (error) {
    return apiErrorResponse(error, "Teacher assignments could not be synchronized.");
  }
}
