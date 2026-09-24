"use client";

import * as React from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "@/lib/firebase/client";
import { PageHeader } from "@/components/data-table";
import { reportableEvaluations } from "@/lib/evaluation-results";
import { formatSubjectLabel } from "@/lib/utils";
import type {
  AppUser,
  Department,
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  Subject,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

type AnalyticsData = {
  departmentAverages: Array<{ name: string; average: number }>;
  departmentCounts: Array<{ name: string; evaluations: number }>;
  trend: Array<{ period: string; average: number; evaluations: number }>;
  topTeachers: Array<{ id: string; name: string; average: number }>;
  completionByDepartment: Array<{ department: string; completed: number; pending: number; rate: number }>;
  totalStudents: number;
  completedStudents: number;
  pendingStudents: number;
  totalEvaluations: number;
  averageRating: number;
};

const emptyData: AnalyticsData = {
  departmentAverages: [],
  departmentCounts: [],
  trend: [],
  topTeachers: [],
  completionByDepartment: [],
  totalStudents: 0,
  completedStudents: 0,
  pendingStudents: 0,
  totalEvaluations: 0,
  averageRating: 0,
};

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

  const loadAnalytics = React.useCallback(async () => {
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
          userSnapshot,
        ] = await Promise.all([
          getDocs(collection(db, "evaluations")),
          getDocs(collection(db, "evaluationCompletions")),
          getDocs(collection(db, "teacherAssignments")),
          getDocs(collection(db, "teachers")),
          getDocs(collection(db, "subjects")),
          getDocs(collection(db, "departments")),
          getDocs(collection(db, "evaluationPeriods")),
          getDocs(collection(db, "users")),
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
        const students = userSnapshot.docs
          .map((item) => ({ uid: item.id, ...(item.data() as Omit<AppUser, "uid">) }))
          .filter((user) =>
            user.role === "student"
            && (user.status ?? "active") === "active"
          );

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
          students,
        }));
        setHasLoaded(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Analytics could not be loaded.");
      } finally {
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Average rating by department">
          {data.departmentAverages.length > 0 ? <ResponsiveContainer width="100%" height={290}>
            <BarChart data={data.departmentAverages}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipTextStyle} />
              <Bar dataKey="average" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : <RatingEmptyState />}
        </ChartPanel>

        <ChartPanel title="Submitted responses by department">
          {data.departmentCounts.length > 0 ? <ResponsiveContainer width="100%" height={290}>
            <PieChart>
              <Pie
                data={data.departmentCounts}
                dataKey="evaluations"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={92}
                label={({ name, evaluations }) => `${name}: ${evaluations}`}
              >
                {data.departmentCounts.map((item, index) => (
                  <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip cursor={false} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipTextStyle} />
            </PieChart>
          </ResponsiveContainer> : <div className="flex h-[290px] items-center justify-center text-sm text-slate-500">No responses submitted yet.</div>}
        </ChartPanel>

        <ChartPanel title="Teacher performance trend">
          {data.trend.length > 0 ? <ResponsiveContainer width="100%" height={290}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipTextStyle} />
              <Legend />
              <Line type="monotone" dataKey="average" name="Average rating" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer> : <RatingEmptyState />}
        </ChartPanel>

        <ChartPanel title="Completed and pending by department">
          {data.completionByDepartment.length > 0 ? <ResponsiveContainer width="100%" height={290}>
            <BarChart data={data.completionByDepartment}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="department" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} itemStyle={tooltipTextStyle} labelStyle={tooltipTextStyle} />
              <Legend />
              <Bar dataKey="completed" stackId="status" fill="#059669" />
              <Bar dataKey="pending" stackId="status" fill="#d97706" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : <div className="flex h-[290px] items-center justify-center text-sm text-slate-500">No student assignments yet.</div>}
        </ChartPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500">Overall teacher rating</p>
          <p className="mt-3 flex items-center gap-2 text-3xl font-bold">
            <Star className="h-7 w-7 fill-amber-400 text-amber-400" />
            {data.totalEvaluations ? data.averageRating.toFixed(2) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">out of 5.00</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold">Top teachers by average rating</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.topTeachers.length === 0 ? (
              <p className="text-sm text-slate-500">No rating data yet.</p>
            ) : data.topTeachers.map((teacher, index) => (
              <div key={teacher.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-sm"><strong className="mr-2 text-slate-400">{index + 1}</strong>{teacher.name}</span>
                <span className="font-semibold">{teacher.average.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildAnalytics(input: {
  evaluations: Evaluation[];
  completions: EvaluationCompletion[];
  assignments: TeacherAssignment[];
  teachers: Teacher[];
  departments: Department[];
  periods: EvaluationPeriod[];
  students: AppUser[];
}): AnalyticsData {
  const finalEvaluations = reportableEvaluations(
    input.evaluations,
    input.assignments,
    input.completions
  );
  const departmentScores = new Map<string, { total: number; count: number }>();
  const departmentResponseCounts = new Map<string, number>();
  input.evaluations.forEach((evaluation) => {
    departmentResponseCounts.set(
      evaluation.departmentId,
      (departmentResponseCounts.get(evaluation.departmentId) ?? 0) + 1
    );
  });
  const teacherScores = new Map<string, { total: number; count: number }>();
  const periodScores = new Map<string, { total: number; count: number }>();
  finalEvaluations.forEach((evaluation) => {
    const department = departmentScores.get(evaluation.departmentId) ?? { total: 0, count: 0 };
    department.total += evaluation.averageScore;
    department.count += 1;
    departmentScores.set(evaluation.departmentId, department);
    const teacher = teacherScores.get(evaluation.teacherId) ?? { total: 0, count: 0 };
    teacher.total += evaluation.averageScore;
    teacher.count += 1;
    teacherScores.set(evaluation.teacherId, teacher);
    const period = periodScores.get(evaluation.periodId) ?? { total: 0, count: 0 };
    period.total += evaluation.averageScore;
    period.count += 1;
    periodScores.set(evaluation.periodId, period);
  });

  const slotMap = new Map<string, { studentId: string; departmentId: string; completed: boolean }>();
  input.assignments.forEach((assignment) => {
    assignment.studentIds.forEach((studentId) => {
      const key = `${studentId}_${assignment.id}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          studentId,
          departmentId: assignment.departmentId,
          completed: false,
        });
      }
    });
  });
  input.completions.forEach((completion) => {
    const key = `${completion.studentId}_${completion.assignmentId}`;
    const slot = slotMap.get(key);
    if (slot) slot.completed = true;
  });
  const studentProgress = new Map<string, { assigned: number; completed: number }>();
  slotMap.forEach((slot) => {
    const item = studentProgress.get(slot.studentId) ?? { assigned: 0, completed: 0 };
    item.assigned += 1;
    if (slot.completed) item.completed += 1;
    studentProgress.set(slot.studentId, item);
  });
  const completedStudents = [...studentProgress.values()].filter(
    (item) => item.assigned > 0 && item.completed === item.assigned
  ).length;
  const pendingStudents = [...studentProgress.values()].filter(
    (item) => item.completed < item.assigned
  ).length;

  const completionDepartmentMap = new Map<string, { completed: number; pending: number }>();
  slotMap.forEach((slot) => {
    const item = completionDepartmentMap.get(slot.departmentId) ?? { completed: 0, pending: 0 };
    if (slot.completed) item.completed += 1;
    else item.pending += 1;
    completionDepartmentMap.set(slot.departmentId, item);
  });

  return {
    departmentAverages: input.departments.map((department) => {
      const score = departmentScores.get(department.id);
      return {
        name: department.name || department.code,
        average: score ? Number((score.total / score.count).toFixed(2)) : 0,
      };
    }).filter((item) => item.average > 0),
    departmentCounts: input.departments.map((department) => ({
      name: department.name || department.code,
      evaluations: departmentResponseCounts.get(department.id) ?? 0,
    })).filter((item) => item.evaluations > 0),
    trend: input.periods
      .map((period) => {
        const score = periodScores.get(period.id);
        return {
          period: period.name,
          endDate: period.endDate,
          average: score ? Number((score.total / score.count).toFixed(2)) : 0,
          evaluations: score?.count ?? 0,
        };
      })
      .filter((item) => item.evaluations > 0)
      .sort((a, b) => a.endDate - b.endDate)
      .map(({ period, average, evaluations }) => ({ period, average, evaluations })),
    topTeachers: [...teacherScores.entries()]
      .map(([teacherId, score]) => ({
        id: teacherId,
        name: input.teachers.find((teacher) => teacher.id === teacherId)?.displayName ?? "Teacher",
        average: score.total / score.count,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 8),
    completionByDepartment: input.departments.map((department) => {
      const item = completionDepartmentMap.get(department.id) ?? { completed: 0, pending: 0 };
      const total = item.completed + item.pending;
      return {
        department: department.name || department.code,
        ...item,
        rate: total ? Math.round(item.completed / total * 100) : 0,
      };
    }).filter((item) => item.completed + item.pending > 0),
    totalStudents: input.students.length,
    completedStudents,
    pendingStudents,
    totalEvaluations: input.evaluations.length,
    averageRating: finalEvaluations.length
      ? finalEvaluations.reduce((sum, evaluation) => sum + evaluation.averageScore, 0)
        / finalEvaluations.length
      : 0,
  };
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

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
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
