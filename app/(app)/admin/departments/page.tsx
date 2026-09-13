"use client";

import * as React from "react";
import { Plus } from "lucide-react";
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
      toast.error(error instanceof Error ? error.message : "Delete failed");
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
    </div>
  );
}
