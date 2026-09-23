"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  LockKeyhole,
  Send,
  UserRound,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import type {
  Department,
  EvaluationPeriod,
  EvaluationQuestion,
  Program,
  Subject,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";
import { getStudentEvaluationQuestions } from "@/lib/evaluation-questions";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";
import { cn, formatSubjectLabel } from "@/lib/utils";
import toast from "react-hot-toast";

export default function EvaluatePage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const [assignment, setAssignment] = React.useState<TeacherAssignment | null>(null);
  const [teacher, setTeacher] = React.useState<Teacher | null>(null);
  const [subject, setSubject] = React.useState<Subject | null>(null);
  const [period, setPeriod] = React.useState<EvaluationPeriod | null>(null);
  const [department, setDepartment] = React.useState<Department | null>(null);
  const [program, setProgram] = React.useState<Program | null>(null);
  const [questions, setQuestions] = React.useState<EvaluationQuestion[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, number | string>>({});
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!params.assignmentId || !firebaseReady || !user || !profile) return;
    (async () => {
      try {
        const aSnap = await getDoc(doc(db, "teacherAssignments", params.assignmentId));
        if (!aSnap.exists()) {
          setLoadError("This assignment doesn't exist or has been removed.");
          return;
        }
        const a = { id: aSnap.id, ...(aSnap.data() as Omit<TeacherAssignment, "id">) };
        setAssignment(a);

        const [tSnap, sSnap, pSnap, dSnap, programSnap, qSnap, eSnap] = await Promise.all([
          getDoc(doc(db, "teachers", a.teacherId)),
          getDoc(doc(db, "subjects", a.subjectId)),
          getDoc(doc(db, "evaluationPeriods", a.periodId)),
          getDoc(doc(db, "departments", a.departmentId)),
          profile.programId ? getDoc(doc(db, "programs", profile.programId)) : Promise.resolve(null),
          getDocs(collection(db, "evaluationQuestions")),
          getDocs(query(
            collection(db, "evaluationCompletions"),
            where("studentId", "==", user.uid)
          )),
        ]);
        if (tSnap.exists()) setTeacher({ id: tSnap.id, ...(tSnap.data() as Omit<Teacher, "id">) });
        if (sSnap.exists()) setSubject({ id: sSnap.id, ...(sSnap.data() as Omit<Subject, "id">) });
        if (dSnap.exists()) setDepartment({ id: dSnap.id, ...(dSnap.data() as Omit<Department, "id">) });
        if (programSnap?.exists()) setProgram({ id: programSnap.id, ...(programSnap.data() as Omit<Program, "id">) });
        const periodData = pSnap.exists()
          ? { id: pSnap.id, ...(pSnap.data() as Omit<EvaluationPeriod, "id">) }
          : null;
        if (periodData) setPeriod(periodData);
        const allQuestions = qSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EvaluationQuestion, "id">),
        }));
        const qs = periodData
          ? getStudentEvaluationQuestions(
              allQuestions,
              periodData,
              profile.programId
            )
          : [];
        setQuestions(qs);
        if (eSnap.docs.some((item) => {
          const completion = item.data();
          return completion.assignmentId === a.id;
        })) {
          setDone(true);
        }
      } catch (err) {
        console.error("evaluate load failed:", err);
        setLoadError(err instanceof Error ? err.message : "Failed to load this evaluation");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.assignmentId, user, profile]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !assignment) return;
    if (done) {
      toast.error("You've already submitted this evaluation");
      return;
    }

    // Validate required
    for (const q of questions) {
      if (q.required && (answers[q.id] === undefined || answers[q.id] === "")) {
        toast.error(`Please answer: ${q.text}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await authenticatedFetch("/api/evaluations/submit", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: assignment.id,
          answers,
          comment,
        }),
      });
      const data = await readApiResponse<{ emailSent: boolean }>(response);
      toast.success(
        data.emailSent
          ? "Evaluation submitted. A confirmation email was sent."
          : "Evaluation submitted successfully."
      );
      setDone(true);
      const queue = new URLSearchParams(window.location.search)
        .get("queue")
        ?.split(",")
        .filter(Boolean) ?? [];
      const currentIndex = queue.indexOf(assignment.id);
      const nextAssignment = currentIndex >= 0 ? queue[currentIndex + 1] : "";
      if (nextAssignment) {
        window.setTimeout(() => {
          router.push(
            `/student/evaluate/${nextAssignment}?queue=${encodeURIComponent(queue.join(","))}`
          );
        }, 900);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" /></div>;
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold">Couldn&apos;t load this evaluation</p>
          <p className="mt-1 text-sm">{loadError}</p>
        </div>
        <Link href="/student/evaluations" className="btn-secondary mt-4 inline-flex">Back to evaluations</Link>
      </div>
    );
  }

  if (!profile || !assignment || !teacher || !subject || !period) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">Evaluation not found.</div>;
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200/80 bg-white p-10 text-center shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">All done!</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          You&apos;ve already submitted the {subject.name} evaluation for {teacher.displayName}. Thanks for your feedback.
        </p>
        <Link href="/student/evaluations" className="btn-primary mt-6">Back to evaluations</Link>
      </div>
    );
  }

  if (period.status !== "open") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-700">
        <p className="font-semibold">This evaluation is not open</p>
        <p className="mt-1 text-sm">The period &ldquo;{period.name}&rdquo; is currently {period.status}.</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
        <p className="font-semibold">No questions are available</p>
        <p className="mt-1 text-sm">
          This period has no active questions assigned to your academic program.
        </p>
        <Link href="/student/evaluations" className="btn-secondary mt-4 inline-flex">
          Back to evaluations
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/student/evaluations" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xl font-bold shadow-sm">
            {teacher.displayName?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">Teacher evaluation</p>
            <h1 className="truncate text-xl font-bold text-slate-900 dark:text-white">{teacher.displayName}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Review the assignment details before answering.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-x-6 gap-y-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-800">
          <AssignmentDetail icon={BookOpen} label="Course/Subject" value={formatSubjectLabel(subject)} />
          <AssignmentDetail icon={UserRound} label="Teacher/Instructor" value={teacher.displayName} />
          <AssignmentDetail icon={GraduationCap} label="Program" value={program ? `${program.code} - ${program.name}` : profile.course || "Not specified"} />
          <AssignmentDetail
            icon={GraduationCap}
            label="Year and Section"
            value={[profile.yearLevel && `${profile.yearLevel} year`, profile.section && `Section ${profile.section}`].filter(Boolean).join(" - ") || "Not specified"}
          />
          <AssignmentDetail icon={Building2} label="Department" value={department ? `${department.code} - ${department.name}` : "Not specified"} />
          <AssignmentDetail icon={CalendarDays} label="Evaluation Period" value={period.name} />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200/60 bg-slate-100 p-3 text-xs text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/80 dark:text-slate-300">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Your response is anonymous. Reports contain aggregate scores and anonymous comments, never your name.</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {i + 1}. {q.text}
              {q.required && <span className="ml-1 text-rose-500">*</span>}
            </p>
            {q.category && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{q.category}</p>}
            <div className="mt-4">
              {q.type === "rating" && (
                <RatingInput
                  value={Number(answers[q.id] ?? 0)}
                  minimum={q.scaleMin ?? 1}
                  maximum={q.scaleMax ?? 5}
                  minimumLabel={q.scaleMinLabel ?? "Strongly disagree"}
                  maximumLabel={q.scaleMaxLabel ?? "Strongly agree"}
                  onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
                />
              )}
              {q.type === "multiple_choice" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options?.map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => setAnswers({ ...answers, [q.id]: o.id })}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                        answers[q.id] === o.id
                          ? "border-brand-600 bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-300 dark:border-brand-500"
                          : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {q.type === "text" && (
                <textarea
                  rows={3}
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800/80 dark:bg-slate-900 dark:text-white"
                />
              )}
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Additional comments <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(optional)</span></p>
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share specific feedback that helps this teacher improve..."
            className="mt-3 w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800/80 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
          {submitting ? "Submitting..." : (<><Send className="h-4 w-4" /> Submit evaluation</>)}
        </button>
      </form>
    </div>
  );
}

function AssignmentDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function RatingInput({
  value,
  minimum,
  maximum,
  minimumLabel,
  maximumLabel,
  onChange,
}: {
  value: number;
  minimum: number;
  maximum: number;
  minimumLabel: string;
  maximumLabel: string;
  onChange: (v: number) => void;
}) {
  const ratings = Array.from(
    { length: maximum - minimum + 1 },
    (_, index) => minimum + index
  );
  return (
    <div role="radiogroup" aria-label="Agreement rating">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${ratings.length}, minmax(0, 1fr))` }}
      >
        {ratings.map((rating) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${rating}${rating === minimum ? ` - ${minimumLabel}` : rating === maximum ? ` - ${maximumLabel}` : ""}`}
            key={rating}
            onClick={() => onChange(rating)}
            className={cn(
              "flex h-11 min-w-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
              value === rating
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-brand-500/10"
            )}
          >
            {rating}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-start justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>{minimum} - {minimumLabel}</span>
        <span className="text-right">{maximum} - {maximumLabel}</span>
      </div>
      <p className="mt-2 min-h-5 text-center text-sm font-medium text-slate-700 dark:text-slate-300" aria-live="polite">
        {value
          ? `${value}${value === minimum ? ` - ${minimumLabel}` : value === maximum ? ` - ${maximumLabel}` : ""}`
          : "Select one response"}
      </p>
    </div>
  );
}
