"use client";

import * as React from "react";
import { Eye, FileCheck2, Plus } from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  FormField,
  inputCls,
  Modal,
  PageHeader,
} from "@/components/data-table";
import { EvaluationFormPreview } from "@/components/evaluation-form-preview";
import { recordActivity } from "@/lib/authenticated-fetch";
import type {
  EvaluationForm,
  EvaluationQuestion,
} from "@/lib/types";
import toast from "react-hot-toast";

export default function AdminFormsPage() {
  const [forms, setForms] = React.useState<EvaluationForm[]>([]);
  const [questions, setQuestions] = React.useState<EvaluationQuestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<EvaluationForm | null>(null);
  const [editing, setEditing] = React.useState<EvaluationForm | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    questionIds: [] as string[],
    active: true,
  });

  React.useEffect(() => {
    const formUnsubscribe = onSnapshot(
      query(collection(db, "evaluationForms"), orderBy("name")),
      (snapshot) => setForms(snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EvaluationForm, "id">),
      })))
    );
    const questionUnsubscribe = onSnapshot(
      query(collection(db, "evaluationQuestions"), orderBy("order")),
      (snapshot) => setQuestions(snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EvaluationQuestion, "id">),
      })))
    );
    return () => {
      formUnsubscribe();
      questionUnsubscribe();
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      questionIds: questions.filter((question) => question.active).map((question) => question.id),
      active: true,
    });
    setOpen(true);
  };

  const openEdit = (item: EvaluationForm) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      questionIds: item.questionIds,
      active: item.active,
    });
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.questionIds.length === 0) {
      toast.error("Select at least one question.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        questionIds: form.questionIds,
        active: form.active,
        updatedAt: Date.now(),
      };
      let formId = editing?.id ?? "";
      if (editing) {
        await updateDoc(doc(db, "evaluationForms", editing.id), payload);
        toast.success("Evaluation form updated");
      } else {
        const created = await addDoc(collection(db, "evaluationForms"), {
          ...payload,
          createdAt: Date.now(),
        });
        formId = created.id;
        toast.success("Evaluation form created");
      }
      void recordActivity(editing ? "evaluation_form_updated" : "evaluation_form_created", {
        formId,
        questions: form.questionIds.length,
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Evaluation form could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: EvaluationForm) => {
    if (!confirm(`Delete evaluation form "${item.name}"?`)) return;
    try {
      const periods = await getDocs(query(
        collection(db, "evaluationPeriods"),
        where("formId", "==", item.id)
      ));
      if (!periods.empty) {
        throw new Error("This form is assigned to an evaluation period and cannot be deleted.");
      }
      await deleteDoc(doc(db, "evaluationForms", item.id));
      void recordActivity("evaluation_form_deleted", { formId: item.id });
      toast.success("Evaluation form deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Form deletion failed.");
    }
  };

  const selectedQuestions = (item: EvaluationForm) => questions
    .filter((question) => item.questionIds.includes(question.id))
    .sort((a, b) => item.questionIds.indexOf(a.id) - item.questionIds.indexOf(b.id));

  return (
    <div>
      <PageHeader
        title="Evaluation Forms"
        description="Build reusable forms from the question bank and preview exactly what students will see."
        action={<button type="button" onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> New form</button>}
      />

      <div className="space-y-3">
        {forms.length === 0 ? (
          <div className="border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No reusable evaluation forms yet.
          </div>
        ) : forms.map((item) => (
          <div key={item.id} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{item.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {item.active ? "active" : "inactive"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{item.description || "No description"}</p>
              <p className="mt-1 text-xs text-slate-500">{item.questionIds.length} questions · Rating scale 1 to 5</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPreview(item)} className="btn-secondary"><Eye className="h-4 w-4" /> Preview</button>
              <button type="button" onClick={() => openEdit(item)} className="btn-secondary">Edit</button>
              <button type="button" onClick={() => remove(item)} className="btn-secondary !text-rose-600">Delete</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit evaluation form" : "New evaluation form"} size="lg">
        <form onSubmit={save} className="space-y-4">
          <FormField label="Form name">
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputCls} placeholder="Standard teacher evaluation" />
          </FormField>
          <FormField label="Description">
            <textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputCls} />
          </FormField>
          <FormField label="Questions" hint={`${form.questionIds.length} selected. Their order follows the question bank.`}>
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex justify-end gap-2 border-b border-slate-200 p-2 dark:border-slate-800">
                <button type="button" onClick={() => setForm({ ...form, questionIds: questions.filter((question) => question.active).map((question) => question.id) })} className="text-xs font-semibold text-brand-700 dark:text-brand-300">Select active</button>
                <button type="button" onClick={() => setForm({ ...form, questionIds: [] })} className="text-xs font-semibold text-slate-500">Clear</button>
              </div>
              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {questions.map((question) => (
                  <label key={question.id} className="flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <input
                      type="checkbox"
                      checked={form.questionIds.includes(question.id)}
                      onChange={(event) => setForm({
                        ...form,
                        questionIds: event.target.checked
                          ? [...form.questionIds, question.id]
                          : form.questionIds.filter((id) => id !== question.id),
                      })}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span>
                      <span className="block font-medium">{question.text}</span>
                      <span className="text-xs text-slate-500">{question.category || "Uncategorized"} · {question.type.replace("_", " ")}{!question.active && " · inactive"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Form is active and available for scheduling
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save form"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name ?? "Evaluation form preview"} size="lg">
        {preview && <EvaluationFormPreview questions={selectedQuestions(preview)} />}
      </Modal>
    </div>
  );
}
