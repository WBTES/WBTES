"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles, Star } from "lucide-react";
import { buildPerformanceAnalysis } from "@/lib/performance-analysis";
import type { Evaluation, EvaluationPeriod, PerformanceReport, Subject, Teacher } from "@/lib/types";

const PAGE_SIZE = 6;

export function GeneratedPerformanceAnalysis({ reports, evaluations, teachers, subjects, periods }: {
  reports: PerformanceReport[];
  evaluations: Evaluation[];
  teachers: Teacher[];
  subjects: Subject[];
  periods: EvaluationPeriod[];
}) {
  const [page, setPage] = React.useState(0);
  const groups = React.useMemo(() => buildPerformanceAnalysis(reports, evaluations).sort((a, b) =>
    b.average - a.average || (teachers.find((teacher) => teacher.id === a.teacherId)?.displayName ?? "Teacher")
      .localeCompare(teachers.find((teacher) => teacher.id === b.teacherId)?.displayName ?? "Teacher")
  ), [reports, evaluations, teachers]);
  if (!groups.length) return null;
  const pages = Math.ceil(groups.length / PAGE_SIZE);
  const currentPage = Math.min(page, pages - 1);
  const visible = groups.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <section aria-label="Generated performance analysis" className="mb-5 border-y border-slate-200 py-5 dark:border-slate-800">
    <div className="mb-4 flex items-center gap-2">
      <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
      <h2 className="text-sm font-semibold">Generated performance analysis</h2>
    </div>
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {visible.map((group) => <article key={group.teacherId} data-teacher-analysis={group.teacherId} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold">{teachers.find((teacher) => teacher.id === group.teacherId)?.displayName ?? "Teacher"}</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{group.responses} finalized {group.responses === 1 ? "response" : "responses"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Finalized average</p>
            <p className="mt-1 flex items-center justify-end gap-1.5 text-xl font-semibold tabular-nums"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{group.average.toFixed(2)}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/ 5</span></p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {group.reports.map(({ report, average, responses, stale }) => <details key={report.id} className="group py-3">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{subjects.find((subject) => subject.id === report.subjectId)?.name ?? "Subject"}</p>
                <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{periods.find((period) => period.id === report.periodId)?.name ?? "Period"}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{responses} finalized {responses === 1 ? "response" : "responses"} <span aria-hidden="true">/</span> Subject average: {average.toFixed(2)} / 5</p>
              </div>
              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            {stale ? <p role="status" className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Saved analysis is out of date. Select this period and regenerate analysis. The rating above uses the current finalized responses.</p> : <>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 dark:text-slate-400">{report.summary}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <AnalysisList title="Strengths" items={report.strengths} />
                <AnalysisList title="Weaknesses" items={report.weaknesses ?? []} />
                <AnalysisList title="Recommendations" items={report.recommendations} />
              </div>
              {report.graphInsights.length > 0 && <div className="mt-4"><AnalysisList title="Graph insights" items={report.graphInsights} /></div>}
              {report.commentAnalysis && <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="break-words text-xs text-slate-500 dark:text-slate-400">{report.commentAnalysis.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.commentAnalysis.themes.slice(0, 5).map((theme) => <span key={theme.name} className="max-w-full break-words rounded-md border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700">{theme.name} ({theme.count})</span>)}
                </div>
              </div>}
            </>}
          </details>)}
        </div>
      </article>)}
    </div>
    {pages > 1 && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span aria-live="polite">{currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, groups.length)} of {groups.length} teachers</span>
      <button type="button" aria-label="Previous teacher analyses" title="Previous teacher analyses" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
      <button type="button" aria-label="Next teacher analyses" title="Next teacher analyses" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
    </div>}
  </section>;
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return <div className="min-w-0">
    <p className="text-[11px] font-semibold uppercase text-slate-500">{title}</p>
    <ul className="mt-1.5 space-y-1 break-words text-xs text-slate-600 dark:text-slate-400">
      {items.length === 0 ? <li>None identified</li> : items.slice(0, 4).map((item) => <li key={item}>- {item}</li>)}
    </ul>
  </div>;
}
