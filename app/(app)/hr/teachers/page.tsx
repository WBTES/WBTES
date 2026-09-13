"use client";

import * as React from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader } from "@/components/data-table";
import type { Department, DepartmentOverview, Teacher } from "@/lib/types";
import { CircleAlert, RefreshCw, Star } from "lucide-react";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";

export default function DeptTeachersPage() {
  const { profile } = useAuth();
  const [dept, setDept] = React.useState<Department | null>(null);
  const [teachers, setTeachers] = React.useState<Array<{
    teacher: Teacher;
    score: number;
    count: number;
    assigned: number;
    submitted: number;
    completion: number;
  }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [noDept, setNoDept] = React.useState(false);
  const [error, setError] = React.useState("");
  const [releasedPeriods, setReleasedPeriods] = React.useState(0);

  const load = React.useCallback(async () => {
    if (!profile || !firebaseReady) return;
    if (profile.role !== "hr" && profile.role !== "admin") return;
    setLoading(true);
    setError("");
    setNoDept(false);
    try {
      const [teacherSnapshot, overviewResponse] = await Promise.all([
        getDocs(collection(db, "teachers")),
        authenticatedFetch("/api/department/overview"),
      ]);
      const overview = await readApiResponse<DepartmentOverview>(overviewResponse);
      setDept(null);
      setReleasedPeriods(overview.releasedPeriods);
      const teacherList = teacherSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Teacher, "id">),
      }));
      const progress = new Map(
        overview.teacherProgress.map((item) => [item.teacherId, item])
      );
      setTeachers(teacherList
        .map((teacher) => {
          const item = progress.get(teacher.id);
          return {
            teacher,
            score: item?.averageRating ?? 0,
            count: item?.releasedEvaluations ?? 0,
            assigned: item?.assignedTasks ?? 0,
            submitted: item?.submittedResponses ?? 0,
            completion: item?.completionRate ?? 0,
          };
        })
        .sort((a, b) => b.score - a.score));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Department teachers could not be loaded.");
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="My Teachers"
        description="School-wide teacher performance overview."
      />

      {error ? (
        <div className="flex flex-col gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center">
          <CircleAlert className="h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">{error}</p>
          <button type="button" onClick={load} className="btn-secondary shrink-0">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : noDept ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          You are not assigned to a department. Ask an administrator to set your department.
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {releasedPeriods === 0 && (
            <div className="border-l-4 border-brand-500 bg-brand-50 p-4 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              Teacher ratings become available after an evaluation period closes.
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {teachers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No teachers yet</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {teachers.map((t, i) => (
                <div key={t.teacher.id} className="flex items-center gap-4 p-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {i + 1}
                  </span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-sm font-semibold text-white dark:text-slate-900 shadow-sm">
                    {t.teacher.displayName?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold">{t.teacher.displayName}</p>
                    <p className="text-xs text-slate-500">{t.teacher.email}</p>
                  </div>
                   <div className="text-right">
                    <p className="inline-flex items-center gap-1 text-lg font-bold text-amber-600">
                      <Star className="h-4 w-4 fill-amber-500" />
                      {t.score > 0 ? t.score.toFixed(2) : "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.count} released evaluation{t.count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">
                      {t.assigned > 0
                        ? `${t.submitted}/${t.assigned} responses (${t.completion}%)`
                        : "No open assignment"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
