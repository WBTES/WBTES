import { buildAnalytics } from "./analytics";
import { buildAssignmentResultStatus, reportableEvaluations } from "./evaluation-results";
import type { Department, DepartmentOverview, Evaluation, EvaluationCompletion, EvaluationPeriod, Teacher, TeacherAssignment } from "./types";

type OverviewInput = {
  role: "admin" | "hr" | "department_head";
  teachers: Teacher[];
  departments: Department[];
  periods: EvaluationPeriod[];
  assignments: TeacherAssignment[];
  completions: EvaluationCompletion[];
  evaluations: Evaluation[];
  users?: Array<{ role: string }>;
};

export function buildDashboardOverview(input: OverviewInput): DepartmentOverview {
  const openIds = new Set(input.periods.filter((period) => period.status === "open").map((period) => period.id));
  const closedIds = new Set(input.periods.filter((period) => period.status === "closed").map((period) => period.id));
  const openAssignments = input.assignments.filter((assignment) => openIds.has(assignment.periodId));
  const openEvaluations = input.evaluations.filter((evaluation) => openIds.has(evaluation.periodId));
  const released = buildAnalytics({ ...input, releasedPeriodIds: closedIds, minimumResponses: input.role === "department_head" ? 5 : 1 });
  const status = buildAssignmentResultStatus(openAssignments, input.completions);
  const progress = new Map<string, { assigned: number; completed: number; responses: number }>();
  const ensureTeacher = (teacherId: string) => {
    let item = progress.get(teacherId);
    if (!item) {
      item = { assigned: 0, completed: 0, responses: 0 };
      progress.set(teacherId, item);
    }
    return item;
  };
  input.teachers.forEach((teacher) => ensureTeacher(teacher.id));
  openAssignments.forEach((assignment) => {
    const item = ensureTeacher(assignment.teacherId);
    const counts = status.get(assignment.id)!;
    item.assigned += counts.assigned;
    item.completed += counts.completed;
  });
  openEvaluations.forEach((evaluation) => { ensureTeacher(evaluation.teacherId).responses += 1; });
  released.topTeachers.forEach((teacher) => ensureTeacher(teacher.id));
  const releasedCounts = new Map<string, number>();
  // Match Analytics' finalized, valid-score response count for each teacher.
  reportableEvaluations(input.evaluations, input.assignments, input.completions).forEach((evaluation) => {
    if (closedIds.has(evaluation.periodId) && Number.isFinite(evaluation.averageScore) && evaluation.averageScore >= 1 && evaluation.averageScore <= 5) {
      releasedCounts.set(evaluation.teacherId, (releasedCounts.get(evaluation.teacherId) ?? 0) + 1);
    }
  });
  const teacherRatings = new Map(released.topTeachers.map((teacher) => [teacher.id, teacher.average]));
  const teacherProgress = [...progress].map(([teacherId, item]) => ({
    teacherId,
    assignedTasks: item.assigned,
    completedTasks: item.completed,
    submittedResponses: item.responses,
    completionRate: item.assigned ? Math.round(item.completed / item.assigned * 100) : 0,
    releasedEvaluations: releasedCounts.get(teacherId) ?? 0,
    averageRating: teacherRatings.get(teacherId) ?? null,
  }));
  const assignedTasks = teacherProgress.reduce((sum, teacher) => sum + teacher.assignedTasks, 0);
  const completedTasks = teacherProgress.reduce((sum, teacher) => sum + teacher.completedTasks, 0);
  const result: DepartmentOverview = {
    departmentId: "",
    teacherCount: input.teachers.filter((teacher) => teacher.status !== "inactive").length,
    activePeriods: openIds.size,
    assignedTasks,
    completedTasks,
    submittedResponses: openEvaluations.length,
    pendingTasks: assignedTasks - completedTasks,
    completionRate: assignedTasks ? Math.round(completedTasks / assignedTasks * 100) : 0,
    releasedPeriods: closedIds.size,
    releasedEvaluations: released.releasedEvaluations,
    averageRating: released.averageRating,
    teacherProgress,
  };
  if (input.role === "admin") {
    const all = buildAnalytics(input);
    const completed = all.completionByDepartment.reduce((sum, department) => sum + department.completed, 0);
    const assigned = all.completionByDepartment.reduce((sum, department) => sum + department.completed + department.pending, 0);
    result.adminSummary = {
      students: (input.users ?? []).filter((user) => user.role === "student").length,
      teachers: input.teachers.length,
      departments: input.departments.length,
      evaluations: all.totalEvaluations,
      assignedTasks: assigned,
      completedTasks: completed,
      pendingTasks: assigned - completed,
      completedStudents: all.completedStudents,
      pendingStudents: all.pendingStudents,
      completionRate: assigned ? Math.round(completed / assigned * 100) : 0,
      finalizedResponses: all.releasedEvaluations,
      averageRating: all.averageRating,
    };
  }
  return result;
}
