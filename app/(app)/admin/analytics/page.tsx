"use client";

import * as React from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Users,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { db } from "@/lib/firebase/client";
import { PageHeader } from "@/components/data-table";
import { buildAnalytics, type AnalyticsData } from "@/lib/analytics";
import { EvaluationAnalyticsCharts } from "@/components/reports/evaluation-analytics-charts";
import { formatSubjectLabel } from "@/lib/utils";

import type {
  Department,
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  Subject,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";

/* =========================================================
   TYPES
   ========================================================= */

type AssignmentWithTarget = TeacherAssignment & {
  targetStudentCount?: number | string;
  studentIds: string[];
  departmentId?: string;
};

type DepartmentCompletion = {
  department: string;
  completed: number;
  pending: number;
  rate: number;
};

type AssignmentProgress = {
  expected: number;
  completed: number;
  pending: number;
  assignedAccounts: number;
  completionRate: number;
};

type AnalyticsTotals = {
  expected: number;
  completed: number;
  pending: number;
  assignedAccounts: number;
  finalizedAssignments: number;
  completionRate: number;
};

const EMPTY_TOTALS: AnalyticsTotals = {
  expected: 0,
  completed: 0,
  pending: 0,
  assignedAccounts: 0,
  finalizedAssignments: 0,
  completionRate: 0,
};

/* =========================================================
   ASSIGNMENT COUNT HELPERS
   ========================================================= */

/**
 * Count unique students who completed one specific assignment.
 * Duplicate completion documents do not inflate the count.
 */
function getCompletedStudentIds(
  completions: EvaluationCompletion[],
  assignmentId: string,
): Set<string> {
  return new Set(
    completions
      .filter(
        (completion) =>
          completion.assignmentId === assignmentId &&
          typeof completion.studentId === "string" &&
          completion.studentId.trim().length > 0,
      )
      .map((completion) => completion.studentId),
  );
}

/**
 * Expected count is the configured target, not just the number
 * of registered student accounts.
 *
 * Never reduce the target below existing assigned accounts or
 * recorded completions.
 */
function getExpectedCount(
  assignment: AssignmentWithTarget,
  completedCount: number,
): number {
  const target = Number(assignment.targetStudentCount ?? 0);
  const assignedIds = new Set(assignment.studentIds ?? []);
  const registeredCount = assignedIds.size;

  const configuredTarget =
    Number.isFinite(target) && target > 0
      ? Math.floor(target)
      : 0;

  return Math.max(
    configuredTarget,
    registeredCount,
    completedCount,
    0,
  );
}

function getAssignmentProgress(
  assignment: AssignmentWithTarget,
  completions: EvaluationCompletion[],
): AssignmentProgress {
  const completedIds = getCompletedStudentIds(
    completions,
    assignment.id,
  );

  const completed = completedIds.size;
  const expected = getExpectedCount(assignment, completed);
  const assignedAccounts = new Set(assignment.studentIds ?? []).size;
  const pending = Math.max(expected - completed, 0);

  return {
    expected,
    completed,
    pending,
    assignedAccounts,
    completionRate:
      expected > 0
        ? Math.round((completed / expected) * 100)
        : 0,
  };
}

function getAnalyticsTotals(
  assignments: AssignmentWithTarget[],
  completions: EvaluationCompletion[],
): AnalyticsTotals {
  if (assignments.length === 0) {
    return EMPTY_TOTALS;
  }

  const progress = assignments.map((assignment) =>
    getAssignmentProgress(assignment, completions),
  );

  const expected = progress.reduce(
    (sum, item) => sum + item.expected,
    0,
  );

  const completed = progress.reduce(
    (sum, item) => sum + item.completed,
    0,
  );

  const pending = progress.reduce(
    (sum, item) => sum + item.pending,
    0,
  );

  const assignedAccounts = progress.reduce(
    (sum, item) => sum + item.assignedAccounts,
    0,
  );

  const finalizedAssignments = progress.filter(
    (item) => item.expected > 0 && item.completed >= item.expected,
  ).length;

  return {
    expected,
    completed,
    pending,
    assignedAccounts,
    finalizedAssignments,
    completionRate:
      expected > 0
        ? Math.round((completed / expected) * 100)
        : 0,
  };
}

/* =========================================================
   DEPARTMENT COMPLETION
   ========================================================= */

function getDepartmentCompletion(
  assignments: AssignmentWithTarget[],
  completions: EvaluationCompletion[],
  departments: Department[],
  teachers: Teacher[],
): DepartmentCompletion[] {
  const totals = new Map<
    string,
    { completed: number; pending: number }
  >();

  for (const assignment of assignments) {
    const teacher = teachers.find(
      (item) => item.id === assignment.teacherId,
    );

    const departmentId =
      assignment.departmentId ||
      (teacher as (Teacher & { departmentId?: string }) | undefined)
        ?.departmentId ||
      "";

    if (!departmentId) {
      continue;
    }

    const progress = getAssignmentProgress(
      assignment,
      completions,
    );

    const current = totals.get(departmentId) ?? {
      completed: 0,
      pending: 0,
    };

    current.completed += progress.completed;
    current.pending += progress.pending;

    totals.set(departmentId, current);
  }

  return departments
    .map((department) => {
      const item = totals.get(department.id) ?? {
        completed: 0,
        pending: 0,
      };

      const total = item.completed + item.pending;

      return {
        department:
          department.name || department.code || department.id,
        completed: item.completed,
        pending: item.pending,
        rate:
          total > 0
            ? Math.round((item.completed / total) * 100)
            : 0,
      };
    })
    .filter((item) => item.completed + item.pending > 0);
}

/* =========================================================
   EVALUATION HELPERS
   ========================================================= */

function getEvaluationAssignmentId(
  evaluation: Evaluation,
): string | undefined {
  return (
    evaluation as Evaluation & { assignmentId?: string }
  ).assignmentId;
}

function getEvaluationScore(
  evaluation: Evaluation,
): number | null {
  const score = Number(evaluation.averageScore);

  return Number.isFinite(score) && score > 0
    ? score
    : null;
}

/* =========================================================
   PAGE
   ========================================================= */

export default function AdminAnalyticsPage() {
  const [data, setData] = React.useState<AnalyticsData>(
    () =>
      buildAnalytics({
        evaluations: [],
        completions: [],
        assignments: [],
        teachers: [],
        departments: [],
        periods: [],
        includePreliminaryRatings: true,
      }),
  );

  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [completions, setCompletions] = React.useState<
    EvaluationCompletion[]
  >([]);
  const [assignments, setAssignments] = React.useState<
    AssignmentWithTarget[]
  >([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);

  const [teacherId, setTeacherId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [error, setError] = React.useState("");

  const loadInProgress = React.useRef(false);

  /* =======================================================
     LOAD FIRESTORE DATA
     ======================================================= */

  const loadAnalytics = React.useCallback(async () => {
    if (loadInProgress.current) return;

    loadInProgress.current = true;
    setLoading(true);
    setError("");

    try {
      const [
        evaluationSnapshot,
        completionSnapshot,
        assignmentSnapshot,
        teacherSnapshot,
        subjectSnapshot,
        departmentSnapshot,
        periodSnapshot,
      ] = await Promise.all([
        getDocs(collection(db, "evaluations")),
        getDocs(collection(db, "evaluationCompletions")),
        getDocs(collection(db, "teacherAssignments")),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "departments")),
        getDocs(collection(db, "evaluationPeriods")),
      ]);

      const nextEvaluations: Evaluation[] =
        evaluationSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Evaluation, "id">),
        }));

      const nextCompletions: EvaluationCompletion[] =
        completionSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationCompletion, "id">),
        }));

      const nextAssignments: AssignmentWithTarget[] =
        assignmentSnapshot.docs.map((item) => {
          const raw = item.data() as Omit<
            TeacherAssignment,
            "id"
          > & {
            targetStudentCount?: number | string;
            studentIds?: string[];
            departmentId?: string;
          };

          return {
            ...raw,
            id: item.id,
            studentIds: Array.isArray(raw.studentIds)
              ? raw.studentIds
              : [],
            targetStudentCount: raw.targetStudentCount,
            departmentId: raw.departmentId,
          };
        });

      const nextTeachers: Teacher[] =
        teacherSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Teacher, "id">),
        }));

      const nextSubjects: Subject[] =
        subjectSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Subject, "id">),
        }));

      const nextDepartments: Department[] =
        departmentSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Department, "id">),
        }));

      const nextPeriods: EvaluationPeriod[] =
        periodSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationPeriod, "id">),
        }));

      const baseData = buildAnalytics({
        evaluations: nextEvaluations,
        completions: nextCompletions,
        assignments: nextAssignments,
        teachers: nextTeachers,
        departments: nextDepartments,
        periods: nextPeriods,
        includePreliminaryRatings: true,
      });

      const correctedDepartmentCompletion =
        getDepartmentCompletion(
          nextAssignments,
          nextCompletions,
          nextDepartments,
          nextTeachers,
        );

      const correctedData = {
        ...baseData,
        completionByDepartment: correctedDepartmentCompletion,
      } as AnalyticsData;

      setEvaluations(nextEvaluations);
      setCompletions(nextCompletions);
      setAssignments(nextAssignments);
      setTeachers(nextTeachers);
      setSubjects(nextSubjects);
      setDepartments(nextDepartments);
      setPeriods(nextPeriods);
      setData(correctedData);
      setHasLoaded(true);
    } catch (cause) {
      console.error("Unable to load analytics:", cause);

      setError(
        cause instanceof Error
          ? cause.message
          : "Analytics could not be loaded.",
      );
    } finally {
      loadInProgress.current = false;
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAnalytics();

    const refresh = () => {
      void loadAnalytics();
    };

    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, [loadAnalytics]);

  /* =======================================================
     TEACHER AND SUBJECT FILTERS
     ======================================================= */

  const teacherSubjects = React.useMemo(() => {
    const subjectIds = new Set(
      assignments
        .filter(
          (assignment) =>
            !teacherId || assignment.teacherId === teacherId,
        )
        .map((assignment) => assignment.subjectId),
    );

    return subjects.filter((subject) => subjectIds.has(subject.id));
  }, [assignments, subjects, teacherId]);

  React.useEffect(() => {
    if (
      subjectId &&
      !teacherSubjects.some((subject) => subject.id === subjectId)
    ) {
      setSubjectId("");
    }
  }, [subjectId, teacherSubjects]);

  /* =======================================================
     OVERALL AND FILTERED PROGRESS
     ======================================================= */

  const overallTotals = React.useMemo(
    () => getAnalyticsTotals(assignments, completions),
    [assignments, completions],
  );

  const selectedAssignments = React.useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          (!teacherId || assignment.teacherId === teacherId) &&
          (!subjectId || assignment.subjectId === subjectId),
      ),
    [assignments, teacherId, subjectId],
  );

  const selection = React.useMemo(() => {
    const totals = getAnalyticsTotals(
      selectedAssignments,
      completions,
    );

    const assignmentIds = new Set(
      selectedAssignments.map((assignment) => assignment.id),
    );

    const selectedEvaluations = evaluations.filter((evaluation) => {
      const evaluationAssignmentId =
        getEvaluationAssignmentId(evaluation);

      if (evaluationAssignmentId) {
        return assignmentIds.has(evaluationAssignmentId);
      }

      return selectedAssignments.some(
        (assignment) =>
          assignment.teacherId === evaluation.teacherId &&
          assignment.subjectId === evaluation.subjectId &&
          assignment.periodId === evaluation.periodId,
      );
    });

    const validScores = selectedEvaluations
      .map(getEvaluationScore)
      .filter((score): score is number => score !== null);

    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating: `${rating} star${rating === 1 ? "" : "s"}`,
      students: validScores.filter(
        (score) => Math.round(score) === rating,
      ).length,
    }));

    return {
      ...totals,
      average:
        validScores.length > 0
          ? validScores.reduce((sum, score) => sum + score, 0) /
            validScores.length
          : 0,
      distribution,
      ratedResponses: validScores.length,
    };
  }, [
    selectedAssignments,
    completions,
    evaluations,
  ]);

  const metricValue = (value: string | number) =>
    hasLoaded ? value : loading ? "..." : "--";

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Evaluation submissions, expected assignment tasks, pending evaluations, teacher ratings, department comparison, and historical trends."
        action={
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={loading}
            className="btn-secondary"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      {/* Overall totals use assignment targets, not account counts. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Responses received"
          value={metricValue(data.totalEvaluations)}
          icon={BarChart3}
        />

        <Metric
          label="Expected evaluation tasks"
          value={metricValue(overallTotals.expected)}
          icon={Users}
        />

        <Metric
          label="Completed evaluation tasks"
          value={metricValue(overallTotals.completed)}
          icon={CheckCircle2}
          tone="green"
        />

        <Metric
          label="Pending evaluation tasks"
          value={metricValue(overallTotals.pending)}
          icon={Clock3}
          tone="amber"
        />
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold">
              Teacher and subject completion
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Expected tasks use each assignment&apos;s target student count.
              Ratings update from submitted evaluations without waiting for
              the entire assignment to finish.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[560px]">
            <label className="text-xs font-medium text-slate-500">
              Teacher
              <select
                value={teacherId}
                onChange={(event) => setTeacherId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="">All teachers</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-slate-500">
              Subject
              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="">All assigned subjects</option>
                {teacherSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {formatSubjectLabel(subject)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <SelectionMetric
            label="Expected tasks"
            value={selection.expected}
          />

          <SelectionMetric
            label="Completed"
            value={selection.completed}
            tone="green"
          />

          <SelectionMetric
            label="Pending"
            value={selection.pending}
            tone="amber"
          />

          <SelectionMetric
            label="Assigned accounts"
            value={selection.assignedAccounts}
          />

          <SelectionMetric
            label="Finalized assignments"
            value={`${selection.finalizedAssignments} / ${selectedAssignments.length}`}
          />

          <SelectionMetric
            label="Completion rate"
            value={`${selection.completionRate}%`}
          />
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Submitted rating average:{" "}
            <strong className="text-slate-900 dark:text-white">
              {selection.ratedResponses > 0
                ? `${selection.average.toFixed(2)} / 5`
                : "--"}
            </strong>
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Based on {selection.ratedResponses} submitted evaluation
            {selection.ratedResponses === 1 ? "" : "s"} with valid scores.
          </p>
        </div>

        {selection.pending > 0 && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {selection.pending.toLocaleString()} evaluation task
            {selection.pending === 1 ? "" : "s"} still pending based on
            the selected assignment targets.
          </p>
        )}

        <div className="mt-5 h-[300px] min-w-0">
          {selection.ratedResponses > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={selection.distribution}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.22)"
                />

                <XAxis dataKey="rating" tick={{ fontSize: 12 }} />

                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                />

                <Tooltip
                  cursor={false}
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipTextStyle}
                  labelStyle={tooltipTextStyle}
                />

                <Bar
                  dataKey="students"
                  name="Submitted evaluations"
                  fill="#2563eb"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <RatingEmptyState />
          )}
        </div>
      </section>

      <div className="mt-4">
        <EvaluationAnalyticsCharts
          data={data}
          showPreliminary
        />
      </div>
    </div>
  );
}

/* =========================================================
   METRIC CARD
   ========================================================= */

function Metric({
  label,
  value,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "amber";
}) {
  const colors = {
    blue: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    green:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber:
      "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>

        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}

/* =========================================================
   SELECTION METRIC
   ========================================================= */

function SelectionMetric({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "blue" | "green" | "amber";
}) {
  const colors = {
    blue: "text-brand-700 dark:text-brand-300",
    green: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
  };

  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colors[tone]}`}>
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   EMPTY RATING STATE
   ========================================================= */

function RatingEmptyState() {
  return (
    <div className="flex h-[290px] items-center justify-center text-center text-sm text-slate-500">
      Submitted rating data will appear here when valid evaluation scores
      are available.
    </div>
  );
}

/* =========================================================
   CHART TOOLTIP STYLES
   ========================================================= */

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #475569",
  borderRadius: 6,
  color: "#f8fafc",
};

const tooltipTextStyle = {
  color: "#f8fafc",
};