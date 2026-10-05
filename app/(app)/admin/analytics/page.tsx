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
import { reportableEvaluations } from "@/lib/evaluation-results";
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

const emptyData = buildAnalytics({ evaluations: [], completions: [], assignments: [], teachers: [], departments: [], periods: [] });

export default function AdminAnalyticsPage() {
  const [data, setData] = React.useState<AnalyticsData>(emptyData);
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [completions, setCompletions] = React.useState<EvaluationCompletion[]>([]);
  const [assignments, setAssignments] = React.useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [teacherId, setTeacherId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const loadInProgress = React.useRef(false);

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
        const evaluations = evaluationSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Evaluation, "id">),
        }));
        const completions = completionSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationCompletion, "id">),
        }));
        const assignments = assignmentSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TeacherAssignment, "id">),
        }));
        const teacherList = teacherSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Teacher, "id">),
        }));
        const subjectList = subjectSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Subject, "id">),
        }));
        const departments = departmentSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Department, "id">),
        }));
        const periods = periodSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationPeriod, "id">),
        }));
        setEvaluations(evaluations);
        setCompletions(completions);
        setAssignments(assignments);
        setTeachers(teacherList);
        setSubjects(subjectList);
        setData(buildAnalytics({
          evaluations,
          completions,
          assignments,
          teachers: teacherList,
          departments,
          periods,
          includePreliminaryRatings: true,
        }));
        setHasLoaded(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Analytics could not be loaded.");
      } finally {
        loadInProgress.current = false;
        setLoading(false);
      }
  }, []);

  React.useEffect(() => {
    void loadAnalytics();
    const refresh = () => void loadAnalytics();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadAnalytics]);

  const teacherSubjects = React.useMemo(() => {
    const ids = new Set(assignments
      .filter((assignment) => !teacherId || assignment.teacherId === teacherId)
      .map((assignment) => assignment.subjectId));
    return subjects.filter((subject) => ids.has(subject.id));
  }, [assignments, subjects, teacherId]);

  React.useEffect(() => {
    if (subjectId && !teacherSubjects.some((subject) => subject.id === subjectId)) {
      setSubjectId("");
    }
  }, [subjectId, teacherSubjects]);

  const finalEvaluations = React.useMemo(
    () => reportableEvaluations(evaluations, assignments, completions),
    [assignments, completions, evaluations]
  );

  const selection = React.useMemo(() => {
    const selectedAssignments = assignments.filter((assignment) =>
      (!teacherId || assignment.teacherId === teacherId)
      && (!subjectId || assignment.subjectId === subjectId)
    );
    const assignmentIds = new Set(selectedAssignments.map((assignment) => assignment.id));
    const slots = new Set(selectedAssignments.flatMap((assignment) =>
      assignment.studentIds.map((studentId) => `${studentId}_${assignment.id}`)
    ));
    const selectedCompletions = completions.filter((completion) =>
      assignmentIds.has(completion.assignmentId)
    );
    const completedSlots = new Set(selectedCompletions
      .map((completion) => `${completion.studentId}_${completion.assignmentId}`)
      .filter((key) => slots.has(key)));
    const selectedEvaluations = finalEvaluations.filter((evaluation) =>
      evaluation.assignmentId
        ? assignmentIds.has(evaluation.assignmentId)
        : selectedAssignments.some((assignment) =>
            assignment.teacherId === evaluation.teacherId
            && assignment.subjectId === evaluation.subjectId
            && assignment.periodId === evaluation.periodId
          )
    );
    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating: `${rating} star${rating === 1 ? "" : "s"}`,
      students: selectedEvaluations.filter((evaluation) =>
        Math.max(1, Math.min(5, Math.round(evaluation.averageScore))) === rating
      ).length,
    }));
    const completed = completedSlots.size;
    return {
      assigned: slots.size,
      completed,
      pending: Math.max(slots.size - completed, 0),
      finalizedAssignments: selectedAssignments.filter((assignment) => {
        const assigned = new Set(assignment.studentIds ?? []);
        return assigned.size > 0 && [...assigned].every((studentId) =>
          completedSlots.has(`${studentId}_${assignment.id}`)
        );
      }).length,
      average: selectedEvaluations.length
        ? selectedEvaluations.reduce((sum, evaluation) => sum + evaluation.averageScore, 0) / selectedEvaluations.length
        : 0,
      distribution,
      ratedResponses: selectedEvaluations.length,
    };
  }, [assignments, completions, finalEvaluations, subjectId, teacherId]);

  const completionRate = data.completedStudents + data.pendingStudents > 0
    ? Math.round(
        data.completedStudents
        / (data.completedStudents + data.pendingStudents)
        * 100
      )
    : 0;
  const metricValue = (value: string | number) => hasLoaded ? value : loading ? "..." : "--";

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Evaluation volume, student completion, teacher ratings, department comparison, and historical trends."
        action={<button type="button" onClick={() => void loadAnalytics()} disabled={loading} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>}
      />

      {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Responses received" value={metricValue(data.totalEvaluations)} icon={BarChart3} />
        <Metric label="Students finished all tasks" value={metricValue(data.completedStudents)} icon={CheckCircle2} tone="green" />
        <Metric label="Students with pending tasks" value={metricValue(data.pendingStudents)} icon={Clock3} tone="amber" />
        <Metric label="Student completion rate" value={metricValue(`${completionRate}%`)} icon={Users} />
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold">Teacher and subject completion</h2>
            <p className="mt-1 text-sm text-slate-500">Ratings include responses only from assignments where every assigned student has finished.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[560px]">
            <label className="text-xs font-medium text-slate-500">Teacher
              <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="">All teachers</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">Subject
              <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="">All assigned subjects</option>
                {teacherSubjects.map((subject) => <option key={subject.id} value={subject.id}>{formatSubjectLabel(subject)}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectionMetric label="Assigned" value={selection.assigned} />
          <SelectionMetric label="Completed" value={selection.completed} tone="green" />
          <SelectionMetric label="Pending" value={selection.pending} tone="amber" />
          <SelectionMetric label="Finalized assignments" value={selection.finalizedAssignments} />
          <SelectionMetric label="Released average" value={selection.ratedResponses ? selection.average.toFixed(2) : "--"} />
        </div>
        {selection.pending > 0 && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {selection.pending} assigned evaluation{selection.pending === 1 ? "" : "s"} still pending. Ratings for each assignment appear once all of its assigned students finish.
          </p>
        )}
        <div className="mt-5 h-[300px] min-w-0">
          {selection.ratedResponses > 0 ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={selection.distribution} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipTextStyle} />
              <Bar dataKey="students" name="Students" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : <RatingEmptyState />}
        </div>
      </section>

      <div className="mt-4">
        <EvaluationAnalyticsCharts data={data} showPreliminary />
      </div>
    </div>
  );
}

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
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}

function SelectionMetric({ label, value, tone = "blue" }: { label: string; value: React.ReactNode; tone?: "blue" | "green" | "amber" }) {
  const colors = {
    blue: "text-brand-700 dark:text-brand-300",
    green: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
  };
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function RatingEmptyState() {
  return (
    <div className="flex h-[290px] items-center justify-center text-center text-sm text-slate-500">
      Ratings appear after every student in an assignment completes the evaluation.
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #475569",
  borderRadius: 6,
  color: "#f8fafc",
};

const tooltipTextStyle = { color: "#f8fafc" };
