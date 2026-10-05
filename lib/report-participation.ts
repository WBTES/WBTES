import type { Evaluation } from "./types";

export type ReportParticipation = {
  teacherId: string;
  subjectId: string;
  departmentId: string;
  periodId: string;
  assigned: number;
  completed: number;
  pending: number;
  responses: number;
};

type ProgressRecord = Pick<ReportParticipation, "teacherId" | "subjectId" | "departmentId" | "periodId"> & {
  studentId: string;
  id: string;
  status: "completed" | "pending";
};

export function buildReportParticipation(evaluations: Evaluation[], progress: ProgressRecord[]) {
  const groups = new Map<string, ReportParticipation>();
  const keyFor = (row: Pick<ReportParticipation, "teacherId" | "subjectId" | "departmentId" | "periodId">) =>
    JSON.stringify([row.teacherId, row.subjectId, row.departmentId, row.periodId]);
  const groupFor = (row: Pick<ReportParticipation, "teacherId" | "subjectId" | "departmentId" | "periodId">) => {
    const key = keyFor(row);
    let group = groups.get(key);
    if (!group) {
      group = { teacherId: row.teacherId, subjectId: row.subjectId, departmentId: row.departmentId, periodId: row.periodId, assigned: 0, completed: 0, pending: 0, responses: 0 };
      groups.set(key, group);
    }
    return group;
  };
  const tasks = new Set<string>();
  progress.forEach((row) => {
    if (tasks.has(row.id)) return;
    tasks.add(row.id);
    const group = groupFor(row);
    group.assigned += 1;
    if (row.status === "completed") group.completed += 1;
    else group.pending += 1;
  });
  evaluations.forEach((evaluation) => { groupFor(evaluation).responses += 1; });
  return [...groups.values()];
}

export function participationStatus(row: ReportParticipation) {
  if (!row.assigned) return "Historical (assignment unavailable)";
  return row.pending > 0 || row.responses < row.assigned ? "Partial" : "Complete";
}
