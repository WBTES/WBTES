import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { reportableEvaluations } from "@/lib/evaluation-results";
import { apiErrorResponse } from "@/lib/server/api-response";
import { requireRole } from "@/lib/server/require-admin";
import type {
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  TeacherAssignment,
} from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const [evaluationDocs, assignmentDocs, completionDocs, periodDocs] = await Promise.all([
      adminDb.collection("evaluations").get(),
      adminDb.collection("teacherAssignments").get(),
      adminDb.collection("evaluationCompletions").get(),
      adminDb.collection("evaluationPeriods").get(),
    ]);
    const periods = periodDocs.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EvaluationPeriod, "id">),
    })).filter((period) => period.status === "closed");
    const closedPeriodIds = new Set(periods.map((period) => period.id));
    const assignments = assignmentDocs.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<TeacherAssignment, "id">),
    }));
    const completions = completionDocs.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EvaluationCompletion, "id">),
    }));
    const evaluations = reportableEvaluations(
      evaluationDocs.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Evaluation, "id">),
      })),
      assignments,
      completions
    ).filter((evaluation) => closedPeriodIds.has(evaluation.periodId));

    return NextResponse.json({
      periods,
      evaluations: evaluations.map((evaluation) => ({
        id: evaluation.id,
        teacherId: evaluation.teacherId,
        subjectId: evaluation.subjectId,
        periodId: evaluation.periodId,
        averageScore: evaluation.averageScore,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "Comparison results could not be loaded.");
  }
}
