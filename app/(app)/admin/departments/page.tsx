"use client";

import * as React from "react";
import { GitMerge, Plus } from "lucide-react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { DataTable, PageHeader, Modal, FormField, inputCls } from "@/components/data-table";
import type { Department } from "@/lib/types";
import {
  authenticatedFetch,
  readApiResponse,
} from "@/lib/authenticated-fetch";
import toast from "react-hot-toast";

export default function AdminDepartmentsPage() {
  const [depts, setDepts] = React.useState<Department[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Department | null>(null);
  const [form, setForm] = React.useState({ name: "", code: "" });
  const [loading, setLoading] = React.useState(false);
  const [mergeSource, setMergeSource] = React.useState<Department | null>(null);
  const [mergeTargetId, setMergeTargetId] = React.useState("");
  const [mergeConfirmation, setMergeConfirmation] = React.useState("");
  const [merging, setMerging] = React.useState(false);

  React.useEffect(() => {
    if (!firebaseReady) return;
    const q = query(collection(db, "departments"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => setDepts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Department, "id">) }))));
    return () => unsub();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", code: "" });
    setOpen(true);
  };
  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({ name: d.name, code: d.code });
    setOpen(true);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/admin/departments", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          id: editing?.id,
          name: form.name,
          code: form.code,
        }),
      });
      await readApiResponse<{ ok: true; id: string }>(response);
      toast.success(editing ? "Department updated" : "Department created");
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (d: Department) => {
    try {
      if (!confirm(`Delete ${d.name}?`)) return;
      const response = await authenticatedFetch(
        `/api/admin/departments?id=${encodeURIComponent(d.id)}`,
        { method: "DELETE" }
      );
      await readApiResponse<{ ok: true }>(response);
      toast.success("Department deleted");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Delete failed";
      if (message.startsWith("Cannot delete this department while it is used by:")) {
        setMergeSource(d);
        setMergeTargetId(depts.find((department) => department.id !== d.id)?.id ?? "");
        setMergeConfirmation("");
        toast.error("This department is in use. Merge it into another department to preserve its records.");
      } else {
        toast.error(message);
      }
    }
  };

  const onMerge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mergeSource || !mergeTargetId || mergeConfirmation !== mergeSource.code) return;
    setMerging(true);
    try {
      const response = await authenticatedFetch("/api/admin/departments", {
        method: "PUT",
        body: JSON.stringify({
          sourceId: mergeSource.id,
          targetId: mergeTargetId,
        }),
      });
      const result = await readApiResponse<{ ok: true; migratedRecords: number }>(response);
      toast.success(`Department merged. ${result.migratedRecords} linked record${result.migratedRecords === 1 ? "" : "s"} moved.`);
      setMergeSource(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Department merge failed.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Organize teachers and subjects into departments."
        action={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Add department
          </button>
        }
      />
      <DataTable
        rows={depts}
        searchKeys={["name", "code"]}
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
        ]}
        onEdit={openEdit}
        onDelete={onDelete}
        empty="No departments yet"
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit department" : "Add department"}>
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Department of Sciences" />
          </FormField>
          <FormField label="Code">
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} placeholder="SCI" />
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

      <Modal
        open={Boolean(mergeSource)}
        onClose={() => !merging && setMergeSource(null)}
        title="Merge department"
      >
        {mergeSource && (
          <form onSubmit={onMerge} className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              <GitMerge className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Preserve linked records</p>
                <p className="mt-1 text-sm leading-6">
                  Programs, teachers, students, subjects, assignments, evaluations, completions, reports, and targeted announcements will move to the destination department. Then {mergeSource.code} will be deleted.
                </p>
              </div>
            </div>
            <FormField label="Destination department">
              <select
                required
                value={mergeTargetId}
                onChange={(event) => setMergeTargetId(event.target.value)}
                className={inputCls}
              >
                <option value="">Select destination</option>
                {depts.filter((department) => department.id !== mergeSource.id).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.code} - {department.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={`Type ${mergeSource.code} to confirm`}>
              <input
                value={mergeConfirmation}
                onChange={(event) => setMergeConfirmation(event.target.value.toUpperCase())}
                className={inputCls}
                autoComplete="off"
              />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setMergeSource(null)} disabled={merging} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={merging || !mergeTargetId || mergeConfirmation !== mergeSource.code}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GitMerge className="h-4 w-4" /> {merging ? "Merging..." : "Merge and delete"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
