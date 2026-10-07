import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { buildDashboardOverview } from "@/lib/dashboard-overview";
import { apiErrorResponse } from "@/lib/server/api-response";
import { requireDepartmentStaff } from "@/lib/server/require-admin";
import type { Department, Evaluation, EvaluationCompletion, EvaluationPeriod, Teacher, TeacherAssignment } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { profile } = await requireDepartmentStaff(request);
    const [teacherSnapshot, periodSnapshot, assignmentSnapshot, completionSnapshot, evaluationSnapshot, departmentSnapshot, userSnapshot] = await Promise.all([
      adminDb.collection("teachers").get(),
      adminDb.collection("evaluationPeriods").get(),
      adminDb.collection("teacherAssignments").get(),
      adminDb.collection("evaluationCompletions").get(),
      adminDb.collection("evaluations").get(),
      adminDb.collection("departments").get(),
      profile.role === "admin" ? adminDb.collection("users").select("role").get() : null,
    ]);
    const result = buildDashboardOverview({
      role: profile.role as "admin" | "hr" | "department_head",
      teachers: teacherSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Teacher)),
      periods: periodSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as EvaluationPeriod)),
      assignments: assignmentSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as TeacherAssignment)),
      completions: completionSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as EvaluationCompletion)),
      evaluations: evaluationSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Evaluation)),
      departments: departmentSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Department)),
      users: userSnapshot?.docs.map((item) => ({ role: String(item.data().role ?? "") })),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "Dashboard statistics could not be loaded.");
  }
}
