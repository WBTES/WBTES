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
import { EvaluationSelection } from "@/components/student/evaluation-selection";
import { evaluationQueueHref, MAX_EVALUATIONS_PER_SESSION } from "@/lib/evaluation-queue";
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
  const [search, setSearch] = React.useState("");
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
  }, [assignments, departments, periods, search, subjects, teachers]);

  const availableAssignments = React.useMemo(() => assignments.filter((assignment) => {
    const period = periods[assignment.periodId];
    const teacher = teachers[assignment.teacherId];
    const subject = subjects[assignment.subjectId];
    return !completionKeys.has(assignment.id)
      && period?.status === "open" && effectivePeriodStatus(period) === "open"
      && teacher && teacher.status !== "inactive"
      && subject && subject.departmentId === assignment.departmentId
      && teacher.departmentId === assignment.departmentId;
  }), [assignments, completionKeys, periods, subjects, teachers]);

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
    : "You do not have an open evaluation right now.";
  const completedEmptyMessage = search.trim() && completionKeys.size > 0
    ? "No completed evaluations match this search."
    : "You have not completed an evaluation yet.";

  const startSelected = (queue: string[]) => {
    const eligibleIds = new Set(availableAssignments
      .filter((assignment) => effectivePeriodStatus(periods[assignment.periodId]) === "open")
      .map((assignment) => assignment.id));
    if (queue.length < 1 || queue.length > MAX_EVALUATIONS_PER_SESSION
      || queue.some((id) => !eligibleIds.has(id))) {
      toast.error("Choose between 1 and 5 available evaluations.");
      return;
    }
    router.push(evaluationQueueHref(queue));
  };

  return (
    <div>
      <PageHeader
        title="My Evaluations"
        description="Anonymous feedback for your assigned teachers and subjects."
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : (
        <div className="space-y-7">
          {availableAssignments.length > 0 ? (
            <EvaluationSelection
              assignments={availableAssignments}
              teachers={teachers}
              subjects={subjects}
              periods={periods}
              onStart={startSelected}
            />
          ) : <EmptyState message={pendingEmptyMessage} />}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search evaluation history"
              placeholder="Search completed, upcoming, or closed evaluations"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

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
  completed = false,
  disabled = false,
}: {
  assignment: TeacherAssignment;
  teacher?: Teacher;
  subject?: Subject;
  department?: Department;
  period?: EvaluationPeriod;
  completed?: boolean;
  disabled?: boolean;
}) {
  const status = period ? effectivePeriodStatus(period) : "draft";
  const content = (
    <>
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

  if (!disabled && !completed) {
    return (
      <Link href={`/student/evaluate/${assignment.id}`} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900">
        {content}
      </Link>
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
