import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";
import type { Subject, Teacher, TeacherAssignment } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as {
      assignmentId?: unknown;
      subjectId?: unknown;
    };
    const assignmentId = asString(body.assignmentId, "Assignment", 200);
    const subjectId = asString(body.subjectId, "Subject", 200);
    const assignmentRef = adminDb.collection("teacherAssignments").doc(assignmentId);
    const assignmentSnapshot = await assignmentRef.get();
    if (!assignmentSnapshot.exists) throw new ApiError(404, "Assignment was not found.");

    const assignment = assignmentSnapshot.data() as TeacherAssignment;
    if (assignment.subjectId === subjectId) {
      return NextResponse.json({ ok: true, recordsUpdated: 0 });
    }

    const [teacherSnapshot, subjectSnapshot, teacherAssignments] = await Promise.all([
      adminDb.collection("teachers").doc(assignment.teacherId).get(),
      adminDb.collection("subjects").doc(subjectId).get(),
      adminDb.collection("teacherAssignments").where("teacherId", "==", assignment.teacherId).get(),
    ]);
    if (!teacherSnapshot.exists) throw new ApiError(409, "The assigned teacher no longer exists.");
    if (!subjectSnapshot.exists) throw new ApiError(400, "Select an existing subject.");

    const teacher = { id: teacherSnapshot.id, ...teacherSnapshot.data() } as Teacher;
    const subject = { id: subjectSnapshot.id, ...subjectSnapshot.data() } as Subject;
    if (teacher.departmentId !== subject.departmentId || !teacher.subjectIds?.includes(subject.id)) {
      throw new ApiError(400, "The selected subject is not assigned to this teacher.");
    }

    const duplicate = teacherAssignments.docs.some((document) => {
      if (document.id === assignmentId) return false;
      const existing = document.data() as TeacherAssignment;
      return existing.subjectId === subjectId && existing.periodId === assignment.periodId;
    });
    if (duplicate) {
      throw new ApiError(409, "This teacher and subject already have an assignment in this evaluation period.");
    }

    const [evaluations, completions, teacherReports] = await Promise.all([
      adminDb.collection("evaluations").where("assignmentId", "==", assignmentId).get(),
      adminDb.collection("evaluationCompletions").where("assignmentId", "==", assignmentId).get(),
      adminDb.collection("performanceReports").where("teacherId", "==", assignment.teacherId).get(),
    ]);
    const reports = teacherReports.docs.filter((document) => {
      const report = document.data();
      return report.periodId === assignment.periodId && report.subjectId === assignment.subjectId;
    });

    const writer = adminDb.bulkWriter();
    writer.update(assignmentRef, {
      subjectId,
      departmentId: subject.departmentId,
      updatedAt: Date.now(),
    });
    evaluations.docs.forEach((document) => writer.update(document.ref, {
      subjectId,
      departmentId: subject.departmentId,
    }));
    completions.docs.forEach((document) => writer.update(document.ref, {
      subjectId,
      departmentId: subject.departmentId,
    }));
    reports.forEach((document) => writer.update(document.ref, {
      subjectId,
      departmentId: subject.departmentId,
    }));
    await writer.close();

    const recordsUpdated = 1 + evaluations.size + completions.size + reports.length;
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "teacher_assignment_subject_corrected",
      metadata: {
        assignmentId,
        teacherId: assignment.teacherId,
        previousSubjectId: assignment.subjectId,
        subjectId,
        recordsUpdated,
      },
    });

    return NextResponse.json({ ok: true, recordsUpdated });
  } catch (error) {
    return apiErrorResponse(error, "Assignment subject correction failed.");
  }
}
