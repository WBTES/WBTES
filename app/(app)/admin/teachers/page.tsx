"use client";

import * as React from "react";
import { Plus } from "lucide-react";
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
import {
  DataTable,
  FormField,
  inputCls,
  Modal,
  PageHeader,
} from "@/components/data-table";
import { formatSubjectLabel } from "@/lib/utils";
import { db, firebaseReady } from "@/lib/firebase/client";
import { usePrograms } from "@/lib/use-programs";
import {
  authenticatedFetch,
  readApiResponse,
  recordActivity,
} from "@/lib/authenticated-fetch";
import type { Department, Subject, Teacher } from "@/lib/types";
import toast from "react-hot-toast";

const YEAR_LEVELS = ["1st", "2nd", "3rd", "4th"];

export default function AdminTeachersPage() {
  const { programs } = usePrograms();
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Teacher | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    displayName: "",
    email: "",
    employeeId: "",
    departmentId: "",
    subjectIds: [] as string[],
    programIds: [] as string[],
    yearLevels: [] as string[],
    sections: "",
    status: "active" as "active" | "inactive",
  });

  React.useEffect(() => {
    if (!firebaseReady) return;
    const teacherUnsubscribe = onSnapshot(
      query(collection(db, "teachers"), orderBy("displayName")),
      (snapshot) => setTeachers(snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Teacher, "id">),
      })))
    );
    const departmentUnsubscribe = onSnapshot(
      query(collection(db, "departments"), orderBy("name")),
      (snapshot) => setDepartments(snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Department, "id">),
      })))
    );
    const subjectUnsubscribe = onSnapshot(
      query(collection(db, "subjects"), orderBy("name")),
      (snapshot) => setSubjects(snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Subject, "id">),
      })))
    );
    return () => {
      teacherUnsubscribe();
      departmentUnsubscribe();
      subjectUnsubscribe();
    };
  }, []);

  const resetScope = (departmentId: string) => ({
    departmentId,
    subjectIds: [] as string[],
    programIds: programs.filter((program) => program.departmentId === departmentId && program.status === "active").map((program) => program.id),
  });

  const openNew = () => {
    const departmentId = departments[0]?.id ?? "";
    setEditing(null);
    setForm({
      displayName: "",
      email: "",
      employeeId: "",
      ...resetScope(departmentId),
      yearLevels: YEAR_LEVELS.slice(0, 4),
      sections: "",
      status: "active",
    });
    setOpen(true);
  };

  const openEdit = (teacher: Teacher) => {
    setEditing(teacher);
    setForm({
      displayName: teacher.displayName,
      email: teacher.email ?? "",
      employeeId: teacher.employeeId ?? "",
      departmentId: teacher.departmentId,
      subjectIds: teacher.subjectIds ?? [],
      programIds: teacher.programIds ?? programs
        .filter((program) => program.departmentId === teacher.departmentId)
        .map((program) => program.id),
      yearLevels: teacher.yearLevels ?? YEAR_LEVELS.slice(0, 4),
      sections: (teacher.sections ?? []).join(", "),
      status: teacher.status ?? "active",
    });
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.subjectIds.length === 0 || form.programIds.length === 0) {
      toast.error("Assign at least one subject and one Program.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        employeeId: form.employeeId.trim(),
        departmentId: form.departmentId,
        subjectIds: form.subjectIds,
        programIds: form.programIds,
        yearLevels: form.yearLevels,
        sections: form.sections.split(",").map((section) => section.trim()).filter(Boolean),
        status: form.status,
        updatedAt: Date.now(),
      };
      let teacherId = editing?.id ?? "";
      if (editing) {
        await updateDoc(doc(db, "teachers", editing.id), payload);
        const response = await authenticatedFetch("/api/admin/teachers/sync", {
          method: "POST",
          body: JSON.stringify({ teacherId: editing.id }),
        });
        const result = await readApiResponse<{
          assignmentsUpdated: number;
          studentLinks: number;
        }>(response);
        toast.success(
          result.assignmentsUpdated > 0
            ? `Teacher updated and ${result.assignmentsUpdated} assignment${result.assignmentsUpdated === 1 ? "" : "s"} synchronized`
            : "Teacher updated"
        );
      } else {
        const created = await addDoc(collection(db, "teachers"), {
          ...payload,
          createdAt: Date.now(),
          photoURL: null,
        });
        teacherId = created.id;
        toast.success("Teacher created");
      }
      void recordActivity(editing ? "teacher_updated" : "teacher_created", {
        teacherId,
        departmentId: form.departmentId,
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teacher could not be saved.");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (teacher: Teacher) => {
    if (!confirm(`Delete ${teacher.displayName}?`)) return;
    try {
      const [assignments, evaluations, reports] = await Promise.all([
        getDocs(query(collection(db, "teacherAssignments"), where("teacherId", "==", teacher.id))),
        getDocs(query(collection(db, "evaluations"), where("teacherId", "==", teacher.id))),
        getDocs(query(collection(db, "performanceReports"), where("teacherId", "==", teacher.id))),
      ]);
      if (!assignments.empty || !evaluations.empty || !reports.empty) {
        throw new Error("This teacher has evaluation history. Set the record inactive to preserve reports.");
      }
      await deleteDoc(doc(db, "teachers", teacher.id));
      void recordActivity("teacher_deleted", { teacherId: teacher.id });
      toast.success("Teacher deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teacher deletion failed.");
    }
  };

  const departmentSubjects = subjects.filter((subject) => subject.departmentId === form.departmentId);
  const departmentPrograms = programs.filter((program) => program.departmentId === form.departmentId);

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Assign each teacher to a department, subjects, Programs, year levels, and sections."
        action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Add teacher</button>}
      />

      <DataTable
        rows={teachers}
        searchKeys={["displayName", "email", "employeeId", "status"]}
        columns={[
          { key: "displayName", label: "Name" },
          { key: "employeeId", label: "Employee ID", render: (row) => (row as Teacher).employeeId || "—" },
          {
            key: "departmentId",
            label: "Department",
            render: (row) => departments.find((item) => item.id === (row as Teacher).departmentId)?.name ?? "—",
          },
          {
            key: "subjectIds",
            label: "Subjects",
            render: (row) => {
              const names = ((row as Teacher).subjectIds ?? [])
                .map((id) => subjects.find((subject) => subject.id === id)?.code)
                .filter(Boolean);
              return names.length ? names.join(", ") : "No subjects";
            },
          },
          {
            key: "programIds",
            label: "Programs",
            render: (row) => (row as Teacher).programIds
              ?.map((id) => programs.find((program) => program.id === id)?.code)
              .filter(Boolean)
              .join(", ") || "—",
          },
          { key: "status", label: "Status", render: (row) => (row as Teacher).status ?? "active" },
        ]}
        onEdit={openEdit}
        onDelete={remove}
        empty="No teachers yet"
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit teacher" : "Add teacher"} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name">
              <input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className={inputCls} />
            </FormField>
            <FormField label="Employee ID">
              <input value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} className={inputCls} />
            </FormField>
          </div>
          <FormField label="Email" hint="Record and notification address only; teachers do not receive login accounts.">
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputCls} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Department">
              <select
                required
                value={form.departmentId}
                onChange={(event) => setForm({ ...form, ...resetScope(event.target.value) })}
                className={inputCls}
              >
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.code} - {department.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Teacher["status"] & ("active" | "inactive") })} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
          </div>
          <CheckList
            label="Assigned subjects"
            values={form.subjectIds}
            options={departmentSubjects.map((subject) => ({ id: subject.id, label: formatSubjectLabel(subject) }))}
            onChange={(subjectIds) => setForm({ ...form, subjectIds })}
          />
          <CheckList
            label="Assigned Programs"
            values={form.programIds}
            options={departmentPrograms.map((program) => ({ id: program.id, label: `${program.code} - ${program.name}` }))}
            onChange={(programIds) => setForm({ ...form, programIds })}
          />
          <CheckList
            label="Assigned year levels"
            values={form.yearLevels}
            options={YEAR_LEVELS.map((year) => ({ id: year, label: `${year} year` }))}
            onChange={(yearLevels) => setForm({ ...form, yearLevels })}
          />
          <FormField label="Assigned sections" hint="Comma-separated. Leave blank to allow every section in the selected Programs.">
            <input value={form.sections} onChange={(event) => setForm({ ...form, sections: event.target.value })} placeholder="A, B, C" className={inputCls} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">{loading ? "Saving..." : "Save teacher"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CheckList({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: Array<{ id: string; label: string }>;
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(options.map((option) => option.id))}
            disabled={options.length === 0}
            className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={values.length === 0}
            className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="mt-2 grid max-h-44 gap-2 overflow-auto rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2">
        {options.length === 0 ? (
          <p className="text-sm text-slate-500">No matching records are available.</p>
        ) : options.map((option) => (
          <label key={option.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.includes(option.id)}
              onChange={(event) => onChange(
                event.target.checked
                  ? [...values, option.id]
                  : values.filter((value) => value !== option.id)
              )}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
