import type { Evaluation, EvaluationCompletion, TeacherAssignment } from "@/lib/types";

export type AssignmentResultStatus = {
  assigned: number;
  completed: number;
  ready: boolean;
};

export function buildAssignmentResultStatus(
  assignments: TeacherAssignment[],
  completions: EvaluationCompletion[]
) {
  const completedByAssignment = new Map<string, Set<string>>();
  completions.forEach((completion) => {
    if (!completion.assignmentId) return;
    const students = completedByAssignment.get(completion.assignmentId) ?? new Set<string>();
    students.add(completion.studentId);
    completedByAssignment.set(completion.assignmentId, students);
  });

  return new Map(assignments.map((assignment) => {
    const assignedStudents = new Set(assignment.studentIds ?? []);
    const completedStudents = completedByAssignment.get(assignment.id) ?? new Set<string>();
    const completed = [...completedStudents].filter((studentId) => assignedStudents.has(studentId)).length;
    return [assignment.id, {
      assigned: assignedStudents.size,
      completed,
      ready: assignedStudents.size > 0 && completed === assignedStudents.size,
    }] as const;
  }));
}

export function reportableEvaluations(
  evaluations: Evaluation[],
  assignments: TeacherAssignment[],
  completions: EvaluationCompletion[]
) {
  const status = buildAssignmentResultStatus(assignments, completions);
  const legacyAssignments = new Map<string, TeacherAssignment[]>();
  assignments.forEach((assignment) => {
    const key = legacyEvaluationKey(assignment);
    legacyAssignments.set(key, [...(legacyAssignments.get(key) ?? []), assignment]);
  });

  return evaluations.filter((evaluation) => {
    if (evaluation.assignmentId) return status.get(evaluation.assignmentId)?.ready === true;
    return (legacyAssignments.get(legacyEvaluationKey(evaluation)) ?? [])
      .some((assignment) => status.get(assignment.id)?.ready === true);
  });
}

function legacyEvaluationKey(value: Pick<Evaluation, "teacherId" | "subjectId" | "periodId">) {
  return `${value.teacherId}_${value.subjectId}_${value.periodId}`;
}
