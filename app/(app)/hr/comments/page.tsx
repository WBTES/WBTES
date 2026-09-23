"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CircleAlert,
  Filter,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader, FormField, inputCls } from "@/components/data-table";
import { consolidateComments } from "@/lib/comment-analysis";
import { loadReleasedDepartmentResults } from "@/lib/firebase/department-results";
import { formatSubjectLabel } from "@/lib/utils";
import type {
  Evaluation,
  EvaluationPeriod,
  Subject,
  Teacher,
} from "@/lib/types";

type CommentRecord = {
  id: string;
  text: string;
  teacher: string;
  subject: string;
  period: string;
};

export default function HrCommentsPage() {
  const { profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [noDept, setNoDept] = React.useState(false);
  const [error, setError] = React.useState("");
  const [filter, setFilter] = React.useState({
    teacherId: "",
    subjectId: "",
    periodId: "",
    search: "",
  });

  const load = React.useCallback(async () => {
    if (!firebaseReady || !profile) return;
    if (profile.role !== "hr" && profile.role !== "admin") return;
    setLoading(true);
    setError("");
    setNoDept(false);
    try {
      const [results, teacherSnapshot, subjectSnapshot] = await Promise.all([
        loadReleasedDepartmentResults(),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
      ]);
      setEvaluations(results.evaluations);
      setPeriods(results.periods);
      setTeachers(teacherSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Teacher, "id">),
      })));
      setSubjects(subjectSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Subject, "id">),
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Anonymous comments could not be loaded.");
      setEvaluations([]);
      setPeriods([]);
      setTeachers([]);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const teacherNames = React.useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.displayName])),
    [teachers]
  );
  const subjectNames = React.useMemo(
    () => new Map(subjects.map((subject) => [subject.id, formatSubjectLabel(subject)])),
    [subjects]
  );
  const periodNames = React.useMemo(
    () => new Map(periods.map((period) => [period.id, period.name])),
    [periods]
  );

  const matchingEvaluations = React.useMemo(() => evaluations.filter((evaluation) => {
    if (!evaluation.comment?.trim()) return false;
    if (filter.teacherId && evaluation.teacherId !== filter.teacherId) return false;
    if (filter.subjectId && evaluation.subjectId !== filter.subjectId) return false;
    if (filter.periodId && evaluation.periodId !== filter.periodId) return false;
    return true;
  }), [evaluations, filter.periodId, filter.subjectId, filter.teacherId]);

  const consolidated = React.useMemo(
    () => consolidateComments(matchingEvaluations.map((evaluation) => evaluation.comment?.trim() ?? "")),
    [matchingEvaluations]
  );

  const comments = React.useMemo(() => {
    const records = consolidated.uniqueComments.map((text, index): CommentRecord => {
      const evaluation = matchingEvaluations.find((item) => item.comment?.trim() === text);
      return {
        id: evaluation?.id ?? `comment-${index}`,
        text,
        teacher: evaluation ? teacherNames.get(evaluation.teacherId) ?? "Teacher" : "Teacher",
        subject: evaluation ? subjectNames.get(evaluation.subjectId) ?? "Subject" : "Subject",
        period: evaluation ? periodNames.get(evaluation.periodId) ?? "Evaluation period" : "Evaluation period",
      };
    });
    const search = filter.search.trim().toLowerCase();
    if (!search) return records;
    return records.filter((record) =>
      [record.text, record.teacher, record.subject, record.period]
        .some((value) => value.toLowerCase().includes(search))
    );
  }, [consolidated.uniqueComments, filter.search, matchingEvaluations, periodNames, subjectNames, teacherNames]);

  const representedTeachers = new Set(
    matchingEvaluations.map((evaluation) => evaluation.teacherId)
  ).size;

  return (
    <div>
      <PageHeader
        title="Anonymous Comments"
        description="Review released written feedback without student identities."
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
        <CommentsSkeleton />
      ) : periods.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white">Comments are protected until the period closes</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Anonymous written feedback will appear here automatically after an administrator closes an evaluation period.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-3 border-l-4 border-emerald-500 bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Released and anonymous</p>
              <p className="mt-0.5 text-xs leading-5 opacity-80">
                Student names, account IDs, and completion records are not included in this view.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard icon={MessageSquareText} label="Unique comments" value={consolidated.analysis.uniqueComments} />
            <SummaryCard icon={Sparkles} label="Detected themes" value={consolidated.analysis.themes.length} />
            <SummaryCard icon={Users} label="Teachers represented" value={representedTeachers} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Filter className="h-4 w-4 text-brand-500" />
              <h2 className="text-sm font-semibold">Filter comments</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormField label="Teacher">
                <select
                  value={filter.teacherId}
                  onChange={(event) => setFilter((current) => ({ ...current, teacherId: event.target.value }))}
                  className={inputCls}
                >
                  <option value="">All teachers</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
                </select>
              </FormField>
              <FormField label="Subject">
                <select
                  value={filter.subjectId}
                  onChange={(event) => setFilter((current) => ({ ...current, subjectId: event.target.value }))}
                  className={inputCls}
                >
                  <option value="">All subjects</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{formatSubjectLabel(subject)}</option>)}
                </select>
              </FormField>
              <FormField label="Evaluation period">
                <select
                  value={filter.periodId}
                  onChange={(event) => setFilter((current) => ({ ...current, periodId: event.target.value }))}
                  className={inputCls}
                >
                  <option value="">All released periods</option>
                  {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                </select>
              </FormField>
              <FormField label="Search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filter.search}
                    onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
                    className={`${inputCls} pl-9`}
                    placeholder="Search feedback"
                  />
                </div>
              </FormField>
            </div>
          </div>

          {consolidated.analysis.themes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Common themes:</span>
              {consolidated.analysis.themes.slice(0, 8).map((theme) => (
                <span key={theme.name} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                  {theme.name} ({theme.count})
                </span>
              ))}
            </div>
          )}

          <section aria-labelledby="comment-list-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="comment-list-title" className="text-sm font-semibold">Written feedback</h2>
              <span className="text-xs text-slate-500">{comments.length} shown</span>
            </div>
            {comments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
                No anonymous comments match these filters.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {comments.slice(0, 100).map((comment, index) => (
                  <motion.article
                    key={comment.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.3) }}
                    className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                        <MessageSquareText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="leading-6 text-slate-800 dark:text-slate-200">{comment.text}</p>
                        <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-300">{comment.teacher}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{comment.subject} / {comment.period}</p>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xl font-bold text-slate-950 dark:text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading anonymous comments">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}
