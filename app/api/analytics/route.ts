import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { buildAnalytics } from "@/lib/analytics";
import { apiErrorResponse } from "@/lib/server/api-response";
import { ApiError, requireDepartmentStaff } from "@/lib/server/require-admin";
import type { Department, Evaluation, EvaluationCompletion, EvaluationPeriod, Teacher, TeacherAssignment } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { profile } = await requireDepartmentStaff(request);
    const periodId = new URL(request.url).searchParams.get("periodId") ?? "";
    const [evaluationDocs, completionDocs, assignmentDocs, teacherDocs, departmentDocs, periodDocs] = await Promise.all([
      adminDb.collection("evaluations").get(),
      adminDb.collection("evaluationCompletions").get(),
      adminDb.collection("teacherAssignments").get(),
      adminDb.collection("teachers").get(),
      adminDb.collection("departments").get(),
      adminDb.collection("evaluationPeriods").get(),
    ]);
    const periods = periodDocs.docs.map((item) => ({ ...item.data(), id: item.id } as EvaluationPeriod));
    if (periodId && !periods.some((period) => period.id === periodId)) throw new ApiError(400, "Evaluation period not found.");
    const inScope = (item: { periodId: string }) => !periodId || item.periodId === periodId;
    const data = buildAnalytics({
      evaluations: evaluationDocs.docs.map((item) => ({ ...item.data(), id: item.id } as Evaluation)).filter(inScope),
      completions: completionDocs.docs.map((item) => ({ ...item.data(), id: item.id } as EvaluationCompletion)).filter(inScope),
      assignments: assignmentDocs.docs.map((item) => ({ ...item.data(), id: item.id } as TeacherAssignment)).filter(inScope),
      teachers: teacherDocs.docs.map((item) => ({ ...item.data(), id: item.id } as Teacher)),
      departments: departmentDocs.docs.map((item) => ({ ...item.data(), id: item.id } as Department)),
      periods: periods.filter((period) => !periodId || period.id === periodId),
      releasedPeriodIds: profile.role === "admin" ? undefined : new Set(periods.filter((period) => period.status === "closed").map((period) => period.id)),
      minimumResponses: profile.role === "department_head" ? 5 : 1,
    });
    // Only aggregates leave the server: never student IDs, answers, or raw comments.
    return NextResponse.json({
      data,
      periods: [...periods].sort((a, b) => b.endDate - a.endDate).map(({ id, name }) => ({ id, name })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "Analytics could not be loaded.");
  }
}
