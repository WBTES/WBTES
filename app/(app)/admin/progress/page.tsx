"use client";

import * as React from "react";
import { CheckCircle2, Clock3, Search } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { PageHeader, inputCls } from "@/components/data-table";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";
import type {
  EvaluationCompletion,
  EvaluationPeriod,
  Program,
  StudentRegistry,
  Subject,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";
import { usePrograms } from "@/lib/use-programs";
import { fmtDateTime } from "@/lib/utils-extras";
import toast from "react-hot-toast";

type ManagedStudent = StudentRegistry & {
  accountCreated: boolean;
  emailVerified: boolean;
  lastLoginAt: number;
};

type ProgressRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  programId: string;
  yearLevel: string;
  section: string;
  teacherName: string;
  subjectName: string;
  periodId: string;
  periodName: string;
  semester: string;
  academicYear: string;
  periodEndDate: number;
  periodStatus: EvaluationPeriod["status"];
  status: "completed" | "pending";
  submittedAt: number;
};

export default function AdminProgressPage() {
  const { programs } = usePrograms();
  const [rows, setRows] = React.useState<ProgressRow[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [now, setNow] = React.useState(() => Date.now());
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState({
    programId: "",
    yearLevel: "",
    periodId: "",
    semester: "",
    academicYear: "",
    status: "",
  });

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "overdue") {
      setFilters((current) => ({ ...current, status: "overdue" }));
    }
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const [
          studentsResponse,
          assignmentSnapshot,
          completionSnapshot,
          teacherSnapshot,
          subjectSnapshot,
          periodSnapshot,
        ] = await Promise.all([
          authenticatedFetch("/api/admin/students"),
          getDocs(collection(db, "teacherAssignments")),
          getDocs(collection(db, "evaluationCompletions")),
          getDocs(collection(db, "teachers")),
          getDocs(collection(db, "subjects")),
          getDocs(collection(db, "evaluationPeriods")),
        ]);
        const studentData = await readApiResponse<{ registrations: ManagedStudent[] }>(
          studentsResponse
        );
        const teachers = new Map(teacherSnapshot.docs.map((item) => [
          item.id,
          (item.data() as Teacher).displayName,
        ]));
        const subjects = new Map(subjectSnapshot.docs.map((item) => [
          item.id,
          (item.data() as Subject).name,
        ]));
        const periodList = periodSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationPeriod, "id">),
        }));
        setPeriods(periodList);
        const periodMap = new Map(periodList.map((period) => [period.id, period]));
        const studentMap = new Map(
          studentData.registrations
            .filter((student) => student.claimedUid)
            .map((student) => [student.claimedUid!, student])
        );
        const completionMap = new Map<string, EvaluationCompletion>();
        completionSnapshot.docs.forEach((item) => {
          const completion = {
            id: item.id,
            ...(item.data() as Omit<EvaluationCompletion, "id">),
          };
          completionMap.set(
            `${completion.studentId}_${completion.teacherId}_${completion.periodId}`,
            completion
          );
        });

        const output = new Map<string, ProgressRow>();
        assignmentSnapshot.docs.forEach((item) => {
          const assignment = {
            id: item.id,
            ...(item.data() as Omit<TeacherAssignment, "id">),
          };
          const period = periodMap.get(assignment.periodId);
          assignment.studentIds.forEach((studentId) => {
            const student = studentMap.get(studentId);
            if (!student || !period) return;
            const id = `${studentId}_${assignment.teacherId}_${assignment.periodId}`;
            if (output.has(id)) return;
            const completion = completionMap.get(id);
            output.set(id, {
              id,
              studentId,
              studentName: student.displayName,
              studentEmail: student.email,
              programId: student.programId,
              yearLevel: student.yearLevel,
              section: student.section,
              teacherName: teachers.get(assignment.teacherId) ?? "Teacher",
              subjectName: subjects.get(assignment.subjectId) ?? "Subject",
              periodId: assignment.periodId,
              periodName: period.name,
              semester: period.semester,
              academicYear: period.academicYear,
              periodEndDate: period.endDate,
              periodStatus: period.status,
              status: completion ? "completed" : "pending",
              submittedAt: completion?.submittedAt ?? 0,
            });
          });
        });
        setRows([...output.values()].sort((a, b) =>
          a.studentName.localeCompare(b.studentName)
          || a.teacherName.localeCompare(b.teacherName)
        ));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Progress data could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.programId && row.programId !== filters.programId) return false;
      if (filters.yearLevel && row.yearLevel !== filters.yearLevel) return false;
      if (filters.periodId && row.periodId !== filters.periodId) return false;
      if (filters.semester && row.semester !== filters.semester) return false;
      if (filters.academicYear && row.academicYear !== filters.academicYear) return false;
      if (
        filters.status === "overdue"
        && (
          row.status !== "pending"
          || row.periodStatus !== "open"
          || row.periodEndDate > now
        )
      ) {
        return false;
      }
      if (
        filters.status
        && filters.status !== "overdue"
        && row.status !== filters.status
      ) {
        return false;
      }
      if (!needle) return true;
      return [
        row.studentName,
        row.studentEmail,
        row.teacherName,
        row.subjectName,
        row.periodName,
        row.yearLevel,
        row.section,
        programs.find((program) => program.id === row.programId)?.code,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [filters, now, programs, rows, search]);

  const completed = visible.filter((row) => row.status === "completed").length;
  const pending = visible.length - completed;
  const years = Array.from(new Set(periods.map((period) => period.academicYear))).sort();

  return (
    <div>
      <PageHeader
        title="Evaluation Progress"
        description="Monitor every assigned student, completed or pending status, and exact submission time."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Summary label="Assignments" value={visible.length} icon={Search} />
        <Summary label="Completed" value={completed} icon={CheckCircle2} tone="green" />
        <Summary label="Pending" value={pending} icon={Clock3} tone="amber" />
      </div>

      <div className="mb-5 grid gap-3 border-y border-slate-200 py-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, teacher, subject, Program, year, or section" className={`${inputCls} pl-10`} />
        </div>
        <Filter value={filters.programId} onChange={(value) => setFilters({ ...filters, programId: value })} label="All Programs">
          {programs.map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
        </Filter>
        <Filter value={filters.yearLevel} onChange={(value) => setFilters({ ...filters, yearLevel: value })} label="All year levels">
          {["1st", "2nd", "3rd", "4th"].map((year) => <option key={year} value={year}>{year} year</option>)}
        </Filter>
        <Filter value={filters.periodId} onChange={(value) => setFilters({ ...filters, periodId: value })} label="All evaluation periods">
          {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </Filter>
        <Filter value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} label="All statuses">
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </Filter>
        <Filter value={filters.semester} onChange={(value) => setFilters({ ...filters, semester: value })} label="All semesters">
          <option value="1st">1st Semester</option>
          <option value="2nd">2nd Semester</option>
          <option value="summer">Summer</option>
        </Filter>
        <Filter value={filters.academicYear} onChange={(value) => setFilters({ ...filters, academicYear: value })} label="All academic years">
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </Filter>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Program / Class</th>
              <th className="px-4 py-3">Teacher</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading progress...</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No evaluation assignments match these filters.</td></tr>
            ) : visible.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.studentName}</p>
                  <p className="text-xs text-slate-500">{row.studentEmail}</p>
                </td>
                <td className="px-4 py-3">
                  {programs.find((program) => program.id === row.programId)?.code ?? "—"} · {row.yearLevel} / {row.section}
                </td>
                <td className="px-4 py-3">{row.teacherName}</td>
                <td className="px-4 py-3">{row.subjectName}</td>
                <td className="px-4 py-3">
                  <p>{row.periodName}</p>
                  <p className="text-xs text-slate-500">{row.semester} · {row.academicYear}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "completed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">{row.submittedAt ? fmtDateTime(row.submittedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "amber";
}) {
  const colors = {
    blue: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-4 w-4" /></div>
      <div><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>
    </div>
  );
}

function Filter({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={inputCls}>
      <option value="">{label}</option>
      {children}
    </select>
  );
}
