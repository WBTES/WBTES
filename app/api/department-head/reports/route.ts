import { NextResponse } from "next/server";
import { analyzeWeightedComments } from "@/lib/comment-analysis";
import { adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse } from "@/lib/server/api-response";
import { ApiError, requireRole } from "@/lib/server/require-admin";
import { reportableEvaluations } from "@/lib/evaluation-results";
import type {
  DepartmentHeadReport,
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  EvaluationQuestion,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";

export const runtime = "nodejs";

const MINIMUM_RESPONSES = 5;

export async function GET(request: Request) {
  try {
    await requireRole(request, ["department_head"]);
    const departmentId = "";

    const selectedPeriodId = new URL(request.url).searchParams.get("periodId") || null;
    const [periodDocs, teacherDocs, questionDocs, evaluationDocs, assignmentDocs, completionDocs] = await Promise.all([
      adminDb.collection("evaluationPeriods").get(),
      adminDb.collection("teachers").get(),
      adminDb.collection("evaluationQuestions").get(),
      adminDb.collection("evaluations").get(),
      adminDb.collection("teacherAssignments").get(),
      adminDb.collection("evaluationCompletions").get(),
    ]);

    const periods = periodDocs.docs
      .map((item) => ({ id: item.id, ...(item.data() as Omit<EvaluationPeriod, "id">) }))
      .filter((period) => period.status === "closed")
      .sort((a, b) => b.endDate - a.endDate);
    if (selectedPeriodId && !periods.some((period) => period.id === selectedPeriodId)) {
      throw new ApiError(400, "Select a closed evaluation period.");
    }
    const closedIds = new Set(periods.map((period) => period.id));
    const allSubmitted = evaluationDocs.docs
      .map((item) => ({ id: item.id, ...(item.data() as Omit<Evaluation, "id">) }))
      .filter((item) => closedIds.has(item.periodId));
    const assignments = assignmentDocs.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<TeacherAssignment, "id">),
    }));
    const completions = completionDocs.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EvaluationCompletion, "id">),
    }));
    const allReleased = reportableEvaluations(allSubmitted, assignments, completions);
    const selectedSubmitted = selectedPeriodId
      ? allSubmitted.filter((item) => item.periodId === selectedPeriodId)
      : allSubmitted;
    const selected = selectedPeriodId
      ? allReleased.filter((item) => item.periodId === selectedPeriodId)
      : allReleased;
    const teachers = new Map(teacherDocs.docs.filter(
      (item) => item.data().status !== "inactive"
    ).map((item) => {
      const teacher = { id: item.id, ...(item.data() as Omit<Teacher, "id">) };
      return [item.id, teacher] as const;
    }));
    const questionCategories = new Map(questionDocs.docs.map((item) => {
      const question = item.data() as EvaluationQuestion;
      return [item.id, question.category || "General"] as const;
    }));

    const categoryValues = new Map<string, number[]>();
    selected.forEach((evaluation) => {
      Object.entries(evaluation.ratings ?? {}).forEach(([questionId, value]) => {
        if (typeof value !== "number") return;
        const category = questionCategories.get(questionId) ?? "General";
        categoryValues.set(category, [...(categoryValues.get(category) ?? []), value]);
      });
    });
    const protectedResults = selected.length < MINIMUM_RESPONSES;
    const comments = selected.map((item) => item.comment?.trim()).filter((value): value is string => Boolean(value));
    const analysis = protectedResults ? analyzeWeightedComments([]) : analyzeWeightedComments(comments);

    const teacherRows = [...teachers.values()].map((teacher) => {
      const submittedRows = selectedSubmitted.filter((evaluation) => evaluation.teacherId === teacher.id);
      const rows = selected.filter((evaluation) => evaluation.teacherId === teacher.id);
      const isProtected = rows.length < MINIMUM_RESPONSES;
      return {
        teacherId: teacher.id,
        teacherName: teacher.displayName,
        responses: submittedRows.length,
        average: isProtected ? null : average(rows.map((row) => row.averageScore)),
        protected: isProtected,
      };
    }).sort((a, b) => b.responses - a.responses || a.teacherName.localeCompare(b.teacherName));

    const trends = periods.slice().reverse().map((period) => {
      const submittedRows = allSubmitted.filter((evaluation) => evaluation.periodId === period.id);
      const rows = allReleased.filter((evaluation) => evaluation.periodId === period.id);
      return {
        periodId: period.id,
        periodName: period.name,
        endDate: period.endDate,
        responses: submittedRows.length,
        average: rows.length < MINIMUM_RESPONSES ? null : average(rows.map((row) => row.averageScore)),
      };
    });

    const result: DepartmentHeadReport = {
      departmentId,
      departmentName: "School-wide",
      minimumResponses: MINIMUM_RESPONSES,
      selectedPeriodId,
      periods: periods.map(({ id, name, endDate }) => ({ id, name, endDate })),
      teacherCount: teachers.size,
      responseCount: selectedSubmitted.length,
      averageRating: protectedResults ? null : average(selected.map((row) => row.averageScore)),
      resultsProtected: protectedResults,
      categories: protectedResults ? [] : [...categoryValues.entries()].map(([category, values]) => ({
        category,
        average: average(values) ?? 0,
        count: values.length,
      })).sort((a, b) => b.average - a.average),
      feedback: analysis.groups.map((group) => ({
        type: group.type,
        label: group.label,
        count: group.rawCount,
        weightedCount: group.weightedCount,
      })),
      themes: analysis.groups.flatMap((group) => group.themes.map((theme) => ({
        name: theme.name,
        count: theme.rawCount,
        type: group.type,
      }))).sort((a, b) => b.count - a.count).slice(0, 10),
      teachers: teacherRows,
      trends,
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error, "Department report could not be loaded.");
  }
}

function average(values: number[]) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2)) : null;
}
