"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Building2,
  ClipboardList,
  Megaphone,
  Star,
  BarChart3,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  Clock3,
  CircleAlert,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";
import { collection, getCountFromServer, query, where, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import type { DepartmentOverview, Evaluation, EvaluationCompletion, EvaluationPeriod, TeacherAssignment } from "@/lib/types";
import { AnnouncementFeed, useVisibleAnnouncements } from "@/components/announcement-feed";
import { fmtDateTime, fmtRelative } from "@/lib/utils-extras";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";

export default function DashboardOverview() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = React.useState<Record<string, number | string>>({});
  const [loadingStats, setLoadingStats] = React.useState(true);
  const [statsError, setStatsError] = React.useState("");

  React.useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  const loadStats = React.useCallback(async () => {
    if (!profile) return;
    setLoadingStats(true);
    setStatsError("");
    try {
      if (profile.role === "admin") {
        // Run each count independently so one failure doesn't break all stats
        const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
          try { return await p; } catch (e) { console.warn("stat load failed:", e); return fallback; }
        };
        const [users, teachers, students, depts, periods, evals] = await Promise.all([
          safe(getCountFromServer(collection(db, "users")), { data: () => ({ count: 0 }) } as any),
          safe(getCountFromServer(collection(db, "teachers")), { data: () => ({ count: 0 }) } as any),
          safe(getCountFromServer(query(collection(db, "users"), where("role", "==", "student"))), { data: () => ({ count: 0 }) } as any),
          safe(getCountFromServer(collection(db, "departments")), { data: () => ({ count: 0 }) } as any),
          safe(getCountFromServer(collection(db, "evaluationPeriods")), { data: () => ({ count: 0 }) } as any),
          safe(getCountFromServer(collection(db, "evaluations")), { data: () => ({ count: 0 }) } as any),
        ]);
        const evalCount = evals.data().count;
        // Compute average rating + completion in a single pass
        let totalScore = 0;
        let totalSlots = 0;
        let completedStudents = 0;
        let pendingStudents = 0;
        let completedSlots = 0;
        try {
          const [evalsSnap, assignsSnap, completionSnap] = await Promise.all([
            getDocs(collection(db, "evaluations")),
            getDocs(collection(db, "teacherAssignments")),
            getDocs(collection(db, "evaluationCompletions")),
          ]);
          const slots = new Map<string, { studentId: string; completed: boolean }>();
          evalsSnap.forEach((d) => {
            const data = d.data() as Evaluation;
            if (typeof data.averageScore === "number") totalScore += data.averageScore;
          });
          assignsSnap.forEach((d) => {
            const data = d.data() as TeacherAssignment;
            if (!Array.isArray(data.studentIds)) return;
            data.studentIds.forEach((studentId) => {
              const key = `${studentId}_${d.id}`;
              if (!slots.has(key)) {
                slots.set(key, { studentId, completed: false });
              }
            });
          });
          completionSnap.forEach((d) => {
            const completion = d.data() as EvaluationCompletion;
            const slot = slots.get(
              `${completion.studentId}_${completion.assignmentId}`
            );
            if (slot) slot.completed = true;
          });
          totalSlots = slots.size;
          completedSlots = [...slots.values()].filter((slot) => slot.completed).length;
          const progress = new Map<string, { assigned: number; completed: number }>();
          slots.forEach((slot) => {
            const item = progress.get(slot.studentId) ?? { assigned: 0, completed: 0 };
            item.assigned += 1;
            if (slot.completed) item.completed += 1;
            progress.set(slot.studentId, item);
          });
          completedStudents = [...progress.values()].filter(
            (item) => item.assigned > 0 && item.completed === item.assigned
          ).length;
          pendingStudents = [...progress.values()].filter(
            (item) => item.completed < item.assigned
          ).length;
        } catch (e) {
          console.warn("admin avg/completion calc failed:", e);
        }
        const avg = evalCount > 0 ? (totalScore / evalCount).toFixed(2) : "—";
        const completion = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;
        setStats({
          users: users.data().count,
          teachers: teachers.data().count,
          students: students.data().count,
          depts: depts.data().count,
          periods: periods.data().count,
          evaluations: evalCount,
          avg,
          completion,
          completedStudents,
          pendingStudents,
        });
      } else if (profile.role === "student") {
        const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
          try { return await p; } catch (e) { console.warn("stat load failed:", e); return fallback; }
        };
        const [assignmentsSnapshot, completionSnapshot, periodsSnapshot] = await Promise.all([
          safe(getDocs(query(collection(db, "teacherAssignments"), where("studentIds", "array-contains", user!.uid))), null),
          safe(getDocs(query(collection(db, "evaluationCompletions"), where("studentId", "==", user!.uid))), null),
          safe(getDocs(collection(db, "evaluationPeriods")), null),
        ]);
        const assignments = assignmentsSnapshot?.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TeacherAssignment, "id">),
        })) ?? [];
        const completions = completionSnapshot?.docs.map((item) => item.data() as EvaluationCompletion) ?? [];
        const periods = new Map<string, EvaluationPeriod>();
        periodsSnapshot?.docs.forEach((item) => periods.set(item.id, {
          id: item.id,
          ...(item.data() as Omit<EvaluationPeriod, "id">),
        }));
        const completedAssignmentIds = new Set(completions.map((completion) => completion.assignmentId));
        const openAssignments = assignments.filter((assignment) => periods.get(assignment.periodId)?.status === "open");
        const pendingAssignments = openAssignments.filter((assignment) =>
          !completedAssignmentIds.has(assignment.id)
        );
        const activePeriods = pendingAssignments
          .map((assignment) => periods.get(assignment.periodId))
          .filter((period): period is EvaluationPeriod => Boolean(period))
          .sort((a, b) => a.endDate - b.endDate);
        setStats({
          pending: pendingAssignments.length,
          completed: completions.length,
          currentTotal: openAssignments.length,
          currentCompleted: openAssignments.length - pendingAssignments.length,
          deadline: activePeriods[0]?.endDate ?? 0,
          periodName: activePeriods[0]?.name ?? "",
        });
      } else if (profile.role === "department_head" || profile.role === "hr") {
        try {
          const response = await authenticatedFetch("/api/department/overview");
          const overview = await readApiResponse<DepartmentOverview>(response);
          setStats({
            teachers: overview.teacherCount,
            evaluations: overview.releasedEvaluations,
            activePeriods: overview.activePeriods,
            closedPeriods: overview.releasedPeriods,
            assignedTasks: overview.assignedTasks,
            responses: overview.submittedResponses,
            pendingTasks: overview.pendingTasks,
            completion: overview.completionRate,
            avg: overview.releasedEvaluations === 0
              ? "--"
              : overview.averageRating === null
                ? "Protected"
                : overview.averageRating.toFixed(2),
            releasedPeriods: overview.releasedPeriods,
          });
        } catch (e) {
          console.warn("HR dashboard stat load failed:", e);
          setStatsError(e instanceof Error ? e.message : "Department statistics could not be loaded.");
        }
      }
    } catch (e) {
      console.error("dashboard stats error:", e);
      if (profile.role === "department_head" || profile.role === "hr") {
        setStatsError(e instanceof Error ? e.message : "Department statistics could not be loaded.");
      }
    } finally {
      setLoadingStats(false);
    }
  }, [profile, user]);

  React.useEffect(() => {
    if (!profile || !firebaseReady) return;
    loadStats();
  }, [profile, loadStats]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome back, {profile.displayName?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {profile.role === "admin" && "Manage your school, run evaluations, and review insights."}
          {profile.role === "student" && "Complete your pending teacher evaluations."}
          {profile.role === "department_head" && "Monitor school-wide outcomes and privacy-protected feedback trends."}
          {profile.role === "hr" && "Review school-wide results and anonymous student feedback."}
        </p>
      </div>

      {!firebaseReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">Firebase isn&apos;t configured yet</p>
              <p className="mt-1 text-sm">
                Copy <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">.env.example</code> to{" "}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-500/20">.env.local</code> and fill in your Firebase credentials to enable the full platform.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Role-specific overview content */}
      {profile.role === "admin" && <AdminOverview stats={stats} loading={loadingStats} />}
      {profile.role === "student" && <StudentOverview stats={stats} loading={loadingStats} />}
      {profile.role === "department_head" && (
        <DeptHeadOverview
          stats={stats}
          loading={loadingStats}
          error={statsError}
          onRetry={loadStats}
        />
      )}
      {profile.role === "hr" && (
        <DeptHeadOverview
          stats={stats}
          loading={loadingStats}
          error={statsError}
          onRetry={loadStats}
          detailed
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, iconBg }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; iconBg: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-900 dark:hover:border-slate-700">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function AdminOverview({ stats, loading }: { stats: Record<string, number | string>; loading: boolean }) {
  const quickLinks = [
    { href: "/admin/users", label: "Manage users", icon: Users, iconBg: "bg-slate-900 dark:bg-white text-white dark:text-slate-900" },
    { href: "/admin/periods", label: "Open evaluation period", icon: Calendar, iconBg: "bg-brand-600 text-white" },
    { href: "/admin/announcements", label: "Post announcement", icon: Megaphone, iconBg: "bg-emerald-600 text-white" },
    { href: "/admin/analytics", label: "View analytics", icon: BarChart3, iconBg: "bg-slate-800 dark:bg-slate-700 text-white" },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={loading ? "..." : stats.students ?? 0} icon={Users} iconBg="bg-emerald-600 text-white" />
        <StatCard label="Teachers" value={loading ? "..." : stats.teachers ?? 0} icon={Users} iconBg="bg-brand-600 text-white" />
        <StatCard label="Departments" value={loading ? "..." : stats.depts ?? 0} icon={Building2} iconBg="bg-slate-800 dark:bg-slate-700 text-white" />
        <StatCard label="Evaluations" value={loading ? "..." : stats.evaluations ?? 0} icon={ClipboardList} iconBg="bg-slate-900 dark:bg-white text-white dark:text-slate-900" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students completed" value={loading ? "..." : stats.completedStudents ?? 0} icon={CheckCircle2} iconBg="bg-emerald-600 text-white" />
        <StatCard label="Students pending" value={loading ? "..." : stats.pendingStudents ?? 0} icon={Clock3} iconBg="bg-amber-500 text-white" />
        <StatCard label="Completion rate" value={loading ? "..." : `${stats.completion ?? 0}%`} icon={BarChart3} iconBg="bg-brand-600 text-white" />
        <StatCard label="Average rating" value={loading ? "..." : stats.avg ?? "—"} icon={Star} iconBg="bg-slate-800 dark:bg-slate-700 text-white" />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Quick actions</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Jump into common admin tasks.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 p-4 transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-800/80 dark:hover:border-slate-700"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${q.iconBg}`}>
                <q.icon className="h-5 w-5" />
              </div>
              <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{q.label}</span>
              <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function StudentOverview({ stats, loading }: { stats: Record<string, number | string>; loading: boolean }) {
  const { profile } = useAuth();
  const { announcements, loading: loadingAnnouncements } = useVisibleAnnouncements(profile);
  const pending = Number(stats.pending ?? 0);
  const currentTotal = Number(stats.currentTotal ?? 0);
  const currentCompleted = Number(stats.currentCompleted ?? 0);
  const deadline = Number(stats.deadline ?? 0);
  const progress = currentTotal > 0 ? Math.round((currentCompleted / currentTotal) * 100) : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Pending evaluations" value={loading ? "..." : stats.pending ?? 0} icon={ClipboardList} iconBg="bg-brand-600 text-white" />
        <StatCard label="Completed" value={loading ? "..." : stats.completed ?? 0} icon={CheckCircle2} iconBg="bg-emerald-600 text-white" />
      </div>

      {!loading && pending > 0 ? (
        <section className="border-l-4 border-brand-600 bg-white px-5 py-5 shadow-sm dark:bg-slate-900 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Clock3 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Evaluation required</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {pending} teacher {pending === 1 ? "evaluation is" : "evaluations are"} waiting for your feedback.
              </p>
              {deadline > 0 && (
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {stats.periodName} · closes {fmtRelative(deadline)} ({fmtDateTime(deadline)})
                </p>
              )}
              <div className="mt-3 max-w-md">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{currentCompleted} of {currentTotal} completed</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            <Link href="/student/evaluations" className="btn-primary shrink-0 justify-center">
              Start evaluation <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : !loading ? (
        <section className="flex items-center gap-3 border-l-4 border-emerald-500 bg-white px-5 py-4 shadow-sm dark:bg-slate-900">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">You are up to date</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">There are no open evaluations waiting for you.</p>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Announcements</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Current notices for you and your class.</p>
          </div>
          <Link href="/student/announcements" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {loadingAnnouncements ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ) : announcements.length > 0 ? (
          <AnnouncementFeed announcements={announcements.slice(0, 3)} compact />
        ) : (
          <div className="border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No active announcements
          </div>
        )}
      </section>
    </>
  );
}


function DeptHeadOverview({
  stats,
  loading,
  error,
  onRetry,
  detailed = false,
}: {
  stats: Record<string, number | string>;
  loading: boolean;
  error: string;
  onRetry: () => void;
  detailed?: boolean;
}) {
  return (
    <>
      {error && (
        <div className="flex flex-col gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center">
          <CircleAlert className="h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">{error}</p>
          <button type="button" onClick={onRetry} className="btn-secondary shrink-0">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}
      {!loading && !error && Number(stats.releasedPeriods ?? 0) === 0 && (
        <div className="border-l-4 border-brand-500 bg-brand-50 p-4 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          Ratings, comments, and analysis become available after an evaluation period closes.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active teachers" value={loading ? "..." : stats.teachers ?? 0} icon={Users} iconBg="bg-slate-900 dark:bg-white text-white dark:text-slate-900" />
        <StatCard label="Open evaluation tasks" value={loading ? "..." : stats.assignedTasks ?? 0} icon={ClipboardList} iconBg="bg-brand-600 text-white" />
        <StatCard label="Open-period responses" value={loading ? "..." : stats.responses ?? 0} icon={CheckCircle2} iconBg="bg-emerald-600 text-white" />
        <StatCard label="Open completion rate" value={loading ? "..." : `${stats.completion ?? 0}%`} icon={BarChart3} iconBg="bg-amber-500 text-white" />
        <StatCard label="Closed periods" value={loading ? "..." : stats.closedPeriods ?? 0} icon={Calendar} iconBg="bg-slate-800 dark:bg-slate-700 text-white" />
        <StatCard label="Released responses" value={loading ? "..." : stats.evaluations ?? 0} icon={CheckCircle2} iconBg="bg-cyan-600 text-white" />
        <StatCard label="Released average" value={loading ? "..." : stats.avg ?? "--"} icon={Star} iconBg="bg-emerald-600 text-white" />
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">School-wide overview</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {Number(stats.activePeriods ?? 0) > 0
            ? `${stats.pendingTasks ?? 0} evaluation task${Number(stats.pendingTasks ?? 0) === 1 ? "" : "s"} pending in ${stats.activePeriods} open period${Number(stats.activePeriods) === 1 ? "" : "s"}.`
            : "There is no open evaluation period."}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Closed-period results: {stats.evaluations ?? 0} submitted response{Number(stats.evaluations ?? 0) === 1 ? "" : "s"} across {stats.closedPeriods ?? 0} closed period{Number(stats.closedPeriods ?? 0) === 1 ? "" : "s"}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {detailed ? (
            <>
              <Link href="/hr/teachers" className="btn-primary">View teachers</Link>
              <Link href="/hr/comparison" className="btn-secondary">Comparisons</Link>
              <Link href="/hr/comments" className="btn-secondary">Comments</Link>
              <Link href="/hr/reports" className="btn-secondary">Reports</Link>
            </>
          ) : (
            <Link href="/department-head/reports" className="btn-primary">View school-wide reports</Link>
          )}
        </div>
      </div>
    </>
  );
}
