import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type {
  Evaluation,
  EvaluationPeriod,
  PerformanceReport,
} from "@/lib/types";

export type ReleasedDepartmentResults = {
  periods: EvaluationPeriod[];
  evaluations: Evaluation[];
  reports: PerformanceReport[];
};

export async function loadReleasedDepartmentResults(
  departmentId?: string | null,
  includeReports = false
): Promise<ReleasedDepartmentResults> {
  const periodSnapshot = await getDocs(query(
    collection(db, "evaluationPeriods"),
    where("status", "==", "closed")
  ));
  const periods = periodSnapshot.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EvaluationPeriod, "id">),
    }))
    .sort((a, b) => b.endDate - a.endDate);

  if (periods.length === 0) {
    return { periods, evaluations: [], reports: [] };
  }

  const evaluationSnapshots = await Promise.all(periods.map((period) =>
    getDocs(departmentId ? query(
      collection(db, "evaluations"),
      where("departmentId", "==", departmentId),
      where("periodId", "==", period.id)
    ) : query(collection(db, "evaluations"), where("periodId", "==", period.id)))
  ));
  const evaluations = evaluationSnapshots.flatMap((snapshot) =>
    snapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<Evaluation, "id">),
    }))
  );

  if (!includeReports) {
    return { periods, evaluations, reports: [] };
  }

  const reportSnapshots = await Promise.all(periods.map((period) =>
    getDocs(departmentId ? query(
      collection(db, "performanceReports"),
      where("departmentId", "==", departmentId),
      where("periodId", "==", period.id)
    ) : query(collection(db, "performanceReports"), where("periodId", "==", period.id)))
  ));
  const reports = reportSnapshots.flatMap((snapshot) =>
    snapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PerformanceReport, "id">),
    }))
  );

  return { periods, evaluations, reports };
}
