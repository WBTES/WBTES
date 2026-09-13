"use client";

import * as React from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
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
import type {
  AppUser,
  Department,
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

type AnalyticsData = {
  departmentAverages: Array<{ name: string; average: number }>;
  departmentCounts: Array<{ name: string; evaluations: number }>;
  trend: Array<{ period: string; average: number; evaluations: number }>;
  topTeachers: Array<{ name: string; average: number }>;
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
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void (async () => {
      try {
        const [
          evaluationSnapshot,
          completionSnapshot,
          assignmentSnapshot,
          teacherSnapshot,
          departmentSnapshot,
          periodSnapshot,
          userSnapshot,
        ] = await Promise.all([
          getDocs(collection(db, "evaluations")),
          getDocs(collection(db, "evaluationCompletions")),
          getDocs(collection(db, "teacherAssignments")),
          getDocs(collection(db, "teachers")),
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
        const teachers = teacherSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Teacher, "id">),
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

        setData(buildAnalytics({
          evaluations,
          completions,
          assignments,
          teachers,
          departments,
          periods,
          students,
        }));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const completionRate = data.completedStudents + data.pendingStudents > 0
    ? Math.round(
        data.completedStudents
        / (data.completedStudents + data.pendingStudents)
        * 100
      )
    : 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Evaluation volume, student completion, teacher ratings, department comparison, and historical trends."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total evaluations" value={loading ? "..." : data.totalEvaluations} icon={BarChart3} />
        <Metric label="Students completed" value={loading ? "..." : data.completedStudents} icon={CheckCircle2} tone="green" />
        <Metric label="Students pending" value={loading ? "..." : data.pendingStudents} icon={Clock3} tone="amber" />
        <Metric label="Completion rate" value={loading ? "..." : `${completionRate}%`} icon={Users} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Average rating by department">
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={data.departmentAverages}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} />
              <Bar dataKey="average" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Evaluation responses by department">
          <ResponsiveContainer width="100%" height={290}>
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
              <Tooltip cursor={false} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Teacher performance trend">
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="average" name="Average rating" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Completed and pending by department">
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={data.completionByDepartment}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="department" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip cursor={false} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="completed" stackId="status" fill="#059669" />
              <Bar dataKey="pending" stackId="status" fill="#d97706" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
              <div key={teacher.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800">
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
  const departmentScores = new Map<string, { total: number; count: number }>();
  const teacherScores = new Map<string, { total: number; count: number }>();
  const periodScores = new Map<string, { total: number; count: number }>();
  input.evaluations.forEach((evaluation) => {
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
      const key = `${studentId}_${assignment.teacherId}_${assignment.periodId}`;
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
    const key = `${completion.studentId}_${completion.teacherId}_${completion.periodId}`;
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
        name: department.code,
        average: score ? Number((score.total / score.count).toFixed(2)) : 0,
      };
    }).filter((item) => item.average > 0),
    departmentCounts: input.departments.map((department) => ({
      name: department.code,
      evaluations: departmentScores.get(department.id)?.count ?? 0,
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
        name: input.teachers.find((teacher) => teacher.id === teacherId)?.displayName ?? "Teacher",
        average: score.total / score.count,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 8),
    completionByDepartment: input.departments.map((department) => {
      const item = completionDepartmentMap.get(department.id) ?? { completed: 0, pending: 0 };
      const total = item.completed + item.pending;
      return {
        department: department.code,
        ...item,
        rate: total ? Math.round(item.completed / total * 100) : 0,
      };
    }).filter((item) => item.completed + item.pending > 0),
    totalStudents: input.students.length,
    completedStudents,
    pendingStudents,
    totalEvaluations: input.evaluations.length,
    averageRating: input.evaluations.length
      ? input.evaluations.reduce((sum, evaluation) => sum + evaluation.averageScore, 0)
        / input.evaluations.length
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

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const tooltipStyle = {
  background: "rgb(15 23 42)",
  border: "none",
  borderRadius: 6,
  color: "white",
};
