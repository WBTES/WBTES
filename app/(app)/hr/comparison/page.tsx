"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LockKeyhole,
  RefreshCw,
  Users,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";
import { PageHeader } from "@/components/data-table";
import type {
  DepartmentOverview,
  Evaluation,
  Subject,
  Teacher,
} from "@/lib/types";
import { loadReleasedDepartmentResults } from "@/lib/firebase/department-results";

type RatingPoint = { name: string; score: number };
type NamedValue = { name: string; value: number };
type ProgressPoint = {
  name: string;
  submitted: number;
  pending: number;
  total: number;
};

const tooltipStyle = {
  background: "rgb(15 23 42)",
  border: "1px solid rgb(51 65 85)",
  borderRadius: 8,
  color: "white",
  fontSize: 12,
};

export default function DeptComparisonPage() {
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [overview, setOverview] = React.useState<DepartmentOverview | null>(null);
  const [teacherProgress, setTeacherProgress] = React.useState<ProgressPoint[]>([]);
  const [teacherRatings, setTeacherRatings] = React.useState<RatingPoint[]>([]);
  const [periodRatings, setPeriodRatings] = React.useState<NamedValue[]>([]);
  const [subjectRatings, setSubjectRatings] = React.useState<NamedValue[]>([]);
  const [noDept, setNoDept] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!firebaseReady || !profile) return;
    if (profile.role !== "hr" && profile.role !== "admin") return;
    setLoading(true);
    setError("");
    setNoDept(false);
    try {
      const [results, teacherSnapshot, subjectSnapshot, overviewResponse] = await Promise.all([
        loadReleasedDepartmentResults(),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
        authenticatedFetch("/api/department/overview"),
      ]);
      const departmentOverview = await readApiResponse<DepartmentOverview>(overviewResponse);
      setOverview(departmentOverview);

      const teachers: Record<string, string> = {};
      teacherSnapshot.docs.forEach((item) => {
        teachers[item.id] = (item.data() as Teacher).displayName;
      });
      setTeacherProgress(
        departmentOverview.teacherProgress
          .filter((item) => teachers[item.teacherId])
          .map((item) => ({
            name: teachers[item.teacherId],
            submitted: item.submittedResponses,
            pending: Math.max(item.assignedTasks - item.submittedResponses, 0),
            total: item.assignedTasks,
          }))
          .sort((a, b) => b.total - a.total || b.submitted - a.submitted)
          .slice(0, 12)
      );

      const evaluations = results.evaluations as Evaluation[];
      const periodNames: Record<string, string> = {};
      results.periods.forEach((period) => {
        periodNames[period.id] = period.name;
      });
      const subjectNames: Record<string, string> = {};
      subjectSnapshot.docs.forEach((item) => {
        subjectNames[item.id] = (item.data() as Subject).name;
      });

      const byTeacher: Record<string, { total: number; count: number }> = {};
      const byPeriod: Record<string, { total: number; count: number }> = {};
      const bySubject: Record<string, { total: number; count: number }> = {};
      evaluations.forEach((evaluation) => {
        if (teachers[evaluation.teacherId]) {
          byTeacher[evaluation.teacherId] ??= { total: 0, count: 0 };
          byTeacher[evaluation.teacherId].total += evaluation.averageScore;
          byTeacher[evaluation.teacherId].count += 1;
        }
        byPeriod[evaluation.periodId] ??= { total: 0, count: 0 };
        byPeriod[evaluation.periodId].total += evaluation.averageScore;
        byPeriod[evaluation.periodId].count += 1;
        bySubject[evaluation.subjectId] ??= { total: 0, count: 0 };
        bySubject[evaluation.subjectId].total += evaluation.averageScore;
        bySubject[evaluation.subjectId].count += 1;
      });

      setTeacherRatings(
        Object.entries(byTeacher)
          .map(([id, item]) => ({
            name: teachers[id],
            score: Number((item.total / item.count).toFixed(2)),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 12)
      );
      setPeriodRatings(Object.entries(byPeriod).map(([id, item]) => ({
        name: periodNames[id] ?? id,
        value: Number((item.total / item.count).toFixed(2)),
      })));
      setSubjectRatings(Object.entries(bySubject).map(([id, item]) => ({
        name: subjectNames[id] ?? id,
        value: Number((item.total / item.count).toFixed(2)),
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Department comparisons could not be loaded.");
      setOverview(null);
      setTeacherProgress([]);
      setTeacherRatings([]);
      setPeriodRatings([]);
      setSubjectRatings([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const panelMotion = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div>
      <PageHeader
        title="Comparisons"
        description="Monitor live participation, then compare released teacher results."
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          You are not assigned to a department. Ask an administrator to set your department.
        </div>
      ) : loading ? (
        <ComparisonSkeleton />
      ) : overview ? (
        <div className="space-y-6">
          <motion.div
            {...panelMotion}
            transition={{ duration: 0.35 }}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Metric
              icon={Activity}
              label="Completion rate"
              value={`${overview.completionRate}%`}
              detail={`${overview.activePeriods} active period${overview.activePeriods === 1 ? "" : "s"}`}
              tone="brand"
            />
            <Metric
              icon={CheckCircle2}
              label="Responses received"
              value={overview.submittedResponses.toLocaleString()}
              detail={`of ${overview.assignedTasks.toLocaleString()} assigned`}
              tone="emerald"
            />
            <Metric
              icon={Clock3}
              label="Pending responses"
              value={overview.pendingTasks.toLocaleString()}
              detail={overview.pendingTasks === 0 ? "All assigned responses received" : "Awaiting submission"}
              tone="amber"
            />
            <Metric
              icon={Users}
              label="Teachers"
              value={overview.teacherCount.toLocaleString()}
              detail={`${overview.teacherProgress.filter((item) => item.assignedTasks > 0).length} with an active assignment`}
              tone="cyan"
            />
          </motion.div>

          <section aria-labelledby="live-progress-title">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Live progress</p>
                <h2 id="live-progress-title" className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                  Current response activity
                </h2>
              </div>
              <p className="text-xs text-slate-500">Updates whenever a student submits an evaluation.</p>
            </div>

            {overview.assignedTasks === 0 ? (
              <EmptyProgress />
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
                <motion.div {...panelMotion} transition={{ duration: 0.4, delay: 0.05 }}>
                  <ProgressChart data={teacherProgress} reduceMotion={Boolean(reduceMotion)} />
                </motion.div>
                <motion.div {...panelMotion} transition={{ duration: 0.4, delay: 0.1 }}>
                  <ResponseDonut overview={overview} reduceMotion={Boolean(reduceMotion)} />
                </motion.div>
              </div>
            )}
          </section>

          <section aria-labelledby="released-results-title">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Released results</p>
              <h2 id="released-results-title" className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                Rating comparisons
              </h2>
            </div>
            {overview.releasedPeriods === 0 ? (
              <motion.div
                {...panelMotion}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <LockKeyhole className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-950 dark:text-white">Ratings are protected until the period closes</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                    When an administrator closes an evaluation period, teacher, period, and subject comparison charts appear here automatically. Live completion counts remain available above without exposing student identities or answers.
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <RatingChart title="Teachers (top 12)" data={teacherRatings} dataKey="score" color="#3366ff" reduceMotion={Boolean(reduceMotion)} />
                <RatingChart title="By period" data={periodRatings} dataKey="value" color="#10b981" reduceMotion={Boolean(reduceMotion)} />
                <RatingChart title="By subject" data={subjectRatings} dataKey="value" color="#f59e0b" reduceMotion={Boolean(reduceMotion)} />
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

type MetricTone = "brand" | "emerald" | "amber" | "cyan";

const metricTones: Record<MetricTone, string> = {
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
};

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${metricTones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function ProgressChart({ data, reduceMotion }: { data: ProgressPoint[]; reduceMotion: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold">Completion by teacher</h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-500" />Received</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400" />Pending</span>
        </div>
      </div>
      <div className="h-[302px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 22, right: 20, bottom: 12, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              tickFormatter={(value: string) => value.length > 14 ? `${value.slice(0, 12)}...` : value}
              axisLine={false}
              tickLine={false}
              interval={0}
              height={42}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="submitted"
              name="Received"
              stroke="#3366ff"
              strokeWidth={3}
              dot={{ r: 4, fill: "#3366ff", strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              isAnimationActive={!reduceMotion}
              animationDuration={850}
            />
            <Line
              type="monotone"
              dataKey="pending"
              name="Pending"
              stroke="#fbbf24"
              strokeWidth={3}
              strokeDasharray="6 5"
              dot={{ r: 4, fill: "#fbbf24", strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ResponseDonut({ overview, reduceMotion }: { overview: DepartmentOverview; reduceMotion: boolean }) {
  const data = [
    { name: "Received", value: overview.submittedResponses, color: "#10b981" },
    { name: "Pending", value: overview.pendingTasks, color: "#fbbf24" },
  ].filter((item) => item.value > 0);

  return (
    <div className="h-full rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-semibold">Response status</h3>
      </div>
      <div className="relative mx-auto h-[230px] max-w-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={92}
              paddingAngle={overview.pendingTasks > 0 ? 3 : 0}
              stroke="none"
              isAnimationActive={!reduceMotion}
              animationDuration={900}
            >
              {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-3xl text-slate-950 dark:text-white">{overview.completionRate}%</strong>
          <span className="mt-1 text-xs text-slate-500">complete</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
        <div>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{overview.submittedResponses}</p>
          <p className="text-xs text-slate-500">Received</p>
        </div>
        <div>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{overview.pendingTasks}</p>
          <p className="text-xs text-slate-500">Pending</p>
        </div>
      </div>
    </div>
  );
}

function RatingChart({
  title,
  data,
  dataKey,
  color,
  reduceMotion,
}: {
  title: string;
  data: Array<RatingPoint | NamedValue>;
  dataKey: "score" | "value";
  color: string;
  reduceMotion: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {data.length === 0 ? (
        <div className="flex h-60 items-center justify-center text-sm text-slate-500">No released ratings in this group.</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} contentStyle={tooltipStyle} />
            <Bar dataKey={dataKey} name="Average rating" fill={color} radius={[6, 6, 0, 0]} isAnimationActive={!reduceMotion} animationDuration={850} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function EmptyProgress() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/60">
      <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <div>
        <h3 className="font-semibold text-slate-900 dark:text-white">No active evaluation assignments</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
          Charts will start filling as soon as an administrator assigns teachers and students to an open period.
        </p>
      </div>
    </div>
  );
}

function ComparisonSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading comparison data">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <div className="h-80 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-80 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
