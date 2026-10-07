import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { reportableEvaluations } from "@/lib/evaluation-results";
import { buildPerformanceAnalysis } from "@/lib/performance-analysis";
import { apiErrorResponse } from "@/lib/server/api-response";
import { requireRole } from "@/lib/server/require-admin";
import type {
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  PerformanceReport,
  TeacherAssignment,
} from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const options = new URL(request.url).searchParams;
    const includeDetails = options.get("details") === "1";
    const includeReports = includeDetails && options.get("reports") === "1";
    const [evaluationDocs, assignmentDocs, completionDocs, periodDocs, reportDocs] = await Promise.all([
      adminDb.collection("evaluations").get(),
      adminDb.collection("teacherAssignments").get(),
      adminDb.collection("evaluationCompletions").get(),
      adminDb.collection("evaluationPeriods").get(),
      includeReports ? adminDb.collection("performanceReports").get() : null,
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
    ).filter((evaluation) => closedPeriodIds.has(evaluation.periodId)
      && Number.isFinite(evaluation.averageScore) && evaluation.averageScore >= 1 && evaluation.averageScore <= 5);

    return NextResponse.json({
      periods,
      evaluations: evaluations.map((evaluation) => ({
        id: evaluation.id,
        teacherId: evaluation.teacherId,
        subjectId: evaluation.subjectId,
        periodId: evaluation.periodId,
        averageScore: evaluation.averageScore,
        ...(includeDetails ? {
          departmentId: evaluation.departmentId,
          programId: evaluation.programId ?? null,
          course: evaluation.course ?? "",
          yearLevel: evaluation.yearLevel ?? "",
          ratings: evaluation.ratings ?? {},
          comment: evaluation.comment ?? "",
          anonymous: true,
        } : {}),
      })),
      ...(includeReports ? {
        reports: buildPerformanceAnalysis(reportDocs!.docs.map((item) => ({ ...item.data(), id: item.id } as PerformanceReport)), evaluations)
          .flatMap((group) => group.reports.filter((item) => !item.stale).map((item) => item.report)),
      } : {}),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "Comparison results could not be loaded.");
  }
}
