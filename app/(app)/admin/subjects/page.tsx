"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { DataTable, PageHeader, Modal, FormField, inputCls } from "@/components/data-table";
import type { Subject, Department } from "@/lib/types";
import { recordActivity } from "@/lib/authenticated-fetch";
import toast from "react-hot-toast";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [depts, setDepts] = React.useState<Department[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Subject | null>(null);
  const [form, setForm] = React.useState({ name: "", code: "", departmentId: "" });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!firebaseReady) return;
    const q = query(collection(db, "subjects"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => setSubjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) }))));
    const dq = query(collection(db, "departments"), orderBy("name"));
    const dunsub = onSnapshot(dq, (snap) => setDepts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Department, "id">) }))));
    return () => {
      unsub();
      dunsub();
    };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", code: "", departmentId: depts[0]?.id ?? "" });
    setOpen(true);
  };
  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({ name: s.name, code: s.code ?? "", departmentId: s.departmentId });
    setOpen(true);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "subjects", editing.id), {
          ...form,
          code: form.code.trim().toUpperCase(),
          updatedAt: Date.now(),
        });
        await recordActivity("subject_updated", { subjectId: editing.id });
        toast.success("Subject updated");
      } else {
        const created = await addDoc(collection(db, "subjects"), {
          ...form,
          code: form.code.trim().toUpperCase(),
          createdAt: Date.now(),
        });
        await recordActivity("subject_created", { subjectId: created.id });
        toast.success("Subject created");
      }
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (s: Subject) => {
    try {
      const [assignments, evaluations, reports] = await Promise.all([
        getDocs(query(collection(db, "teacherAssignments"), where("subjectId", "==", s.id))),
        getDocs(query(collection(db, "evaluations"), where("subjectId", "==", s.id))),
        getDocs(query(collection(db, "performanceReports"), where("subjectId", "==", s.id))),
      ]);
      if (!assignments.empty || !evaluations.empty || !reports.empty) {
        throw new Error("This subject cannot be deleted while assignments or evaluation records still use it.");
      }
      if (!confirm(`Delete ${s.name}?`)) return;
      await deleteDoc(doc(db, "subjects", s.id));
      await recordActivity("subject_deleted", { subjectId: s.id });
      toast.success("Subject deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Manage subjects offered in each department."
        action={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Add subject
          </button>
        }
      />
      <DataTable
        rows={subjects}
        searchKeys={["name", "code"]}
        columns={[
          { key: "code", label: "Code", render: (subject) => subject.code?.trim() || "—" },
          { key: "name", label: "Name" },
          {
            key: "departmentId",
            label: "Department",
            render: (s) => depts.find((d) => d.id === s.departmentId)?.name ?? "—",
          },
        ]}
        onEdit={openEdit}
        onDelete={onDelete}
        empty="No subjects yet"
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit subject" : "Add subject"}>
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </FormField>
          <FormField label="Code (optional)" hint="Leave this blank when the subject does not use a separate code.">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="Example: AP5" />
          </FormField>
          <FormField label="Department">
            <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={inputCls}>
              <option value="">Select department</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
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
