import { reportableEvaluations } from "./evaluation-results";
import type { Department, Evaluation, EvaluationCompletion, EvaluationPeriod, Teacher, TeacherAssignment } from "./types";

export type AnalyticsData = {
  departmentAverages: Array<{ id: string; name: string; average: number | null; responses: number }>;
  departmentCounts: Array<{ id: string; name: string; evaluations: number }>;
  trend: Array<{ period: string; average: number | null; evaluations: number }>;
  topTeachers: Array<{ id: string; name: string; average: number | null; responses: number }>;
  completionByDepartment: Array<{ id: string; department: string; completed: number; pending: number; rate: number }>;
  completedStudents: number;
  pendingStudents: number;
  totalEvaluations: number;
  releasedEvaluations: number;
  averageRating: number | null;
};

type AnalyticsInput = {
  evaluations: Evaluation[];
  completions: EvaluationCompletion[];
  assignments: TeacherAssignment[];
  teachers: Teacher[];
  departments: Department[];
  periods: EvaluationPeriod[];
  releasedPeriodIds?: ReadonlySet<string>;
  minimumResponses?: number;
};

export function buildAnalytics(input: AnalyticsInput): AnalyticsData {
  const minimumResponses = input.minimumResponses ?? 1;
  const finalEvaluations = reportableEvaluations(input.evaluations, input.assignments, input.completions)
    .filter((evaluation) => !input.releasedPeriodIds || input.releasedPeriodIds.has(evaluation.periodId))
    .filter((evaluation) => Number.isFinite(evaluation.averageScore) && evaluation.averageScore >= 1 && evaluation.averageScore <= 5);
  const departments = new Map(input.departments.map((department) => [department.id, department]));
  const teachers = new Map(input.teachers.map((teacher) => [teacher.id, teacher]));
  const assignments = new Map(input.assignments.map((assignment) => [assignment.id, assignment]));
  // Prefer the historical assignment scope; use teacher scope only for missing legacy references.
  const departmentFor = (item: { assignmentId?: string; departmentId: string; teacherId: string }) => {
    const assignment = item.assignmentId ? assignments.get(item.assignmentId) : undefined;
    const candidates = [assignment?.departmentId, item.departmentId, teachers.get(item.teacherId)?.departmentId];
    return candidates.find((id) => id && departments.has(id)) ?? "unassigned";
  };
  const counts = new Map<string, number>();
  const teacherCounts = new Map<string, number>();
  input.evaluations.forEach((evaluation) => {
    const id = departmentFor(evaluation);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    teacherCounts.set(evaluation.teacherId, (teacherCounts.get(evaluation.teacherId) ?? 0) + 1);
  });
  type Score = { total: number; count: number };
  const departmentScores = new Map<string, Score>();
  const teacherScores = new Map<string, Score>();
  const periodScores = new Map<string, Score>();
  const addScore = (map: Map<string, Score>, id: string, value: number) => {
    const score = map.get(id) ?? { total: 0, count: 0 };
    score.total += value;
    score.count += 1;
    map.set(id, score);
  };
  const average = (score?: Score) => score && score.count >= minimumResponses
    ? Number((score.total / score.count).toFixed(2)) : null;
  finalEvaluations.forEach((evaluation) => {
    addScore(departmentScores, departmentFor(evaluation), evaluation.averageScore);
    addScore(teacherScores, evaluation.teacherId, evaluation.averageScore);
    addScore(periodScores, evaluation.periodId, evaluation.averageScore);
  });

  const slots = new Map<string, { studentId: string; departmentId: string; completed: boolean }>();
  const slotKey = (assignmentId: string, studentId: string) => JSON.stringify([assignmentId, studentId]);
  input.assignments.forEach((assignment) => {
    const departmentId = departmentFor({ ...assignment, assignmentId: assignment.id });
    (assignment.studentIds ?? []).forEach((studentId) => {
      slots.set(slotKey(assignment.id, studentId), { studentId, departmentId, completed: false });
    });
  });
  input.completions.forEach((completion) => {
    const slot = slots.get(slotKey(completion.assignmentId, completion.studentId));
    if (slot) slot.completed = true;
  });
  const studentProgress = new Map<string, { assigned: number; completed: number }>();
  const departmentProgress = new Map<string, { completed: number; pending: number }>();
  slots.forEach((slot) => {
    const student = studentProgress.get(slot.studentId) ?? { assigned: 0, completed: 0 };
    student.assigned += 1;
    if (slot.completed) student.completed += 1;
    studentProgress.set(slot.studentId, student);
    const department = departmentProgress.get(slot.departmentId) ?? { completed: 0, pending: 0 };
    if (slot.completed) department.completed += 1;
    else department.pending += 1;
    departmentProgress.set(slot.departmentId, department);
  });
  const rows = input.departments.map((department) => ({ id: department.id, name: departmentLabel(department) }));
  if (counts.has("unassigned") || departmentProgress.has("unassigned")) {
    rows.push({ id: "unassigned", name: "Unassigned department" });
  }
  return {
    departmentAverages: rows.map(({ id, name }) => ({ id, name, average: average(departmentScores.get(id)), responses: counts.get(id) ?? 0 })),
    departmentCounts: rows.map(({ id, name }) => ({ id, name, evaluations: counts.get(id) ?? 0 })),
    completionByDepartment: rows.map(({ id, name }) => {
      const progress = departmentProgress.get(id) ?? { completed: 0, pending: 0 };
      const total = progress.completed + progress.pending;
      return { id, department: name, ...progress, rate: total ? Math.round(progress.completed / total * 100) : 0 };
    }),
    trend: [...input.periods].sort((a, b) => a.endDate - b.endDate)
      .filter((period) => periodScores.has(period.id))
      .map((period) => ({ period: period.name, average: average(periodScores.get(period.id)), evaluations: periodScores.get(period.id)?.count ?? 0 })),
    topTeachers: [...teacherCounts].map(([id, responses]) => ({
      id, name: teachers.get(id)?.displayName ?? "Archived teacher", responses, average: average(teacherScores.get(id)),
    })).sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name)),
    completedStudents: [...studentProgress.values()].filter((item) => item.completed === item.assigned).length,
    pendingStudents: [...studentProgress.values()].filter((item) => item.completed < item.assigned).length,
    totalEvaluations: input.evaluations.length,
    releasedEvaluations: finalEvaluations.length,
    averageRating: average({ total: finalEvaluations.reduce((sum, item) => sum + item.averageScore, 0), count: finalEvaluations.length }),
  };
}

function departmentLabel(department: Department) {
  const code = department.code?.trim().toUpperCase();
  if (code === "EDUCATION") return "EDUC";
  if (code === "CABAIT" || code === "EDUC") return code;
  return department.name?.trim() || code || "Unnamed department";
}
