"use client";

import * as React from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { ListTree, Plus } from "lucide-react";
import { db, firebaseReady } from "@/lib/firebase/client";
import {
  DataTable,
  FormField,
  inputCls,
  Modal,
  PageHeader,
} from "@/components/data-table";
import type { Department, Program } from "@/lib/types";
import { useAuth } from "@/lib/firebase/auth-context";
import { usePrograms } from "@/lib/use-programs";
import toast from "react-hot-toast";

const EMPTY_FORM = {
  name: "",
  code: "",
  departmentId: "",
  active: true,
};

export default function AdminProgramsPage() {
  const { user } = useAuth();
  const { programs, refresh: refreshPrograms } = usePrograms();
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [editing, setEditing] = React.useState<Program | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!firebaseReady) return;
    const departmentUnsub = onSnapshot(
      query(collection(db, "departments"), orderBy("name")),
      (snapshot) => {
        setDepartments(snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Department, "id">),
        })));
      }
    );
    return () => departmentUnsub();
  }, []);

  const callProgramsApi = async <T,>(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>
  ) => {
    if (!user) throw new Error("Sign in again before using this action.");
    const token = await user.getIdToken();
    const response = await fetch("/api/programs", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Program request failed.");
    return data;
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      departmentId: departments[0]?.id ?? "",
    });
    setOpen(true);
  };

  const openEdit = (program: Program) => {
    setEditing(program);
    setForm({
      name: program.name,
      code: program.code,
      departmentId: program.departmentId,
      active: program.status !== "inactive",
    });
    setOpen(true);
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const code = form.code.trim().toUpperCase();
      const name = form.name.trim();
      const payload = {
        name,
        code,
        departmentId: form.departmentId,
        status: form.active ? "active" as const : "inactive" as const,
      };
      const result = await callProgramsApi<{ linked: number }>(
        editing ? "PATCH" : "POST",
        editing ? { ...payload, id: editing.id } : payload
      );
      await refreshPrograms();
      toast.success(
        `${editing ? "Program updated" : "Program created"}${result.linked > 0 ? `; ${result.linked} student${result.linked === 1 ? "" : "s"} linked` : ""}`
      );
      setOpen(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (program: Program) => {
    try {
      if (!confirm(`Delete ${program.code} - ${program.name}?`)) return;
      await callProgramsApi("DELETE", { id: program.id });
      await refreshPrograms();
      toast.success("Program deleted");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Manage academic programs used for student profiles and targeted questions."
        action={
          <button
            type="button"
            onClick={openNew}
            disabled={departments.length === 0}
            title={departments.length > 0 ? "Add program" : "Create a department first"}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add program
          </button>
        }
      />

      {departments.length === 0 && (
        <div className="mb-5 flex items-start gap-3 border-y border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <ListTree className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">
            Programs belong to a department.{" "}
            <Link href="/admin/departments" className="font-semibold underline">
              Create a department
            </Link>{" "}
            before adding a program.
          </p>
        </div>
      )}

      <DataTable
        rows={programs}
        getId={(program) => program.id}
        searchKeys={["name", "code"]}
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Program" },
          {
            key: "departmentId",
            label: "Department",
            render: (program) =>
              departments.find((item) => item.id === program.departmentId)?.name
              ?? "-",
          },
          {
            key: "status",
            label: "Status",
            render: (program) => (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                program.status === "inactive"
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              }`}>
                {program.status ?? "active"}
              </span>
            ),
          },
        ]}
        onEdit={openEdit}
        onDelete={onDelete}
        empty="No programs yet"
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit program" : "Add program"}
      >
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Program name">
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={inputCls}
              placeholder="Bachelor of Science in Information Technology"
            />
          </FormField>
          <FormField label="Program code">
            <input
              required
              value={form.code}
              onChange={(event) => setForm({
                ...form,
                code: event.target.value.toUpperCase(),
              })}
              className={inputCls}
              placeholder="BSIT"
            />
          </FormField>
          <FormField label="Department">
            <select
              required
              value={form.departmentId}
              onChange={(event) => setForm({
                ...form,
                departmentId: event.target.value,
              })}
              className={inputCls}
            >
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} - {department.name}
                </option>
              ))}
            </select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({
                ...form,
                active: event.target.checked,
              })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Active program
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving..." : editing ? "Update program" : "Create program"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
