"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, GripVertical, CircleDot, Globe2, ListChecks, MessageSquare } from "lucide-react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { usePrograms } from "@/lib/use-programs";
import { recordActivity } from "@/lib/authenticated-fetch";
import { PageHeader, Modal, FormField, inputCls } from "@/components/data-table";
import type { EvaluationQuestion, Program, QuestionType } from "@/lib/types";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const TYPES: { value: QuestionType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "rating", label: "1–5 agreement scale", icon: CircleDot },
  { value: "multiple_choice", label: "Multiple choice", icon: ListChecks },
  { value: "text", label: "Open text", icon: MessageSquare },
];

const CATEGORIES = [
  "Teaching Effectiveness",
  "Subject Knowledge",
  "Communication Skills",
  "Classroom Management",
  "Professionalism",
  "Student Engagement",
];

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = React.useState<EvaluationQuestion[]>([]);
  const { programs } = usePrograms();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EvaluationQuestion | null>(null);
  const [form, setForm] = React.useState({
    text: "",
    category: CATEGORIES[0],
    type: "rating" as QuestionType,
    required: true,
    active: true,
    scopeType: "all" as "all" | "programs",
    programIds: [] as string[],
    scaleMinLabel: "Strongly disagree",
    scaleMaxLabel: "Strongly agree",
    options: [] as { id: string; label: string; value: number }[],
  });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!firebaseReady) return;
    const q = query(collection(db, "evaluationQuestions"), orderBy("order"));
    const unsub = onSnapshot(q, (snap) =>
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationQuestion, "id">) })))
    );
    return () => unsub();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      text: "",
      category: CATEGORIES[0],
      type: "rating",
      required: true,
      active: true,
      scopeType: "all",
      programIds: [],
      scaleMinLabel: "Strongly disagree",
      scaleMaxLabel: "Strongly agree",
      options: [],
    });
    setOpen(true);
  };
  const openEdit = (q: EvaluationQuestion) => {
    setEditing(q);
    setForm({
      text: q.text,
      category: q.category ?? CATEGORIES[0],
      type: q.type,
      required: q.required,
      active: q.active,
      scopeType: q.scopeType ?? "all",
      programIds: q.programIds ?? [],
      scaleMinLabel: q.scaleMinLabel ?? "Strongly disagree",
      scaleMaxLabel: q.scaleMaxLabel ?? "Strongly agree",
      options: q.options ?? [],
    });
    setOpen(true);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (form.scopeType === "programs" && form.programIds.length === 0) {
        throw new Error("Select at least one program or use All programs");
      }
      if (form.type === "multiple_choice") {
        if (form.options.length < 2 || form.options.length > 6) {
          throw new Error("Multiple-choice questions require 2 to 6 options");
        }
        if (form.options.some((option) => !option.label.trim())) {
          throw new Error("Enter a label for every option");
        }
        if (form.options.some((option) => !Number.isFinite(option.value))) {
          throw new Error("Every option must have a numeric weight");
        }
      }
      const payload = {
        text: form.text.trim(),
        category: form.category,
        type: form.type,
        scopeType: form.scopeType,
        programIds: form.scopeType === "programs" ? form.programIds : [],
        required: form.required,
        active: form.active,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: form.scaleMinLabel.trim() || "Strongly disagree",
        scaleMaxLabel: form.scaleMaxLabel.trim() || "Strongly agree",
        order: editing?.order ?? questions.length,
        ...(form.type === "multiple_choice"
          ? {
              options: form.options.map((option) => ({
                ...option,
                label: option.label.trim(),
              })),
            }
          : editing
            ? { options: deleteField() }
            : {}),
      };
      if (editing) {
        await updateDoc(doc(db, "evaluationQuestions", editing.id), payload);
        toast.success("Question updated");
      } else {
        const created = await addDoc(collection(db, "evaluationQuestions"), { ...payload, createdAt: Date.now() });
        void recordActivity("evaluation_question_created", { questionId: created.id });
        toast.success("Question created");
      }
      if (editing) void recordActivity("evaluation_question_updated", { questionId: editing.id });
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (q: EvaluationQuestion) => {
    try {
      const [forms, periods] = await Promise.all([
        getDocs(query(collection(db, "evaluationForms"), where("questionIds", "array-contains", q.id))),
        getDocs(query(collection(db, "evaluationPeriods"), where("questionIds", "array-contains", q.id))),
      ]);
      if (!forms.empty || !periods.empty) {
        throw new Error("Remove this question from all forms and schedules before deleting it.");
      }
      if (!confirm("Delete this question?")) return;
      await deleteDoc(doc(db, "evaluationQuestions", q.id));
      void recordActivity("evaluation_question_deleted", { questionId: q.id });
      toast.success("Question deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Question deletion failed.");
    }
  };

  const addOption = () => {
    setForm({
      ...form,
      options: [...form.options, { id: `opt${Date.now()}`, label: "", value: form.options.length + 1 }],
    });
  };

  const moveQuestion = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const current = questions[index];
    const target = questions[targetIndex];
    try {
      await Promise.all([
        updateDoc(doc(db, "evaluationQuestions", current.id), { order: target.order }),
        updateDoc(doc(db, "evaluationQuestions", target.id), { order: current.order }),
      ]);
      void recordActivity("evaluation_questions_reordered", { questionId: current.id });
      toast.success("Question order updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Question order could not be updated");
    }
  };

  const toggleActive = async (q: EvaluationQuestion) => {
    try {
      await updateDoc(doc(db, "evaluationQuestions", q.id), { active: !q.active });
      void recordActivity("evaluation_question_status_changed", {
        questionId: q.id,
        active: !q.active,
      });
      toast.success(q.active ? "Question deactivated" : "Question activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Question status could not be updated");
    }
  };

  return (
    <div>
      <PageHeader
        title="Evaluation Questions"
        description="Build the question bank used in every evaluation period."
        action={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Add question
          </button>
        }
      />

      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No questions yet. Create your first one to get started.
          </div>
        ) : (
          questions.map((q, i) => (
            <div
              key={q.id}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <GripVertical className="h-4 w-4 text-slate-400" />
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{q.text}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 font-medium",
                    q.type === "rating" && "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
                    q.type === "multiple_choice" && "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
                    q.type === "text" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  )}>
                    {q.type.replace("_", " ")}
                  </span>
                  {q.category && <span>{q.category}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {questionScopeLabel(q, programs)}
                  </span>
                  {q.required && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Required</span>}
                  {!q.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Inactive</span>}
                </div>
              </div>
              <button disabled={i === 0} onClick={() => moveQuestion(i, -1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40 dark:hover:bg-slate-800">
                Up
              </button>
              <button disabled={i === questions.length - 1} onClick={() => moveQuestion(i, 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40 dark:hover:bg-slate-800">
                Down
              </button>
              <button onClick={() => toggleActive(q)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800">
                {q.active ? "Deactivate" : "Activate"}
              </button>
              <button onClick={() => openEdit(q)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800">
                Edit
              </button>
              <button onClick={() => onDelete(q)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit question" : "Add question"}
        size="lg"
        contentClassName="h-[calc(90dvh-5rem)] overflow-hidden pb-0"
      >
        <form onSubmit={onSave} className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
          <FormField label="Question text">
            <textarea
              required
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              rows={2}
              className={inputCls}
              placeholder="How would you rate this teacher's explanations?"
            />
          </FormField>
          <FormField label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Applies to"
            hint="Keep shared evaluation criteria available to all programs."
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({
                  ...form,
                  scopeType: "all",
                  programIds: [],
                })}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                  form.scopeType === "all"
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <Globe2 className="h-4 w-4" /> All programs
              </button>
              <button
                type="button"
                disabled={programs.every((program) =>
                  program.status === "inactive" && !form.programIds.includes(program.id)
                )}
                onClick={() => setForm({ ...form, scopeType: "programs" })}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  form.scopeType === "programs"
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <ListChecks className="h-4 w-4" /> Selected programs
              </button>
            </div>
            {form.scopeType === "programs" && (
              <div className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {programs.map((program) => {
                  const checked = form.programIds.includes(program.id);
                  const inactive = program.status === "inactive";
                  return (
                    <label
                      key={program.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={inactive && !checked}
                        onChange={(event) => {
                          const programIds = event.target.checked
                            ? [...form.programIds, program.id]
                            : form.programIds.filter((programId) => programId !== program.id);
                          setForm({ ...form, programIds });
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 dark:text-white">
                          {program.code} - {program.name}
                        </span>
                        {inactive && (
                          <span className="block text-xs text-slate-500">Inactive</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {programs.length === 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                No programs are available.{" "}
                <Link href="/admin/programs" className="font-semibold underline">
                  Create a program
                </Link>{" "}
                before targeting a question.
              </p>
            )}
          </FormField>
          <FormField label="Type">
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setForm({ ...form, type: t.value })}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all",
                    form.type === t.value
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                      : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </FormField>
          {form.type === "rating" && (
            <FormField label="Rating scale (1-5)" hint="Set the endpoint labels shown below the five-point scale.">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  value={form.scaleMinLabel}
                  onChange={(event) => setForm({ ...form, scaleMinLabel: event.target.value })}
                  className={inputCls}
                  placeholder="1 - Strongly disagree"
                />
                <input
                  required
                  value={form.scaleMaxLabel}
                  onChange={(event) => setForm({ ...form, scaleMaxLabel: event.target.value })}
                  className={inputCls}
                  placeholder="5 - Strongly agree"
                />
              </div>
            </FormField>
          )}
          {form.type === "multiple_choice" && (
            <FormField label="Options" hint="Add 2-6 options">
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      value={opt.label}
                      onChange={(e) => {
                        const next = [...form.options];
                        next[i] = { ...opt, label: e.target.value };
                        setForm({ ...form, options: next });
                      }}
                      className={inputCls}
                      placeholder={`Option ${i + 1}`}
                    />
                    <input
                      type="number"
                      value={opt.value}
                      onChange={(e) => {
                        const next = [...form.options];
                        next[i] = { ...opt, value: Number(e.target.value) };
                        setForm({ ...form, options: next });
                      }}
                      className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                      placeholder="Weight"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addOption}
                  disabled={form.options.length >= 6}
                  className="btn-secondary w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Add option
                </button>
              </div>
            </FormField>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Required question
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Active question
          </label>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white py-4 dark:border-slate-800 dark:bg-slate-900">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function questionScopeLabel(
  question: EvaluationQuestion,
  programs: Program[]
) {
  if (question.scopeType !== "programs") return "All programs";
  const selected = programs.filter((program) =>
    question.programIds?.includes(program.id)
  );
  if (selected.length === 0) return "No programs";
  if (selected.length === 1) return selected[0].code;
  return `${selected[0].code} +${selected.length - 1}`;
}
