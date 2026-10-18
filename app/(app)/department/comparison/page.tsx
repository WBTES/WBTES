"use client";

import * as React from "react";
import { BarChart3, CircleAlert, RefreshCw } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader } from "@/components/data-table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Evaluation, Teacher, Subject } from "@/lib/types";
import { loadReleasedDepartmentResults } from "@/lib/firebase/department-results";

export default function DeptComparisonPage() {
  const { profile } = useAuth();
  const [data, setData] = React.useState<{ name: string; score: number }[]>([]);
  const [periods, setPeriods] = React.useState<{ name: string; value: number }[]>([]);
  const [subjects, setSubjects] = React.useState<{ name: string; value: number }[]>([]);
  const [noDept, setNoDept] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [releasedPeriods, setReleasedPeriods] = React.useState(0);

  const load = React.useCallback(async () => {
    if (!firebaseReady || !profile) return;
    if (profile.role !== "department_head" && profile.role !== "admin") return;
    setLoading(true);
    setError("");
    setNoDept(false);
    const deptId = profile.departmentId;
    if (!deptId) {
      setNoDept(true);
      setLoading(false);
      return;
    }
    try {
      const [results, teacherSnapshot, subjectSnapshot] = await Promise.all([
        loadReleasedDepartmentResults(deptId),
        getDocs(query(collection(db, "teachers"), where("departmentId", "==", deptId))),
        getDocs(query(collection(db, "subjects"), where("departmentId", "==", deptId))),
      ]);
      setReleasedPeriods(results.periods.length);
      const evals = results.evaluations as Evaluation[];
      const teachers: Record<string, string> = {};
      teacherSnapshot.docs.forEach((item) => {
        teachers[item.id] = (item.data() as Teacher).displayName;
      });
      const pMap: Record<string, string> = {};
      results.periods.forEach((period) => { pMap[period.id] = period.name; });
      const sMap: Record<string, string> = {};
      subjectSnapshot.docs.forEach((item) => {
        sMap[item.id] = (item.data() as Subject).name;
      });

      // Per teacher (only teachers in this dept)
      const tGroup: Record<string, { total: number; count: number }> = {};
      for (const e of evals) {
        if (!teachers[e.teacherId]) continue; // skip teachers outside this dept
        if (!tGroup[e.teacherId]) tGroup[e.teacherId] = { total: 0, count: 0 };
        tGroup[e.teacherId].total += e.averageScore;
        tGroup[e.teacherId].count += 1;
      }
      setData(
        Object.entries(tGroup)
          .map(([id, v]) => ({ name: teachers[id] ?? "Unknown", score: +(v.total / v.count).toFixed(2) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 12)
      );

      // Per period
      const pGroup: Record<string, { total: number; count: number }> = {};
      for (const e of evals) {
        if (!pGroup[e.periodId]) pGroup[e.periodId] = { total: 0, count: 0 };
        pGroup[e.periodId].total += e.averageScore;
        pGroup[e.periodId].count += 1;
      }
      setPeriods(Object.entries(pGroup).map(([id, v]) => ({ name: pMap[id] ?? id, value: +(v.total / v.count).toFixed(2) })));

      // Per subject
      const sGroup: Record<string, { total: number; count: number }> = {};
      for (const e of evals) {
        if (!sGroup[e.subjectId]) sGroup[e.subjectId] = { total: 0, count: 0 };
        sGroup[e.subjectId].total += e.averageScore;
        sGroup[e.subjectId].count += 1;
      }
      setSubjects(Object.entries(sGroup).map(([id, v]) => ({ name: sMap[id] ?? id, value: +(v.total / v.count).toFixed(2) })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Department comparisons could not be loaded.");
      setData([]);
      setPeriods([]);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Comparisons" description="Compare teachers, periods, and subjects side by side." />
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
        <div className="space-y-5">
          {releasedPeriods === 0 && (
            <div className="border-l-4 border-brand-500 bg-brand-50 p-4 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              Comparisons become available after an evaluation period closes.
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <Chart title="Teachers (top 12)" data={data} dataKey="score" nameKey="name" color="#3366ff" />
            <Chart title="By period" data={periods} dataKey="value" nameKey="name" color="#10b981" />
            <Chart title="By subject" data={subjects} dataKey="value" nameKey="name" color="#f59e0b" />
          </div>
        </div>
      )}
    </div>
  );
}

function Chart({ title, data, dataKey, nameKey, color }: { title: string; data: any[]; dataKey: string; nameKey: string; color: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {data.length === 0 ? (
        <div className="flex h-60 items-center justify-center text-sm text-slate-500">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
            <XAxis dataKey={nameKey} tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
            <Tooltip cursor={false} contentStyle={{ background: "rgb(15 23 42)", border: "none", borderRadius: 8, color: "white" }} />
            <Bar dataKey={dataKey} fill={color} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
