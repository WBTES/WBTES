"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportRating } from "@/lib/report-ratings";
import type { Department, EvaluationPeriod, Subject, Teacher } from "@/lib/types";

const PAGE_SIZE = 20;

export function FinalizedRatingsTable({ ratings, teachers, subjects, periods, departments, loading }: {
  ratings: ReportRating[];
  teachers: Teacher[];
  subjects: Subject[];
  periods: EvaluationPeriod[];
  departments: Department[];
  loading: boolean;
}) {
  const [page, setPage] = React.useState(0);
  const teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.displayName]));
  const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const periodNames = new Map(periods.map((period) => [period.id, period.name]));
  const departmentNames = new Map(departments.map((department) => [department.id, department.code || department.name]));
  const sorted = [...ratings].sort((a, b) =>
    (teacherNames.get(a.teacherId) ?? a.teacherId).localeCompare(teacherNames.get(b.teacherId) ?? b.teacherId)
    || (subjectNames.get(a.subjectId) ?? a.subjectId).localeCompare(subjectNames.get(b.subjectId) ?? b.subjectId)
    || a.course.localeCompare(b.course) || a.yearLevel.localeCompare(b.yearLevel)
    || (periodNames.get(a.periodId) ?? a.periodId).localeCompare(periodNames.get(b.periodId) ?? b.periodId)
    || a.id.localeCompare(b.id)
  );
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <section aria-label="Finalized ratings" className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Teacher</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Program / Year</th>
            <th className="px-4 py-3">Period</th>
            <th className="px-4 py-3 text-right">Finalized responses</th>
            <th className="px-4 py-3 text-right">Average rating</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">Loading reports...</td></tr>
            : !sorted.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">No finalized responses match these filters.</td></tr>
              : visible.map((row) => <tr key={row.id}>
                <td className="max-w-xs break-words px-4 py-3">
                  <p className="font-medium">{teacherNames.get(row.teacherId) ?? "Archived teacher"}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{departmentNames.get(row.departmentId) ?? "Department unavailable"}</p>
                </td>
                <td className="max-w-xs break-words px-4 py-3">{subjectNames.get(row.subjectId) ?? "Archived subject"}</td>
                <td className="px-4 py-3">{row.course || "Program unavailable"} / {row.yearLevel || "Year unavailable"}</td>
                <td className="max-w-xs break-words px-4 py-3">{periodNames.get(row.periodId) ?? "Archived period"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.responses}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{row.average.toFixed(2)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/ 5</span></td>
              </tr>)}
        </tbody>
      </table>
    </div>
    {!loading && sorted.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span>{ratings.reduce((sum, row) => sum + row.responses, 0)} finalized responses</span>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-live="polite">{currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} rating summaries</span>
        {pages > 1 && <>
          <button type="button" aria-label="Previous rating summaries" title="Previous rating summaries" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="Next rating summaries" title="Next rating summaries" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
        </>}
      </div>
    </div>}
  </section>;
}
