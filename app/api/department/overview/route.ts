import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse } from "@/lib/server/api-response";
import { requireDepartmentStaff } from "@/lib/server/require-admin";
import { reportableEvaluations } from "@/lib/evaluation-results";
import type {
  DepartmentOverview,
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  TeacherAssignment,
} from "@/lib/types";

export const runtime = "nodejs";
const MINIMUM_RELEASED_RESPONSES = 5;

export async function GET(request: Request) {
  try {
    await requireDepartmentStaff(request);
    const departmentId = "";

    const [teacherSnapshot, periodSnapshot, assignmentSnapshot, completionSnapshot, evaluationSnapshot] =
      await Promise.all([
        adminDb.collection("teachers").get(),
        adminDb.collection("evaluationPeriods").get(),
        adminDb.collection("teacherAssignments").get(),
        adminDb.collection("evaluationCompletions").get(),
        adminDb.collection("evaluations").get(),
      ]);

    const periods = new Map<string, EvaluationPeriod>();
    periodSnapshot.docs.forEach((document) => {
      periods.set(document.id, {
        id: document.id,
        ...(document.data() as Omit<EvaluationPeriod, "id">),
      });
    });
    const openPeriodIds = new Set(
      [...periods.values()].filter((period) => period.status === "open").map((period) => period.id)
    );
    const closedPeriodIds = new Set(
      [...periods.values()].filter((period) => period.status === "closed").map((period) => period.id)
    );

    const progress = new Map<string, {
      assigned: Set<string>;
      submitted: Set<string>;
      releasedScores: number[];
    }>();
    const activeTeachers = teacherSnapshot.docs.filter(
      (teacher) => teacher.data().status !== "inactive"
    );
    activeTeachers.forEach((teacher) => {
      progress.set(teacher.id, {
        assigned: new Set(),
        submitted: new Set(),
        releasedScores: [],
      });
    });

    assignmentSnapshot.docs.forEach((document) => {
      const assignment = document.data() as TeacherAssignment;
      if (!openPeriodIds.has(assignment.periodId)) return;
      const teacher = progress.get(assignment.teacherId);
      if (!teacher || !Array.isArray(assignment.studentIds)) return;
      assignment.studentIds.forEach((studentId) => {
        teacher.assigned.add(`${studentId}_${document.id}`);
      });
    });

    completionSnapshot.docs.forEach((document) => {
      const completion = document.data() as EvaluationCompletion;
      if (!openPeriodIds.has(completion.periodId)) return;
      const teacher = progress.get(completion.teacherId);
      const key = `${completion.studentId}_${completion.assignmentId}`;
      if (teacher?.assigned.has(key)) teacher.submitted.add(key);
    });

    const assignments = assignmentSnapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<TeacherAssignment, "id">),
    }));
    const completions = completionSnapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<EvaluationCompletion, "id">),
    }));
    const evaluations = evaluationSnapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<Evaluation, "id">),
    }));
    const releasedEvaluations = reportableEvaluations(evaluations, assignments, completions)
      .filter((evaluation) => closedPeriodIds.has(evaluation.periodId));
    releasedEvaluations.forEach((evaluation) => {
      if (typeof evaluation.averageScore !== "number") return;
      progress.get(evaluation.teacherId)?.releasedScores.push(evaluation.averageScore);
    });

    const teacherProgress = [...progress.entries()].map(([teacherId, item]) => {
      const assignedTasks = item.assigned.size;
      const submittedResponses = item.submitted.size;
      const releasedTotal = item.releasedScores.reduce((total, score) => total + score, 0);
      return {
        teacherId,
        assignedTasks,
        submittedResponses,
        completionRate: assignedTasks > 0
          ? Math.round((submittedResponses / assignedTasks) * 100)
          : 0,
        releasedEvaluations: item.releasedScores.length,
        averageRating: item.releasedScores.length > 0
          ? Number((releasedTotal / item.releasedScores.length).toFixed(2))
          : null,
      };
    });
    const assignedTasks = teacherProgress.reduce((total, item) => total + item.assignedTasks, 0);
    const submittedResponses = teacherProgress.reduce(
      (total, item) => total + item.submittedResponses,
      0
    );
    const releasedTotal = releasedEvaluations.reduce(
      (total, evaluation) => total + evaluation.averageScore,
      0
    );

    const result: DepartmentOverview = {
      departmentId,
      teacherCount: activeTeachers.length,
      activePeriods: openPeriodIds.size,
      assignedTasks,
      submittedResponses,
      pendingTasks: Math.max(assignedTasks - submittedResponses, 0),
      completionRate: assignedTasks > 0
        ? Math.round((submittedResponses / assignedTasks) * 100)
        : 0,
      releasedPeriods: closedPeriodIds.size,
      releasedEvaluations: releasedEvaluations.length,
      averageRating: releasedEvaluations.length >= MINIMUM_RELEASED_RESPONSES
        ? Number((releasedTotal / releasedEvaluations.length).toFixed(2))
        : null,
      teacherProgress,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "Department progress could not be loaded.");
  }
}
