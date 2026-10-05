"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsData } from "@/lib/analytics";
import { TeacherRatingChart } from "./teacher-rating-chart";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4", "#a855f7"];
const TICK = { fill: "var(--analytics-axis)", fontSize: 11 };
const GRID = "rgba(148,163,184,0.22)";

export function EvaluationAnalyticsCharts({ data, showPreliminary = false }: { data: AnalyticsData; showPreliminary?: boolean }) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;
  const donutData = data.totalEvaluations ? data.departmentCounts : [{ id: "empty", name: "No responses", evaluations: 1 }];
  return (
    <div className="min-w-0 space-y-4 [--analytics-axis:#64748b] dark:[--analytics-axis:#94a3b8]">
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel title="Average rating by department">
          <div className="h-[280px] min-w-0">
            {data.departmentAverages.length ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.departmentAverages} margin={{ top: 15, right: 12, bottom: 10, left: -20 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={TICK} interval={0} tickFormatter={shortLabel} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={TICK} />
                <Tooltip content={<AnalyticsTooltip suffix=" / 5" />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                <Bar dataKey="average" name="Average rating" radius={[5, 5, 0, 0]} maxBarSize={80} isAnimationActive={animate}>
                  {data.departmentAverages.map((item, index) => <Cell key={item.id} fill={COLORS[index % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer> : <Empty text="No departments available." />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            {data.departmentAverages.map((item) => <span key={item.id}><strong className="text-slate-700 dark:text-slate-200">{item.name}</strong>: {item.average === null ? "Not released" : `${item.average.toFixed(2)} / 5`}</span>)}
          </div>
        </Panel>
        <Panel title="Submitted responses by department">
          <div className="relative h-[280px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} dataKey="evaluations" nameKey="name" innerRadius={65} outerRadius={98} stroke="none" paddingAngle={data.totalEvaluations ? 2 : 0} isAnimationActive={animate}>
                  {donutData.map((item, index) => <Cell key={item.id} fill={data.totalEvaluations ? COLORS[index % COLORS.length] : "#64748b"} />)}
                </Pie>
                {data.totalEvaluations > 0 && <Tooltip content={<AnalyticsTooltip suffix=" responses" />} />}
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <strong className="text-3xl tabular-nums">{data.totalEvaluations}</strong>
              <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">responses</span>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs">
            {data.departmentCounts.map((item, index) => <li key={item.id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="text-slate-600 dark:text-slate-300">{item.name}: <strong>{item.evaluations}</strong></span>
            </li>)}
          </ul>
        </Panel>
        <Panel title="Teacher performance trend">
          <div className="h-[280px] min-w-0">
            {data.trend.some((item) => item.average !== null) ? <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 15, right: 15, bottom: 10, left: -20 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={TICK} tickFormatter={shortLabel} minTickGap={20} />
                <YAxis domain={[0, 5]} tick={TICK} />
                <Tooltip content={<AnalyticsTooltip suffix=" / 5" />} />
                <Line type="monotone" dataKey="average" name="Average rating" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} connectNulls={false} isAnimationActive={animate} />
              </LineChart>
            </ResponsiveContainer> : <Empty text="No released ratings yet." />}
          </div>
        </Panel>
        <Panel title="Completed and pending by department">
          <div className="h-[280px] min-w-0">
            {data.completionByDepartment.length ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.completionByDepartment} margin={{ top: 15, right: 12, bottom: 10, left: -20 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="department" tick={TICK} interval={0} tickFormatter={shortLabel} />
                <YAxis allowDecimals={false} tick={TICK} />
                <Tooltip content={<AnalyticsTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="completed" name="Completed" stackId="status" fill="#10b981" maxBarSize={80} isAnimationActive={animate} />
                <Bar dataKey="pending" name="Pending" stackId="status" fill="#f59e0b" maxBarSize={80} radius={[5, 5, 0, 0]} isAnimationActive={animate} />
              </BarChart>
            </ResponsiveContainer> : <Empty text="No departments available." />}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Counts are assigned evaluation tasks, not unique students.</p>
        </Panel>
      </div>
      <TeacherRatingChart teachers={data.topTeachers} overallAverage={data.averageRating} animate={animate} showPreliminary={showPreliminary} />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5"><h2 className="mb-4 text-sm font-semibold">{title}</h2>{children}</section>;
}

function AnalyticsTooltip({ active, payload, label, suffix = "" }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string | null; color?: string }>;
  label?: React.ReactNode;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return <div className="max-w-[240px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs shadow-xl dark:border-slate-600 dark:bg-slate-950">
    {label !== undefined && <p className="mb-1 break-words font-semibold text-slate-950 dark:text-white">{label}</p>}
    {payload.map((item, index) => <p key={`${item.name}-${index}`} className="mt-1 text-slate-700 dark:text-slate-200"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}: <strong>{item.value === null || item.value === undefined ? "Not released" : `${item.value}${suffix}`}</strong></p>)}
  </div>;
}

function shortLabel(value: string) { return value.length > 18 ? `${value.slice(0, 16)}...` : value; }
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">{text}</div>; }
