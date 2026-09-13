"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader } from "@/components/data-table";
import type {
  EvaluationCompletion,
  EvaluationPeriod,
  Subject,
  Teacher,
} from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-extras";

export default function StudentHistoryPage() {
  const { user } = useAuth();
  const [completions, setCompletions] = React.useState<EvaluationCompletion[]>([]);
  const [teachers, setTeachers] = React.useState<Record<string, string>>({});
  const [subjects, setSubjects] = React.useState<Record<string, string>>({});
  const [periods, setPeriods] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!user || !firebaseReady) return;
    const completionQuery = query(
      collection(db, "evaluationCompletions"),
      where("studentId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(completionQuery, (snapshot) => {
      setCompletions(
        snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<EvaluationCompletion, "id">),
          }))
          .sort((a, b) => b.submittedAt - a.submittedAt)
      );
    });

    void (async () => {
      const [teacherSnapshot, subjectSnapshot, periodSnapshot] = await Promise.all([
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "evaluationPeriods")),
      ]);
      setTeachers(Object.fromEntries(
        teacherSnapshot.docs.map((item) => [
          item.id,
          (item.data() as Teacher).displayName,
        ])
      ));
      setSubjects(Object.fromEntries(
        subjectSnapshot.docs.map((item) => [
          item.id,
          (item.data() as Subject).name,
        ])
      ));
      setPeriods(Object.fromEntries(
        periodSnapshot.docs.map((item) => [
          item.id,
          (item.data() as EvaluationPeriod).name,
        ])
      ));
    })();
    return () => unsubscribe();
  }, [user]);

  return (
    <div>
      <PageHeader
        title="My Evaluation History"
        description="Submission receipts are shown here. Your ratings and comments remain separate and anonymous."
      />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {completions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No evaluations submitted yet
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {completions.map((completion) => (
              <div key={completion.id} className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {teachers[completion.teacherId] ?? "Teacher"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {subjects[completion.subjectId] ?? "Subject"} · {periods[completion.periodId] ?? "Period"} · {fmtDateTime(completion.submittedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-600">Completed</p>
                  <p className="text-xs text-slate-500">anonymous response</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
