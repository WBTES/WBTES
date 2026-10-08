import type { Evaluation, Program } from "./types";

export type ReportRating = {
  id: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  programId: string | null;
  course: string;
  yearLevel: string;
  periodId: string;
  responses: number;
  average: number;
};

export function groupReportRatings(evaluations: Evaluation[], programs: Program[] = []): ReportRating[] {
  const programById = new Map(programs.map((program) => [program.id, program]));
  const groups = new Map<string, Omit<ReportRating, "average"> & { total: number }>();
  for (const evaluation of evaluations) {
    if (!Number.isFinite(evaluation.averageScore) || evaluation.averageScore < 1 || evaluation.averageScore > 5) continue;
    let programId = evaluation.programId || null;
    const course = evaluation.course?.trim() ?? "";
    // Legacy responses may contain the course code instead of the program ID.
    if (!programId && course) {
      const matches = programs.filter((program) => program.code?.trim().toLowerCase() === course.toLowerCase());
      const inDepartment = matches.filter((program) => program.departmentId === evaluation.departmentId);
      if (inDepartment.length === 1) programId = inDepartment[0].id;
      else if (matches.length === 1) programId = matches[0].id;
    }
    const program = programId ? programById.get(programId) : undefined;
    const departmentId = evaluation.departmentId || program?.departmentId || "";
    const yearLevel = evaluation.yearLevel?.trim().toLowerCase() ?? "";
    const id = JSON.stringify([
      evaluation.teacherId, evaluation.subjectId, departmentId,
      programId ? ["program", programId] : ["course", course.toLowerCase()],
      yearLevel, evaluation.periodId,
    ]);
    const group = groups.get(id) ?? {
      id, teacherId: evaluation.teacherId, subjectId: evaluation.subjectId,
      departmentId, programId, course: program?.code || course,
      yearLevel, periodId: evaluation.periodId, responses: 0, total: 0,
    };
    group.responses += 1;
    group.total += evaluation.averageScore;
    groups.set(id, group);
  }
  return [...groups.values()].map(({ total, ...group }) => ({
    ...group, average: Number((total / group.responses).toFixed(2)),
  }));
}
