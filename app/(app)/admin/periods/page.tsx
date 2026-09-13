"use client";

import * as React from "react";
import { Plus, Calendar, Eye, Play, StopCircle } from "lucide-react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { usePrograms } from "@/lib/use-programs";
import { PageHeader, Modal, FormField, inputCls } from "@/components/data-table";
import { EvaluationFormPreview } from "@/components/evaluation-form-preview";
import { recordActivity } from "@/lib/authenticated-fetch";
import { requestAdminNavigationRefresh } from "@/lib/admin-navigation";
import type { EvaluationForm, EvaluationPeriod, EvaluationQuestion, PeriodStatus, Program } from "@/lib/types";
import toast from "react-hot-toast";
import { fmtDateTime } from "@/lib/utils-extras";

const STATUS_COLORS: Record<PeriodStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  scheduled: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  open: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  closed: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

function toDateTimeLocal(ms: number) {
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function AdminPeriodsPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [questions, setQuestions] = React.useState<EvaluationQuestion[]>([]);
  const [forms, setForms] = React.useState<EvaluationForm[]>([]);
  const [previewQuestions, setPreviewQuestions] = React.useState<EvaluationQuestion[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EvaluationPeriod | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    semester: "1st" as "1st" | "2nd" | "summer",
    academicYear: "",
    startDate: "",
    endDate: "",
    status: "draft" as PeriodStatus,
    formId: "",
    questionIds: [] as string[],
  });
  const [loading, setLoading] = React.useState(false);
  const [changingStatus, setChangingStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!firebaseReady) return;
    const q = query(collection(db, "evaluationPeriods"), orderBy("startDate", "desc"));
    const unsub = onSnapshot(q, (snap) =>
      setPeriods(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationPeriod, "id">) })))
    );
    const qq = query(collection(db, "evaluationQuestions"), orderBy("order"));
    const qunsub = onSnapshot(qq, (snap) =>
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationQuestion, "id">) })))
    );
    const fq = query(collection(db, "evaluationForms"), orderBy("name"));
    const funsub = onSnapshot(fq, (snap) =>
      setForms(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationForm, "id">) })))
    );
    return () => {
      unsub();
      qunsub();
      funsub();
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    const now = Date.now();
    const selectedForm = forms.find((item) => item.active);
    setForm({
      name: "",
      semester: "1st",
      academicYear: "",
      startDate: toDateTimeLocal(now),
      endDate: toDateTimeLocal(now + 30 * 86400000),
      status: "draft",
      formId: selectedForm?.id ?? "",
      questionIds: selectedForm?.questionIds ?? questions.filter((q) => q.active).map((q) => q.id),
    });
    setOpen(true);
  };
  const openEdit = (p: EvaluationPeriod) => {
    if (p.status === "open" || p.status === "closed") {
      toast.error("Open or closed periods are locked to preserve a consistent evaluation form.");
      return;
    }
    setEditing(p);
    setForm({
      name: p.name,
      semester: p.semester,
      academicYear: p.academicYear,
      startDate: toDateTimeLocal(p.startDate),
      endDate: toDateTimeLocal(p.endDate),
      status: p.status,
      formId: p.formId ?? "",
      questionIds: p.questionIds ?? [],
    });
    setOpen(true);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const startDate = new Date(form.startDate).getTime();
    const endDate = new Date(form.endDate).getTime();
    if (endDate <= startDate) {
      toast.error("Closing time must be after opening time");
      return;
    }
    if (form.questionIds.length === 0) {
      toast.error("Select at least one evaluation question");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        semester: form.semester,
        academicYear: form.academicYear,
        startDate,
        endDate,
        status: editing?.status ?? form.status,
        formId: form.formId || null,
        questionIds: form.questionIds,
      };
      if (editing) {
        await updateDoc(doc(db, "evaluationPeriods", editing.id), payload);
        void recordActivity("evaluation_period_updated", { periodId: editing.id });
        toast.success("Period updated");
      } else {
        const created = await addDoc(collection(db, "evaluationPeriods"), { ...payload, createdAt: Date.now() });
        void recordActivity("evaluation_period_created", { periodId: created.id });
        toast.success("Period created");
      }
      setOpen(false);
      requestAdminNavigationRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onStatus = async (p: EvaluationPeriod, status: PeriodStatus) => {
    if (status !== "open" && status !== "closed") return;
    if (status === "closed" && !confirm(`Close ${p.name} and generate its reports?`)) return;
    setChangingStatus(p.id);
    try {
      if (!user) throw new Error("Sign in again before using this action.");
      const token = await user.getIdToken();
      const response = await fetch("/api/periods/status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ periodId: p.id, status }),
      });
      const data = await response.json() as {
        error?: string;
        changed?: boolean;
        notified?: number;
        emailed?: number;
        reports?: number;
        warnings?: string[];
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Period status update failed.");
      }

      if (!data.changed) {
        toast.success(`Period is already ${status}.`);
      } else if (status === "open") {
        toast.success(
          `Period opened: ${data.notified ?? 0} notified, ${data.emailed ?? 0} emailed.`
        );
      } else {
        toast.success(
          `Period closed: ${data.reports ?? 0} report${data.reports === 1 ? "" : "s"} generated.`
        );
      }
      data.warnings?.forEach((warning) => {
        toast.error(warning, { duration: 8000 });
      });
      requestAdminNavigationRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setChangingStatus(null);
    }
  };

  const onDelete = async (p: EvaluationPeriod) => {
    try {
      const collections = [
        "teacherAssignments",
        "evaluations",
        "evaluationCompletions",
        "performanceReports",
      ];
      const dependencies = await Promise.all(collections.map((name) =>
        getDocs(query(collection(db, name), where("periodId", "==", p.id)))
      ));
      if (dependencies.some((snapshot) => !snapshot.empty)) {
        throw new Error("This period has assignments or evaluation history and cannot be deleted.");
      }
      if (!confirm(`Delete period ${p.name}?`)) return;
      await deleteDoc(doc(db, "evaluationPeriods", p.id));
      void recordActivity("evaluation_period_deleted", { periodId: p.id });
      toast.success("Period deleted");
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Period deletion failed.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Evaluation Periods"
        description="Schedule when evaluations are open and which questions are used."
        action={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> New period
          </button>
        }
      />

      <div className="space-y-3">
        {periods.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No evaluation periods yet.
          </div>
        ) : (
          periods.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(p.startDate)} → {fmtDateTime(p.endDate)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewQuestions(
                      questions.filter((question) => p.questionIds?.includes(question.id))
                    )}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                  {(p.status === "draft" || p.status === "scheduled") && (
                    <button
                      onClick={() => onStatus(p, "open")}
                      disabled={changingStatus !== null}
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {changingStatus === p.id ? "Opening..." : "Open"}
                    </button>
                  )}
                  {p.status === "open" && (
                    <button
                      onClick={() => onStatus(p, "closed")}
                      disabled={changingStatus !== null}
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      {changingStatus === p.id ? "Closing..." : "Close"}
                    </button>
                  )}
                  {(p.status === "draft" || p.status === "scheduled") && (
                    <button onClick={() => openEdit(p)} className="btn-secondary !px-3 !py-1.5 text-xs">
                      Edit
                    </button>
                  )}
                  <button onClick={() => onDelete(p)} className="btn-secondary !px-3 !py-1.5 text-xs !text-rose-600">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit period" : "New evaluation period"}>
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="1st Semester 2025-2026" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Semester">
              <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value as "1st" | "2nd" | "summer" })} className={inputCls}>
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="summer">Summer</option>
              </select>
            </FormField>
            <FormField label="Academic year">
              <input required value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} className={inputCls} placeholder="2025-2026" />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Opening time">
              <input required type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="Closing time">
              <input required type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
            </FormField>
          </div>
          {editing && (editing.status === "open" || editing.status === "closed") ? (
            <FormField label="Status" hint="Use the period action button to change an active period's status.">
              <div className={`rounded-xl px-3 py-2.5 text-sm font-medium ${STATUS_COLORS[editing.status]}`}>{editing.status}</div>
            </FormField>
          ) : (
            <FormField label="Initial status" hint="Scheduled periods open and close automatically while the free maintenance runner is active.">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PeriodStatus })} className={inputCls}>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </FormField>
          )}
          <FormField label="Evaluation form" hint="Selecting a reusable form copies its ordered questions into this period.">
            <select
              value={form.formId}
              onChange={(event) => {
                const selected = forms.find((item) => item.id === event.target.value);
                setForm({
                  ...form,
                  formId: event.target.value,
                  questionIds: selected?.questionIds ?? form.questionIds,
                });
              }}
              className={inputCls}
            >
              <option value="">Custom question selection</option>
              {forms.filter((item) => item.active || item.id === form.formId).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Questions" hint="Only selected active questions appear in this evaluation period.">
            <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              {questions.length === 0 ? (
                <p className="text-sm text-slate-500">No questions yet. Create questions first.</p>
              ) : (
                questions.map((question) => (
                  <label key={question.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={form.questionIds.includes(question.id)}
                      onChange={(e) => {
                        const questionIds = e.target.checked
                          ? [...form.questionIds, question.id]
                          : form.questionIds.filter((id) => id !== question.id);
                        setForm({ ...form, formId: "", questionIds });
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{question.text}</span>
                      <span className="text-xs text-slate-500">
                        {question.category ?? "Uncategorized"} • {question.type.replace("_", " ")}
                        {" "}• {periodQuestionScope(question, programs)}
                        {!question.active && " • inactive"}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPreviewQuestions(
                questions.filter((question) => form.questionIds.includes(question.id))
              )}
              className="btn-secondary"
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={previewQuestions !== null}
        onClose={() => setPreviewQuestions(null)}
        title="Evaluation form preview"
        size="lg"
      >
        <EvaluationFormPreview questions={previewQuestions ?? []} />
      </Modal>
    </div>
  );
}

function periodQuestionScope(
  question: EvaluationQuestion,
  programs: Program[]
) {
  if (question.scopeType !== "programs") return "all programs";
  const codes = programs
    .filter((program) => question.programIds?.includes(program.id))
    .map((program) => program.code);
  return codes.length > 0 ? codes.join(", ") : "no programs";
}
