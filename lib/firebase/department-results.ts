import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";
import type { Evaluation, EvaluationPeriod, PerformanceReport } from "@/lib/types";

export type ReleasedDepartmentResults = {
  periods: EvaluationPeriod[];
  evaluations: Evaluation[];
  reports: PerformanceReport[];
};

export async function loadReleasedDepartmentResults(
  departmentId?: string | null,
  includeReports = false
): Promise<ReleasedDepartmentResults> {
  const response = await authenticatedFetch(`/api/department/comparison?details=1${includeReports ? "&reports=1" : ""}`);
  const result = await readApiResponse<Omit<ReleasedDepartmentResults, "reports"> & { reports?: PerformanceReport[] }>(response);
  return {
    periods: [...result.periods].sort((a, b) => b.endDate - a.endDate),
    evaluations: result.evaluations.filter((evaluation) => !departmentId || evaluation.departmentId === departmentId),
    reports: (result.reports ?? []).filter((report) => !departmentId || report.departmentId === departmentId),
  };
}
