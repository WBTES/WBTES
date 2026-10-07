import type { Evaluation, PerformanceReport } from "./types";

export type PerformanceAnalysisGroup = {
  teacherId: string;
  average: number;
  responses: number;
  reports: Array<{
    report: PerformanceReport;
    average: number;
    responses: number;
    stale: boolean;
  }>;
};

export function buildPerformanceAnalysis(
  reports: PerformanceReport[],
  finalizedEvaluations: Evaluation[]
): PerformanceAnalysisGroup[] {
  const keyFor = (item: { teacherId: string; subjectId: string; periodId: string }) =>
    JSON.stringify([item.teacherId, item.subjectId, item.periodId]);
  const teacherScores = new Map<string, { total: number; count: number }>();
  const scopeScores = new Map<string, { total: number; count: number }>();
  for (const evaluation of finalizedEvaluations) {
    if (!Number.isFinite(evaluation.averageScore) || evaluation.averageScore < 1 || evaluation.averageScore > 5) continue;
    for (const [map, key] of [[teacherScores, evaluation.teacherId], [scopeScores, keyFor(evaluation)]] as const) {
      const score = map.get(key) ?? { total: 0, count: 0 };
      score.total += evaluation.averageScore;
      score.count += 1;
      map.set(key, score);
    }
  }

  // Older or manually duplicated snapshots must not count as extra evaluations.
  const latestReports = new Map<string, PerformanceReport>();
  for (const report of reports) {
    const key = keyFor(report);
    if (!scopeScores.has(key)) continue;
    const previous = latestReports.get(key);
    if (!previous || report.generatedAt > previous.generatedAt
      || (report.generatedAt === previous.generatedAt && report.id.localeCompare(previous.id) > 0)) {
      latestReports.set(key, report);
    }
  }

  const groups = new Map<string, PerformanceAnalysisGroup>();
  for (const report of latestReports.values()) {
    const teacherScore = teacherScores.get(report.teacherId)!;
    const scopeScore = scopeScores.get(keyFor(report))!;
    const average = Number((scopeScore.total / scopeScore.count).toFixed(2));
    const group = groups.get(report.teacherId) ?? {
      teacherId: report.teacherId,
      average: Number((teacherScore.total / teacherScore.count).toFixed(2)),
      responses: teacherScore.count,
      reports: [],
    };
    group.reports.push({
      report,
      average,
      responses: scopeScore.count,
      stale: !Number.isFinite(report.averageScore)
        || Number(report.averageScore.toFixed(2)) !== average
        || report.totalEvaluations !== scopeScore.count,
    });
    groups.set(report.teacherId, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    reports: group.reports.sort((a, b) => b.report.generatedAt - a.report.generatedAt || a.report.id.localeCompare(b.report.id)),
  })).sort((a, b) => b.average - a.average || a.teacherId.localeCompare(b.teacherId));
}
