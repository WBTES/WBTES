"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Search,
  Star,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader } from "@/components/data-table";
import type {
  Department,
  EvaluationCompletion,
  EvaluationPeriod,
  Subject,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-extras";
import { effectivePeriodStatus, remainingTimeLabel } from "@/lib/periods";
import toast from "react-hot-toast";

export default function StudentEvaluationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = React.useState<TeacherAssignment[]>([]);
  const [completionKeys, setCompletionKeys] = React.useState<Set<string>>(new Set());
  const [teachers, setTeachers] = React.useState<Record<string, Teacher>>({});
  const [subjects, setSubjects] = React.useState<Record<string, Subject>>({});
  const [departments, setDepartments] = React.useState<Record<string, Department>>({});
  const [periods, setPeriods] = React.useState<Record<string, EvaluationPeriod>>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [teacherFilter, setTeacherFilter] = React.useState("");
  const [subjectFilter, setSubjectFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user || !firebaseReady) return;
    void (async () => {
      try {
        const [
          assignmentSnapshot,
          teacherSnapshot,
          subjectSnapshot,
          departmentSnapshot,
          periodSnapshot,
          completionSnapshot,
        ] = await Promise.all([
          getDocs(query(
            collection(db, "teacherAssignments"),
            where("studentIds", "array-contains", user.uid)
          )),
          getDocs(collection(db, "teachers")),
          getDocs(collection(db, "subjects")),
          getDocs(collection(db, "departments")),
          getDocs(collection(db, "evaluationPeriods")),
          getDocs(query(
            collection(db, "evaluationCompletions"),
            where("studentId", "==", user.uid)
          )),
        ]);
        const assignmentList = assignmentSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TeacherAssignment, "id">),
        }));
        setAssignments(assignmentList);
        setTeachers(toRecord<Teacher>(teacherSnapshot.docs));
        setSubjects(toRecord<Subject>(subjectSnapshot.docs));
        setDepartments(toRecord<Department>(departmentSnapshot.docs));
        setPeriods(toRecord<EvaluationPeriod>(periodSnapshot.docs));

        const keys = new Set<string>();
        completionSnapshot.docs.forEach((item) => {
          const completion = item.data() as EvaluationCompletion;
          if (completion.assignmentId) keys.add(completion.assignmentId);
        });
        setCompletionKeys(keys);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Evaluations could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const visibleAssignments = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assignments.filter((assignment) => {
      if (teacherFilter && assignment.teacherId !== teacherFilter) return false;
      if (subjectFilter && assignment.subjectId !== subjectFilter) return false;
      const values = [
        teachers[assignment.teacherId]?.displayName,
        subjects[assignment.subjectId]?.name,
        subjects[assignment.subjectId]?.code,
        departments[assignment.departmentId]?.name,
        departments[assignment.departmentId]?.code,
        periods[assignment.periodId]?.name,
      ];
      return !needle || values.some((value) => value?.toLowerCase().includes(needle));
    });
  }, [assignments, departments, periods, search, subjectFilter, subjects, teacherFilter, teachers]);

  const assignedTeacherIds = React.useMemo(
    () => [...new Set(assignments.map((assignment) => assignment.teacherId))],
    [assignments]
  );
  const assignedSubjectIds = React.useMemo(
    () => [...new Set(assignments
      .filter((assignment) => !teacherFilter || assignment.teacherId === teacherFilter)
      .map((assignment) => assignment.subjectId))],
    [assignments, teacherFilter]
  );

  React.useEffect(() => {
    if (subjectFilter && !assignedSubjectIds.includes(subjectFilter)) setSubjectFilter("");
  }, [assignedSubjectIds, subjectFilter]);

  const grouped = React.useMemo(() => {
    const result = {
      pending: [] as TeacherAssignment[],
      completed: [] as TeacherAssignment[],
      upcoming: [] as TeacherAssignment[],
      expired: [] as TeacherAssignment[],
    };
    visibleAssignments.forEach((assignment) => {
      if (completionKeys.has(assignment.id)) {
        result.completed.push(assignment);
        return;
      }
      const period = periods[assignment.periodId];
      const status = period ? effectivePeriodStatus(period) : "draft";
      if (status === "open") result.pending.push(assignment);
      else if (status === "closed") result.expired.push(assignment);
      else result.upcoming.push(assignment);
    });
    return result;
  }, [completionKeys, periods, visibleAssignments]);

  const pendingEmptyMessage = assignments.length === 0
    ? "No evaluations have been assigned to your account yet."
    : search.trim()
      ? "No pending evaluations match this search."
      : "You do not have an open evaluation right now.";
  const completedEmptyMessage = search.trim() && completionKeys.size > 0
    ? "No completed evaluations match this search."
    : "You have not completed an evaluation yet.";

  React.useEffect(() => {
    setSelected((current) => {
      const pendingIds = new Set(grouped.pending.map((assignment) => assignment.id));
      return new Set([...current].filter((id) => pendingIds.has(id)));
    });
  }, [grouped.pending]);

  const startSelected = () => {
    const queue = grouped.pending
      .filter((assignment) => selected.has(assignment.id))
      .map((assignment) => assignment.id);
    if (queue.length === 0) {
      toast.error("Select at least one teacher.");
      return;
    }
    router.push(
      `/student/evaluate/${queue[0]}?queue=${encodeURIComponent(queue.join(","))}`
    );
  };

  return (
    <div>
      <PageHeader
        title="My Evaluations"
        description="Search assigned teachers and subjects, then submit one anonymous response for each assignment."
        action={
          grouped.pending.length > 0 ? (
            <button
              type="button"
              onClick={startSelected}
              disabled={selected.size === 0}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Star className="h-4 w-4" />
              Evaluate selected ({selected.size})
            </button>
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search teacher, subject, department, or period"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900"
          />
        </div>
        <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="">All assigned teachers</option>
          {assignedTeacherIds.map((id) => <option key={id} value={id}>{teachers[id]?.displayName ?? "Teacher"}</option>)}
        </select>
        <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="">All assigned subjects</option>
          {assignedSubjectIds.map((id) => <option key={id} value={id}>{subjects[id]?.code ?? "Subject"} - {subjects[id]?.name ?? ""}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : (
        <div className="space-y-7">
          <EvaluationSection title="Pending" count={grouped.pending.length}>
            {grouped.pending.length === 0 ? (
              <EmptyState message={pendingEmptyMessage} />
            ) : grouped.pending.map((assignment) => (
              <EvaluationRow
                key={assignment.id}
                assignment={assignment}
                teacher={teachers[assignment.teacherId]}
                subject={subjects[assignment.subjectId]}
                department={departments[assignment.departmentId]}
                period={periods[assignment.periodId]}
                selected={selected.has(assignment.id)}
                onSelect={(checked) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (checked) next.add(assignment.id);
                    else next.delete(assignment.id);
                    return next;
                  });
                }}
              />
            ))}
          </EvaluationSection>

          <EvaluationSection title="Completed" count={grouped.completed.length}>
            {grouped.completed.length === 0 ? (
              <EmptyState message={completedEmptyMessage} />
            ) : grouped.completed.map((assignment) => (
              <EvaluationRow
                key={assignment.id}
                assignment={assignment}
                teacher={teachers[assignment.teacherId]}
                subject={subjects[assignment.subjectId]}
                department={departments[assignment.departmentId]}
                period={periods[assignment.periodId]}
                completed
              />
            ))}
          </EvaluationSection>

          {grouped.upcoming.length > 0 && (
            <EvaluationSection title="Upcoming" count={grouped.upcoming.length}>
              {grouped.upcoming.map((assignment) => (
                <EvaluationRow
                  key={assignment.id}
                  assignment={assignment}
                  teacher={teachers[assignment.teacherId]}
                  subject={subjects[assignment.subjectId]}
                  department={departments[assignment.departmentId]}
                  period={periods[assignment.periodId]}
                  disabled
                />
              ))}
            </EvaluationSection>
          )}

          {grouped.expired.length > 0 && (
            <EvaluationSection title="Closed" count={grouped.expired.length}>
              {grouped.expired.map((assignment) => (
                <EvaluationRow
                  key={assignment.id}
                  assignment={assignment}
                  teacher={teachers[assignment.teacherId]}
                  subject={subjects[assignment.subjectId]}
                  department={departments[assignment.departmentId]}
                  period={periods[assignment.periodId]}
                  disabled
                />
              ))}
            </EvaluationSection>
          )}
        </div>
      )}
    </div>
  );
}

function EvaluationRow({
  assignment,
  teacher,
  subject,
  department,
  period,
  selected = false,
  completed = false,
  disabled = false,
  onSelect,
}: {
  assignment: TeacherAssignment;
  teacher?: Teacher;
  subject?: Subject;
  department?: Department;
  period?: EvaluationPeriod;
  selected?: boolean;
  completed?: boolean;
  disabled?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const status = period ? effectivePeriodStatus(period) : "draft";
  const content = (
    <>
      {onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600"
          aria-label={`Select ${teacher?.displayName ?? "teacher"}`}
        />
      )}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${completed ? "bg-emerald-600" : "bg-slate-900 dark:bg-white"} text-white dark:text-slate-900`}>
        {completed ? <CheckCircle2 className="h-4 w-4 text-white" /> : <Star className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-950 dark:text-white">
          {teacher?.displayName ?? "Teacher"}
        </p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          {subject?.name ?? "Subject"}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" />
            {department?.name ?? "Department"}
          </span>
          <span>{period?.name ?? "Evaluation period"}</span>
        </p>
        {period && (
          <p className="mt-1 text-xs text-slate-500">
            {fmtDateTime(period.startDate)} to {fmtDateTime(period.endDate)}
            {status === "open" && ` · ${remainingTimeLabel(period.endDate)}`}
          </p>
        )}
      </div>
      <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
        {completed ? "Completed" : status === "open" ? "Start" : status === "closed" ? "Closed" : "Not yet open"}
      </span>
      {!disabled && !completed && <ChevronRight className="h-4 w-4 text-slate-400" />}
    </>
  );

  if (!disabled && !completed && !onSelect) {
    return (
      <Link href={`/student/evaluate/${assignment.id}`} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900">
        {content}
      </Link>
    );
  }
  if (!disabled && !completed) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {content}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 opacity-75 dark:border-slate-800 dark:bg-slate-900">
      {content}
    </div>
  );
}

function EvaluationSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-slate-500">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {count}
        </span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
      {message}
    </div>
  );
}

function toRecord<T extends { id: string }>(
  documents: Array<{ id: string; data: () => unknown }>
) {
  return Object.fromEntries(documents.map((item) => [
    item.id,
    { id: item.id, ...(item.data() as Omit<T, "id">) },
  ])) as Record<string, T>;
}
