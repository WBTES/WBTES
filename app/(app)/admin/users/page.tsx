"use client";

import * as React from "react";
import {
  Building2,
  Eye,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { usePrograms } from "@/lib/use-programs";
import {
  FormField,
  inputCls,
  Modal,
  PageHeader,
} from "@/components/data-table";
import {
  authenticatedFetch,
  readApiResponse,
} from "@/lib/authenticated-fetch";
import { requestAdminNavigationRefresh } from "@/lib/admin-navigation";
import type {
  AppUser,
  Department,
  EvaluationCompletion,
  Program,
  StudentRegistry,
  TeacherAssignment,
} from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-extras";
import { formatRoleLabel } from "@/lib/utils";
import toast from "react-hot-toast";

type ManagedStudent = StudentRegistry & {
  accountCreated: boolean;
  emailVerified: boolean;
  lastLoginAt: number;
  orphaned?: boolean;
};

type StudentForm = {
  displayName: string;
  email: string;
  studentNumber: string;
  programId: string;
  yearLevel: string;
  section: string;
  status: "pending" | "active" | "disabled";
};

type StaffForm = {
  displayName: string;
  email: string;
  username: string;
  password: string;
  role: "admin" | "hr" | "department_head";
  departmentId: string;
  employeeId: string;
  status: "active" | "disabled";
};

const emptyStudent: StudentForm = {
  displayName: "",
  email: "",
  studentNumber: "",
  programId: "",
  yearLevel: "",
  section: "",
  status: "pending",
};

const emptyStaff: StaffForm = {
  displayName: "",
  email: "",
  username: "",
  password: "",
  role: "department_head",
  departmentId: "",
  employeeId: "",
  status: "active",
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const [tab, setTab] = React.useState<"students" | "staff">("students");
  const [students, setStudents] = React.useState<ManagedStudent[]>([]);
  const [staff, setStaff] = React.useState<AppUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [studentOpen, setStudentOpen] = React.useState(false);
  const [staffOpen, setStaffOpen] = React.useState(false);
  const [profileStudent, setProfileStudent] = React.useState<ManagedStudent | null>(null);
  const [editingStudent, setEditingStudent] = React.useState<ManagedStudent | null>(null);
  const [editingStaff, setEditingStaff] = React.useState<AppUser | null>(null);
  const [studentForm, setStudentForm] = React.useState<StudentForm>(emptyStudent);
  const [staffForm, setStaffForm] = React.useState<StaffForm>(emptyStaff);
  const [searchText, setSearchText] = React.useState("");
  const [studentFilters, setStudentFilters] = React.useState({
    programId: "",
    yearLevel: "",
    status: "",
  });
  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [studentResponse, staffResponse, departmentSnapshot] = await Promise.all([
        authenticatedFetch("/api/admin/students"),
        authenticatedFetch("/api/admin/accounts"),
        getDocs(collection(db, "departments")),
      ]);
      const studentData = await readApiResponse<{ registrations: ManagedStudent[] }>(
        studentResponse
      );
      const staffData = await readApiResponse<{ accounts: AppUser[] }>(
        staffResponse
      );
      setStudents(studentData.registrations);
      setStaff(staffData.accounts);
      setDepartments(departmentSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Department, "id">),
      })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "User records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "pending") {
      setStudentFilters((current) => ({ ...current, status: "pending" }));
    }
  }, []);

  const visibleStudents = React.useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return students.filter((student) => {
      if (studentFilters.programId && student.programId !== studentFilters.programId) return false;
      if (studentFilters.yearLevel && student.yearLevel !== studentFilters.yearLevel) return false;
      if (studentFilters.status && student.status !== studentFilters.status) return false;
      if (!search) return true;
      const program = programs.find((item) => item.id === student.programId);
      return [
        student.displayName,
        student.email,
        student.studentNumber,
        student.section,
        student.yearLevel,
        program?.code,
        program?.name,
        student.status,
      ].some((value) => value?.toLowerCase().includes(search));
    });
  }, [programs, searchText, studentFilters, students]);

  const visibleStaff = React.useMemo(() => {
    const search = searchText.trim().toLowerCase();
    if (!search) return staff;
    return staff.filter((account) => [
      account.displayName,
      account.email,
      account.username,
      account.role,
      account.status,
      departments.find((item) => item.id === account.departmentId)?.name,
    ].some((value) => value?.toLowerCase().includes(search)));
  }, [departments, searchText, staff]);

  const openStudentEdit = (student: ManagedStudent) => {
    setEditingStudent(student);
    setStudentForm({
      displayName: student.displayName,
      email: student.email,
      studentNumber: student.studentNumber ?? "",
      programId: student.programId,
      yearLevel: student.yearLevel,
      section: student.section,
      status: student.status,
    });
    setStudentOpen(true);
  };

  const saveStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingStudent) return;
    setSaving(true);
    try {
      const response = await authenticatedFetch("/api/admin/students", {
        method: "PATCH",
        body: JSON.stringify({ id: editingStudent.id, ...studentForm }),
      });
      await readApiResponse(response);
      toast.success("Student updated");
      setStudentOpen(false);
      await load();
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStudent = async (student: ManagedStudent) => {
    if (student.status === "pending") return;
    const nextStatus = student.status === "active" ? "disabled" : "active";
    const action = nextStatus === "disabled"
        ? "Deactivate"
        : "Reactivate";
    if (!confirm(`${action} ${student.displayName}?`)) return;
    try {
      const response = await authenticatedFetch("/api/admin/students", {
        method: "PATCH",
        body: JSON.stringify({
          id: student.id,
          displayName: student.displayName,
          email: student.email,
          studentNumber: student.studentNumber ?? "",
          programId: student.programId,
          yearLevel: student.yearLevel,
          section: student.section,
          status: nextStatus,
        }),
      });
      await readApiResponse(response);
      toast.success(
        nextStatus === "disabled"
            ? "Student deactivated"
            : "Student reactivated"
      );
      await load();
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status update failed.");
    }
  };

  const deleteStudent = async (student: ManagedStudent) => {
    if (!confirm(`Delete ${student.displayName}'s registration and login account? Anonymous responses will remain.`)) return;
    try {
      const response = await authenticatedFetch(
        `/api/admin/students?id=${encodeURIComponent(student.id)}`,
        { method: "DELETE" }
      );
      await readApiResponse(response);
      toast.success("Student deleted");
      await load();
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Student deletion failed.");
    }
  };

  const openStaffCreate = () => {
    setEditingStaff(null);
    setStaffForm(emptyStaff);
    setStaffOpen(true);
  };

  const openStaffEdit = (account: AppUser) => {
    setEditingStaff(account);
    setStaffForm({
      displayName: account.displayName,
      email: account.email,
      username: account.username ?? account.email.split("@")[0],
      password: "",
      role: account.role === "admin" || account.role === "hr" ? account.role : "department_head",
      departmentId: account.departmentId ?? "",
      employeeId: account.employeeId ?? "",
      status: account.status === "disabled" ? "disabled" : "active",
    });
    setStaffOpen(true);
  };

  const saveStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await authenticatedFetch("/api/admin/accounts", {
        method: editingStaff ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(editingStaff ? { uid: editingStaff.uid } : {}),
          ...staffForm,
        }),
      });
      const result = await readApiResponse<{ warning?: string }>(response);
      toast.success(editingStaff ? "Staff account updated" : "Staff account created");
      if (result.warning) toast.error(result.warning, { duration: 7000 });
      setStaffOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Staff account could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const deleteStaff = async (account: AppUser) => {
    if (!confirm(`Delete ${account.displayName}'s login account?`)) return;
    try {
      const response = await authenticatedFetch(
        `/api/admin/accounts?uid=${encodeURIComponent(account.uid)}`,
        { method: "DELETE" }
      );
      await readApiResponse(response);
      toast.success("Staff account deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Staff deletion failed.");
    }
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Manage student records and administer staff login accounts."
        action={
          tab === "students" ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <UserRound className="h-4 w-4" />
              {students.length} registered student{students.length === 1 ? "" : "s"}
            </div>
          ) : (
            <button type="button" onClick={openStaffCreate} className="btn-primary">
              <Building2 className="h-4 w-4" /> New staff account
            </button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center">
        <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab("students")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "students" ? "bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500"}`}
          >
            Students
          </button>
          <button
            type="button"
            onClick={() => setTab("staff")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "staff" ? "bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-500"}`}
          >
            Administrators, HR, and Department Heads
          </button>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={tab === "students" ? "Search student, email, Program, year, or section" : "Search staff account"}
            className={`${inputCls} pl-10`}
          />
        </div>
      </div>

      {tab === "students" ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <select
              value={studentFilters.programId}
              onChange={(event) => setStudentFilters({ ...studentFilters, programId: event.target.value })}
              className={inputCls}
              aria-label="Filter by Program"
            >
              <option value="">All Programs</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>{program.code}</option>
              ))}
            </select>
            <select
              value={studentFilters.yearLevel}
              onChange={(event) => setStudentFilters({ ...studentFilters, yearLevel: event.target.value })}
              className={inputCls}
              aria-label="Filter by year level"
            >
              <option value="">All year levels</option>
              {["1st", "2nd", "3rd", "4th"].map((year) => (
                <option key={year} value={year}>{year} year</option>
              ))}
            </select>
            <select
              value={studentFilters.status}
              onChange={(event) => setStudentFilters({ ...studentFilters, status: event.target.value })}
              className={inputCls}
              aria-label="Filter by account status"
            >
              <option value="">All account statuses</option>
              <option value="pending">Pending first sign-in</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <StudentTable
            rows={visibleStudents}
            programs={programs}
            loading={loading}
            onView={setProfileStudent}
            onEdit={openStudentEdit}
            onToggle={toggleStudent}
            onDelete={deleteStudent}
          />
        </>
      ) : (
        <StaffTable
          rows={visibleStaff}
          loading={loading}
          onEdit={openStaffEdit}
          onDelete={deleteStaff}
        />
      )}

      <StudentModal
        open={studentOpen}
        editing={editingStudent}
        form={studentForm}
        programs={programs}
        saving={saving}
        setForm={setStudentForm}
        onClose={() => setStudentOpen(false)}
        onSubmit={saveStudent}
      />

      <StaffModal
        open={staffOpen}
        editing={editingStaff}
        form={staffForm}
        saving={saving}
        setForm={setStaffForm}
        onClose={() => setStaffOpen(false)}
        onSubmit={saveStaff}
      />

      <StudentProfileModal
        student={profileStudent}
        program={programs.find((item) => item.id === profileStudent?.programId)}
        department={departments.find((item) => item.id === profileStudent?.departmentId)}
        onClose={() => setProfileStudent(null)}
      />
    </div>
  );
}

function StudentTable({
  rows,
  programs,
  loading,
  onView,
  onEdit,
  onToggle,
  onDelete,
}: {
  rows: ManagedStudent[];
  programs: Program[];
  loading: boolean;
  onView: (student: ManagedStudent) => void;
  onEdit: (student: ManagedStudent) => void;
  onToggle: (student: ManagedStudent) => void;
  onDelete: (student: ManagedStudent) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Program</th>
            <th className="px-4 py-3">Year / Section</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading students...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No students match these filters.</td></tr>
          ) : rows.map((student) => (
            <tr key={student.id}>
              <td className="px-4 py-3">
                <p className="font-semibold">{student.displayName}</p>
                <p className="text-xs text-slate-500">{student.email}</p>
                {student.studentNumber && <p className="text-xs text-slate-500">{student.studentNumber}</p>}
              </td>
              <td className="px-4 py-3">
                {programs.find((item) => item.id === student.programId)?.code ?? student.course}
              </td>
              <td className="px-4 py-3">{student.yearLevel} / {student.section}</td>
              <td className="px-4 py-3">
                {student.orphaned ? (
                  <span className="text-rose-700 dark:text-rose-300">Account record missing</span>
                ) : student.accountCreated ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {student.status === "pending" ? "Pending first sign-in" : "Ready"}
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">Not activated</span>
                )}
              </td>
              <td className="px-4 py-3"><StatusBadge status={student.status} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <IconButton label="View profile" onClick={() => onView(student)}><Eye className="h-4 w-4" /></IconButton>
                  <IconButton label="Edit student" onClick={() => onEdit(student)}><UserRound className="h-4 w-4" /></IconButton>
                  {student.status !== "pending" && (
                    <IconButton
                      label={student.status === "disabled" ? "Reactivate" : "Deactivate"}
                      onClick={() => onToggle(student)}
                    >
                      <Power className="h-4 w-4" />
                    </IconButton>
                  )}
                  <IconButton label="Delete student" danger onClick={() => onDelete(student)}><Trash2 className="h-4 w-4" /></IconButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffTable({
  rows,
  loading,
  onEdit,
  onDelete,
}: {
  rows: AppUser[];
  loading: boolean;
  onEdit: (account: AppUser) => void;
  onDelete: (account: AppUser) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Username</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading staff...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No staff accounts found.</td></tr>
          ) : rows.map((account) => (
            <tr key={account.uid}>
              <td className="px-4 py-3">
                <p className="font-semibold">{account.displayName}</p>
                <p className="text-xs text-slate-500">{account.email}</p>
              </td>
              <td className="px-4 py-3">{account.username ?? "—"}</td>
              <td className="px-4 py-3">{formatRoleLabel(account.role)}</td>
              <td className="px-4 py-3"><StatusBadge status={account.status ?? "active"} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <IconButton label="Edit staff account" onClick={() => onEdit(account)}><UserRound className="h-4 w-4" /></IconButton>
                  {account.role === "admin" ? (
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400"
                      title="Administrator accounts cannot be deleted"
                      aria-label="Administrator account protected from deletion"
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                  ) : (
                    <IconButton label="Delete staff account" danger onClick={() => onDelete(account)}><Trash2 className="h-4 w-4" /></IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentModal({
  open,
  editing,
  form,
  programs,
  saving,
  setForm,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: ManagedStudent | null;
  form: StudentForm;
  programs: Program[];
  saving: boolean;
  setForm: React.Dispatch<React.SetStateAction<StudentForm>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Edit student">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name">
            <input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className={inputCls} />
          </FormField>
          <FormField label="Student number">
            <input value={form.studentNumber} onChange={(event) => setForm({ ...form, studentNumber: event.target.value })} className={inputCls} />
          </FormField>
        </div>
        <FormField label="Registered school email" hint="Email cannot be changed after registration.">
          <input required type="email" disabled value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputCls} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Program">
            <select required value={form.programId} onChange={(event) => setForm({ ...form, programId: event.target.value })} className={inputCls}>
              <option value="">Select Program</option>
              {programs.filter((program) => program.status === "active" || program.id === form.programId).map((program) => (
                <option key={program.id} value={program.id}>{program.code} - {program.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Year level">
            <select required value={form.yearLevel} onChange={(event) => setForm({ ...form, yearLevel: event.target.value })} className={inputCls}>
              <option value="">Select</option>
              {["1st", "2nd", "3rd", "4th"].map((year) => (
                <option key={year} value={year}>{year} year</option>
              ))}
            </select>
          </FormField>
          <FormField label="Section">
            <input required value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} className={inputCls} />
          </FormField>
        </div>
        <FormField label="Account status">
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as StudentForm["status"] })} className={inputCls}>
            {editing?.status === "pending" && <option value="pending">Pending first sign-in</option>}
            {editing?.status !== "pending" && <option value="active">Active</option>}
            <option value="disabled">Disabled</option>
          </select>
        </FormField>
        <ModalActions saving={saving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function StaffModal({
  open,
  editing,
  form,
  saving,
  setForm,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: AppUser | null;
  form: StaffForm;
  saving: boolean;
  setForm: React.Dispatch<React.SetStateAction<StaffForm>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit staff account" : "Create staff account"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Full name">
          <input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className={inputCls} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Username">
            <input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className={inputCls} />
          </FormField>
          <FormField label="Email">
            <input required type="email" disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputCls} />
          </FormField>
        </div>
        {!editing && (
          <FormField label="Temporary password" hint={form.role !== "admin" ? "At least 8 characters. Department staff must also verify their email." : "At least 8 characters."}>
            <input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={inputCls} />
          </FormField>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Role">
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffForm["role"] })} className={inputCls}>
              <option value="department_head">Department Head</option>
              <option value="hr">HR</option>
              <option value="admin">Administrator</option>
            </select>
          </FormField>
          <FormField label="Employee ID">
            <input value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} className={inputCls} />
          </FormField>
        </div>
        {editing && (
          <FormField label="Account status">
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as StaffForm["status"] })} className={inputCls}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </FormField>
        )}
        <ModalActions saving={saving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function StudentProfileModal({
  student,
  program,
  department,
  onClose,
}: {
  student: ManagedStudent | null;
  program?: Program;
  department?: Department;
  onClose: () => void;
}) {
  const [progress, setProgress] = React.useState({
    assigned: 0,
    completed: 0,
    lastSubmittedAt: 0,
    loading: false,
  });

  React.useEffect(() => {
    if (!student?.claimedUid) {
      setProgress({ assigned: 0, completed: 0, lastSubmittedAt: 0, loading: false });
      return;
    }
    void (async () => {
      setProgress((current) => ({ ...current, loading: true }));
      const [assignments, completions] = await Promise.all([
        getDocs(query(
          collection(db, "teacherAssignments"),
          where("studentIds", "array-contains", student.claimedUid)
        )),
        getDocs(query(
          collection(db, "evaluationCompletions"),
          where("studentId", "==", student.claimedUid)
        )),
      ]);
      const completionRows = completions.docs.map((item) => item.data() as EvaluationCompletion);
      const uniqueAssignments = new Set(
        assignments.docs.map((item) => {
          const assignment = item.data() as TeacherAssignment;
          return `${assignment.teacherId}_${assignment.periodId}`;
        })
      );
      setProgress({
        assigned: uniqueAssignments.size,
        completed: completionRows.length,
        lastSubmittedAt: Math.max(0, ...completionRows.map((item) => item.submittedAt)),
        loading: false,
      });
    })();
  }, [student]);

  return (
    <Modal open={Boolean(student)} onClose={onClose} title="Student profile" size="lg">
      {student && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileItem label="Student" value={student.displayName} />
            <ProfileItem label="School email" value={student.email} />
            <ProfileItem label="Student number" value={student.studentNumber || "Not provided"} />
            <ProfileItem label="Program" value={program ? `${program.code} - ${program.name}` : student.course} />
            <ProfileItem label="Department" value={department?.name ?? "Not assigned"} />
            <ProfileItem label="Year and section" value={`${student.yearLevel} year / ${student.section}`} />
            <ProfileItem label="Account" value={student.orphaned ? "Account record missing" : student.accountCreated ? (student.status === "pending" ? "Created, pending first sign-in" : "Created and ready") : "Not created"} />
            <ProfileItem label="Status" value={student.status} />
          </div>
          <div className="grid gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:grid-cols-3">
            <ProfileItem label="Assigned evaluations" value={progress.loading ? "..." : String(progress.assigned)} />
            <ProfileItem label="Completed" value={progress.loading ? "..." : String(progress.completed)} />
            <ProfileItem label="Last submission" value={progress.loading ? "..." : progress.lastSubmittedAt ? fmtDateTime(progress.lastSubmittedAt) : "None"} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function ModalActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "active" | "disabled" }) {
  const style = status === "pending"
    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
    : status === "active"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {status === "pending" ? "pending first sign-in" : status}
    </span>
  );
}

function IconButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-md p-2 ${danger ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" : "text-slate-500 hover:bg-slate-100 hover:text-brand-700 dark:hover:bg-slate-800"}`}
    >
      {children}
    </button>
  );
}
