"use client";

import * as React from "react";
import { BarChart3, ChevronLeft, ChevronRight, Clock3, Search, Star } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsData } from "@/lib/analytics";

type TeacherRating = AnalyticsData["topTeachers"][number];
type RankedTeacher = TeacherRating & { average: number; rank: number; submittedResponses?: number };
const PAGE_SIZE = 8;

export function TeacherRatingChart({ teachers, overallAverage, animate, showPreliminary = false }: {
  teachers: TeacherRating[];
  overallAverage: number | null;
  animate: boolean;
  showPreliminary?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [preliminaryPage, setPreliminaryPage] = React.useState(0);
  const ranked = React.useMemo(() => {
    const sorted = teachers
      .filter((teacher): teacher is TeacherRating & { average: number } => teacher.average !== null && Number.isFinite(teacher.average) && teacher.average >= 1 && teacher.average <= 5)
      .sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));
    let rank = 0;
    return sorted.map((teacher, index) => {
      if (index === 0 || teacher.average !== sorted[index - 1].average) rank = index + 1;
      return { ...teacher, rank };
    });
  }, [teachers]);
  const releasedIds = new Set(ranked.map((teacher) => teacher.id));
  const awaiting = teachers.filter((teacher) => !releasedIds.has(teacher.id));
  const matchesSearch = (teacher: TeacherRating) => teacher.name.toLowerCase().includes(search.trim().toLowerCase());
  const filtered = ranked.filter(matchesSearch);
  const filteredAwaiting = awaiting.filter(matchesSearch);
  const preliminary = showPreliminary ? filteredAwaiting
    .filter((teacher) => teacher.preliminaryAverage !== null && teacher.preliminaryAverage !== undefined && Number.isFinite(teacher.preliminaryAverage) && teacher.preliminaryAverage >= 1 && teacher.preliminaryAverage <= 5 && (teacher.preliminaryResponses ?? 0) > 0)
    .map((teacher) => ({ ...teacher, average: teacher.preliminaryAverage!, rank: 0, responses: teacher.preliminaryResponses!, submittedResponses: teacher.responses })) : [];
  const preliminaryIds = new Set(preliminary.map((teacher) => teacher.id));
  const awaitingWithoutScore = filteredAwaiting.filter((teacher) => !preliminaryIds.has(teacher.id));
  const hasOverallAverage = overallAverage !== null && Number.isFinite(overallAverage) && overallAverage >= 1 && overallAverage <= 5;

  return <section aria-label="Top teachers by average rating" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5 [--rating-axis:#64748b] [--rating-text:#0f172a] [--rating-track:#f1f5f9] dark:[--rating-axis:#94a3b8] dark:[--rating-text:#f8fafc] dark:[--rating-track:#1e293b]">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 shrink-0 text-brand-500" /> Top teachers by average rating</h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{teachers.length} evaluated {teachers.length === 1 ? "teacher" : "teachers"} <span className="mx-2" aria-hidden="true">/</span> {ranked.length} released <span className="mx-2" aria-hidden="true">/</span> {awaiting.length} awaiting release</p>
      </div>
      <div className="shrink-0 sm:text-right">
        <p className="text-xs text-slate-500 dark:text-slate-400">Overall released average</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums sm:justify-end"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /> {hasOverallAverage ? overallAverage.toFixed(2) : "--"}<span className="text-sm font-normal text-slate-500 dark:text-slate-400">/ 5</span></p>
      </div>
    </div>

    <div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Released rating</span>
        {ranked.length > 0 && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Highest average</span>}
        {hasOverallAverage && <span className="inline-flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-amber-500" /> Overall average</span>}
      </div>
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="search" aria-label="Search teachers" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setPreliminaryPage(0); }} placeholder="Search teacher" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950" />
      </div>
    </div>

    {filtered.length > 0 ? <RatingPlot teachers={filtered} overallAverage={overallAverage} animate={animate} page={page} onPageChange={setPage} /> : <div className="flex min-h-36 items-center justify-center py-8 text-sm text-slate-500 dark:text-slate-400">{search.trim() ? "No released ratings match this teacher." : teachers.length ? "No released teacher ratings yet." : "No teachers evaluated yet."}</div>}

    {filteredAwaiting.length > 0 && <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><Clock3 className="h-4 w-4 text-amber-500" /> Awaiting release ({filteredAwaiting.length})</h3>
      {preliminary.length > 0 && <>
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Preliminary averages - submitted responses only, not final ratings</p>
        <RatingPlot teachers={preliminary} preliminary animate={animate} page={preliminaryPage} onPageChange={setPreliminaryPage} />
      </>}
      {awaitingWithoutScore.length > 0 && <>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Teachers awaiting rating release">
          {awaitingWithoutScore.map((teacher) => <li key={teacher.id} className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-100 py-3 dark:border-slate-800">
            <p className="min-w-0 break-words text-sm font-medium">{teacher.name}</p>
            <span className="shrink-0 text-right text-xs text-slate-500 dark:text-slate-400"><strong className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{teacher.responses}</strong><br />{teacher.responses === 1 ? "response" : "responses"}</span>
          </li>)}
        </ul>
        {showPreliminary && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No rated responses available for these teachers.</p>}
      </>}
    </div>}
  </section>;
}

function RatingPlot({ teachers, overallAverage = null, animate, page, onPageChange, preliminary = false }: {
  teachers: RankedTeacher[];
  overallAverage?: number | null;
  animate: boolean;
  page: number;
  onPageChange: (page: number) => void;
  preliminary?: boolean;
}) {
  const [axisWidth, setAxisWidth] = React.useState(130);
  const pages = Math.max(1, Math.ceil(teachers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = teachers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hasOverallAverage = overallAverage !== null && Number.isFinite(overallAverage) && overallAverage >= 1 && overallAverage <= 5;
  return <>
    <div aria-label={preliminary ? "Preliminary teacher averages from 1 to 5" : "Released teacher ratings from 1 to 5"} data-rating-status={preliminary ? "preliminary" : "released"} className="mt-3 min-w-0" style={{ height: Math.max(160, visible.length * 64 + 54) }}>
      <ResponsiveContainer width="100%" height="100%" onResize={(width) => setAxisWidth(width < 520 ? 115 : width < 800 ? 180 : 230)}>
        <BarChart layout="vertical" data={visible} margin={{ top: 8, right: 44, bottom: 5, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke="rgba(148,163,184,0.22)" strokeDasharray="3 4" horizontal={false} />
          <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} axisLine={false} tickLine={false} tick={{ fill: "var(--rating-axis)", fontSize: 11 }} height={28} />
          <YAxis type="category" dataKey="id" width={axisWidth} axisLine={false} tickLine={false} interval={0} tick={<TeacherTick teachers={visible} width={axisWidth} preliminary={preliminary} />} />
          {hasOverallAverage && <ReferenceLine x={overallAverage} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />}
          <Tooltip content={<TeacherTooltip preliminary={preliminary} />} cursor={{ fill: "rgba(148,163,184,0.07)" }} />
          <Bar dataKey="average" name={preliminary ? "Preliminary average" : "Average rating"} radius={[0, 5, 5, 0]} maxBarSize={20} background={{ fill: "var(--rating-track)", radius: 5 }} isAnimationActive={animate} animationDuration={650}>
            {visible.map((teacher) => <Cell key={teacher.id} fill={preliminary ? "#f59e0b" : teacher.rank === 1 ? "#10b981" : "#3b82f6"} />)}
            <LabelList dataKey="average" position="right" offset={8} formatter={(value: number) => value.toFixed(2)} fill="var(--rating-text)" fontSize={12} fontWeight={600} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
      <p>{preliminary ? "Preliminary average / 5" : "Average rating / 5"}</p>
      <div className="flex items-center gap-2">
        <span aria-live="polite">{currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, teachers.length)} of {teachers.length} {preliminary ? "awaiting" : "released"} {teachers.length === 1 ? "teacher" : "teachers"}</span>
        {pages > 1 && <>
          <button type="button" aria-label={preliminary ? "Previous awaiting teachers" : "Previous teachers"} title={preliminary ? "Previous awaiting teachers" : "Previous teachers"} disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label={preliminary ? "Next awaiting teachers" : "Next teachers"} title={preliminary ? "Next awaiting teachers" : "Next teachers"} disabled={currentPage === pages - 1} onClick={() => onPageChange(currentPage + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
        </>}
      </div>
    </div>
  </>;
}

function TeacherTick({ x = 0, y = 0, payload, teachers, width, preliminary }: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  teachers: RankedTeacher[];
  width: number;
  preliminary?: boolean;
}) {
  const teacher = teachers.find((item) => item.id === payload?.value);
  if (!teacher) return null;
  const nameLimit = Math.max(12, Math.floor((width - 30) / 6.5));
  const words = teacher.name.split(/\s+/);
  let firstLine = words.shift() ?? "Teacher";
  while (words.length && `${firstLine} ${words[0]}`.length <= nameLimit) firstLine += ` ${words.shift()}`;
  const secondLine = words.join(" ");
  const shorten = (value: string) => value.length > nameLimit ? `${value.slice(0, nameLimit - 3)}...` : value;
  return <g transform={`translate(${x - 10},${y})`}>
    <title>{teacher.name}: {preliminary ? "Preliminary " : ""}{teacher.average.toFixed(2)} / 5, {teacher.responses} {preliminary ? "rated" : "submitted"} responses</title>
    <text textAnchor="end" fill="var(--rating-text)" fontSize={12} fontWeight={600}>
      <tspan x={0} dy={secondLine ? -17 : -9}>{preliminary ? "" : `#${teacher.rank} `}{shorten(firstLine)}</tspan>
      {secondLine && <tspan x={0} dy={16}>{shorten(secondLine)}</tspan>}
      <tspan x={0} dy={18} fill="var(--rating-axis)" fontSize={11} fontWeight={400}>{teacher.responses} {teacher.responses === 1 ? "response" : "responses"}</tspan>
    </text>
  </g>;
}

function TeacherTooltip({ active, payload, preliminary }: { active?: boolean; payload?: Array<{ payload?: RankedTeacher }>; preliminary?: boolean }) {
  const teacher = payload?.[0]?.payload;
  if (!active || !teacher) return null;
  return <div className="max-w-[240px] rounded-lg border border-slate-300 bg-white p-3 shadow-xl dark:border-slate-600 dark:bg-slate-950">
    <p className="break-words text-sm font-semibold text-slate-950 dark:text-white">{teacher.name}</p>
    {preliminary && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Preliminary - not final</p>}
    <p className="mt-2 flex items-center gap-2 text-xl font-bold tabular-nums text-slate-950 dark:text-white"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {teacher.average.toFixed(2)}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/ 5</span></p>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{teacher.responses} {preliminary ? "rated" : "submitted"} {teacher.responses === 1 ? "response" : "responses"}</p>
    {preliminary && teacher.submittedResponses !== undefined && teacher.submittedResponses !== teacher.responses && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{teacher.submittedResponses} submitted responses in total</p>}
  </div>;
}
