"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, Eye, Pencil, Plus, UsersRound } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { usePrograms } from "@/lib/use-programs";
import { recordActivity } from "@/lib/authenticated-fetch";
import { PageHeader, Modal, FormField, inputCls } from "@/components/data-table";
import type { AppUser, Subject, Department, EvaluationCompletion, EvaluationPeriod, TeacherAssignment, Teacher } from "@/lib/types";
import toast from "react-hot-toast";
import { fmtDateTime } from "@/lib/utils-extras";
import { formatSubjectLabel } from "@/lib/utils";

export default function AdminAssignmentsPage() {
  const { programs } = usePrograms();
  const [assigns, setAssigns] = React.useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [students, setStudents] = React.useState<AppUser[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [depts, setDepts] = React.useState<Department[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editingAssignment, setEditingAssignment] = React.useState<TeacherAssignment | null>(null);
  const [progressAssignment, setProgressAssignment] = React.useState<TeacherAssignment | null>(null);
  const [completedStudentIds, setCompletedStudentIds] = React.useState<Set<string>>(new Set());
  const [completions, setCompletions] = React.useState<EvaluationCompletion[]>([]);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    teacherId: "",
    subjectId: "",
    periodId: "",
    studentIds: [] as string[],
  });
  const [loading, setLoading] = React.useState(false);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [bulkPeriodId, setBulkPeriodId] = React.useState("");
  const [bulkTeacherIds, setBulkTeacherIds] = React.useState<Set<string>>(new Set());
  const [bulkSubjectIds, setBulkSubjectIds] = React.useState<Record<string, string>>({});
  const [completionCounts, setCompletionCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!firebaseReady) return;
    const unsubs: Array<() => void> = [];
    unsubs.push(onSnapshot(query(collection(db, "teacherAssignments"), orderBy("createdAt", "desc")), (snap) => {
      setAssigns(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeacherAssignment, "id">) })));
    }));
    unsubs.push(onSnapshot(query(collection(db, "teachers"), orderBy("displayName")), (snap) => {
      setTeachers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Teacher, "id">) })));
    }));
    unsubs.push(onSnapshot(query(collection(db, "users"), where("role", "==", "student")), (snap) => {
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, "uid">) })));
    }));
    unsubs.push(onSnapshot(collection(db, "subjects"), (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) })));
    }));
    unsubs.push(onSnapshot(collection(db, "departments"), (snap) => {
      setDepts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Department, "id">) })));
    }));
    unsubs.push(onSnapshot(collection(db, "evaluationPeriods"), (snap) => {
      setPeriods(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationPeriod, "id">) })));
    }));
    unsubs.push(onSnapshot(collection(db, "evaluationCompletions"), (snap) => {
      const rows = snap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EvaluationCompletion, "id">),
      }));
      const completedByAssignment: Record<string, Set<string>> = {};
      const counts: Record<string, number> = {};
      rows.forEach((completion) => {
        if (!completion.assignmentId || !completion.studentId) return;
        completedByAssignment[completion.assignmentId] ??= new Set<string>();
        completedByAssignment[completion.assignmentId].add(completion.studentId);
      });
      Object.entries(completedByAssignment).forEach(([assignmentId, studentIds]) => {
        counts[assignmentId] = studentIds.size;
      });
      setCompletions(rows);
      setCompletionCounts(counts);
    }));
    return () => unsubs.forEach((u) => u());
  }, []);

  const activeStudents = students.filter(
    (student) => (student.status ?? "active") === "active"
  );
  const assignablePeriods = periods.filter((period) => period.status !== "closed");
  const setupReady =
    depts.length > 0
    && programs.length > 0
    && teachers.length > 0
    && subjects.length > 0
    && assignablePeriods.length > 0
    && activeStudents.length > 0;

  const eligibleStudents = (teacherId: string, subjectId: string) => {
    const teacher = teachers.find((item) => item.id === teacherId);
    const subject = subjects.find((item) => item.id === subjectId);
    if (
      !teacher
      || !subject
      || teacher.status === "inactive"
      || teacher.departmentId !== subject.departmentId
      || !teacher.subjectIds?.includes(subject.id)
    ) {
      return [];
    }
    return activeStudents
      .filter((student) => {
        const program = programs.find((item) => item.id === student.programId);
        if (!program || program.departmentId !== subject.departmentId) return false;
        if (teacher.programIds?.length && !teacher.programIds.includes(program.id)) return false;
        if (teacher.yearLevels?.length && !teacher.yearLevels.includes(student.yearLevel ?? "")) return false;
        if (
          teacher.sections?.length
          && !teacher.sections.some((section) =>
            section.toLowerCase() === student.section?.toLowerCase()
          )
        ) return false;
        return true;
      });
  };

  const suggestedStudentIds = (teacherId: string, subjectId: string) => {
    return eligibleStudents(teacherId, subjectId).map((student) => student.uid);
  };

  const eligibleSubjectsForTeacher = (teacher: Teacher) => subjects.filter((subject) =>
    subject.departmentId === teacher.departmentId
    && teacher.subjectIds?.includes(subject.id)
  );

  const defaultSubjectId = (teacher?: Teacher) => {
    if (!teacher) return "";
    const teacherSubjects = eligibleSubjectsForTeacher(teacher);
    return teacherSubjects.length === 1 ? teacherSubjects[0].id : "";
  };

  const bulkRows = teachers
    .filter((teacher) => teacher.status !== "inactive")
    .map((teacher) => {
      const teacherSubjects = eligibleSubjectsForTeacher(teacher);
      const subjectId = bulkSubjectIds[teacher.id] ?? defaultSubjectId(teacher);
      const studentIds = subjectId ? suggestedStudentIds(teacher.id, subjectId) : [];
      const duplicate = assigns.some((assignment) =>
        assignment.teacherId === teacher.id
        && assignment.subjectId === subjectId
        && assignment.periodId === bulkPeriodId
      );
      const available = Boolean(bulkPeriodId && subjectId && studentIds.length > 0 && !duplicate);
      const unavailableReason = duplicate
        ? "Already assigned"
        : teacherSubjects.length === 0
          ? "No assigned subject"
          : !subjectId
            ? "Select subject"
          : studentIds.length === 0
            ? "No eligible students"
            : "";
      return {
        teacher,
        subjects: teacherSubjects,
        subjectId,
        studentIds,
        duplicate,
        available,
        unavailableReason,
      };
    });

  const selectedBulkRows = bulkRows.filter((row) =>
    row.available && bulkTeacherIds.has(row.teacher.id)
  );
  const bulkStudentLinks = selectedBulkRows.reduce(
    (total, row) => total + row.studentIds.length,
    0
  );

  const openNew = () => {
    const teacherId = teachers.find((teacher) => teacher.status !== "inactive")?.id ?? "";
    const teacher = teachers.find((item) => item.id === teacherId);
    const subjectId = defaultSubjectId(teacher);
    setEditingAssignment(null);
    setCompletedStudentIds(new Set());
    setForm({
      teacherId,
      subjectId,
      periodId: assignablePeriods[0]?.id ?? "",
      studentIds: suggestedStudentIds(teacherId, subjectId),
    });
    setOpen(true);
  };

  const openEdit = async (assignment: TeacherAssignment) => {
    try {
      const completions = await getDocs(query(
        collection(db, "evaluationCompletions"),
        where("assignmentId", "==", assignment.id)
      ));
      setEditingAssignment(assignment);
      setForm({
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        periodId: assignment.periodId,
        studentIds: assignment.studentIds,
      });
      setCompletedStudentIds(new Set(
        completions.docs
          .map((item) => String(item.data().studentId ?? ""))
          .filter(Boolean)
      ));
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assignment could not be opened.");
    }
  };

  const openBulk = () => {
    const subjectIds = Object.fromEntries(
      teachers
        .filter((teacher) => teacher.status !== "inactive")
        .map((teacher) => [teacher.id, defaultSubjectId(teacher)])
    );
    setBulkPeriodId(assignablePeriods[0]?.id ?? "");
    setBulkSubjectIds(subjectIds);
    setBulkTeacherIds(new Set());
    setBulkOpen(true);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const subj = subjects.find((subject) => subject.id === form.subjectId);
      const teacher = teachers.find((item) => item.id === form.teacherId);
      if (!subj) throw new Error("Select a subject");
      if (!teacher || teacher.status === "inactive") throw new Error("Select an active teacher");
      if (
        teacher.departmentId !== subj.departmentId
        || !teacher.subjectIds?.includes(subj.id)
      ) {
        throw new Error("The selected subject is not assigned to this teacher");
      }
      const eligibleIds = new Set(
        eligibleStudents(teacher.id, subj.id).map((student) => student.uid)
      );
      if (form.studentIds.some((studentId) =>
        !eligibleIds.has(studentId) && !completedStudentIds.has(studentId)
      )) {
        throw new Error("One or more selected students are outside the teacher's Program, year, or section scope");
      }
      const studentIds = [...new Set([
        ...form.studentIds.filter((studentId) => eligibleIds.has(studentId)),
        ...completedStudentIds,
      ])];
      if (studentIds.length === 0) {
        throw new Error("Select at least one student");
      }
      const duplicate = assigns.some((assignment) =>
        assignment.id !== editingAssignment?.id
        &&
        assignment.teacherId === form.teacherId
        && assignment.subjectId === form.subjectId
        && assignment.periodId === form.periodId
      );
      if (duplicate) {
        throw new Error("This teacher and subject already have an assignment in this evaluation period");
      }
      const payload = {
        teacherId: form.teacherId,
        subjectId: form.subjectId,
        departmentId: subj.departmentId,
        studentIds,
        programIds: teacher.programIds ?? [],
        yearLevels: teacher.yearLevels ?? [],
        sections: teacher.sections ?? [],
        periodId: form.periodId,
        updatedAt: Date.now(),
      };
      if (editingAssignment) {
        await updateDoc(doc(db, "teacherAssignments", editingAssignment.id), payload);
        void recordActivity("teacher_assignment_updated", {
          assignmentId: editingAssignment.id,
          teacherId: form.teacherId,
          periodId: form.periodId,
          students: studentIds.length,
        });
        toast.success(`Assignment updated for ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`);
      } else {
        const created = await addDoc(collection(db, "teacherAssignments"), {
          ...payload,
          createdAt: Date.now(),
        });
        void recordActivity("teacher_assignment_created", {
          assignmentId: created.id,
          teacherId: form.teacherId,
          periodId: form.periodId,
          students: studentIds.length,
        });
        toast.success(`Assignment created for ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`);
      }
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const onBulkSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bulkPeriodId) {
      toast.error("Select an evaluation period");
      return;
    }
    if (selectedBulkRows.length === 0) {
      toast.error("Select at least one available teacher");
      return;
    }
    if (selectedBulkRows.length > 450) {
      toast.error("Create at most 450 assignments in one batch");
      return;
    }

    setBulkLoading(true);
    try {
      const batch = writeBatch(db);
      selectedBulkRows.forEach((row) => {
        const teacher = row.teacher;
        const assignmentRef = doc(collection(db, "teacherAssignments"));
        batch.set(assignmentRef, {
          teacherId: teacher.id,
          subjectId: row.subjectId,
          departmentId: teacher.departmentId,
          studentIds: row.studentIds,
          programIds: teacher.programIds ?? [],
          yearLevels: teacher.yearLevels ?? [],
          sections: teacher.sections ?? [],
          periodId: bulkPeriodId,
          createdAt: Date.now(),
        });
      });
      await batch.commit();
      void recordActivity("teacher_assignments_bulk_created", {
        periodId: bulkPeriodId,
        assignments: selectedBulkRows.length,
        studentLinks: bulkStudentLinks,
      });
      toast.success(
        `${selectedBulkRows.length} teacher assignment${selectedBulkRows.length === 1 ? "" : "s"} created`
      );
      setBulkOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk assignment failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const onDelete = async (a: TeacherAssignment) => {
    try {
      const [responses, completions] = await Promise.all([
        getDocs(query(collection(db, "evaluations"), where("assignmentId", "==", a.id))),
        getDocs(query(collection(db, "evaluationCompletions"), where("assignmentId", "==", a.id))),
      ]);
      if (!responses.empty || !completions.empty) {
        throw new Error("This assignment has submissions and cannot be deleted.");
      }
      if (!confirm("Delete this assignment?")) return;
      await deleteDoc(doc(db, "teacherAssignments", a.id));
      void recordActivity("teacher_assignment_deleted", { assignmentId: a.id });
      toast.success("Assignment deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assignment deletion failed.");
    }
  };

  const setupItems = [
    { label: "Departments", count: depts.length, href: "/admin/departments" },
    { label: "Programs", count: programs.length, href: "/admin/programs" },
    { label: "Teachers", count: teachers.length, href: "/admin/teachers" },
    { label: "Subjects", count: subjects.length, href: "/admin/subjects" },
    { label: "Available periods", count: assignablePeriods.length, href: "/admin/periods" },
    { label: "Active students", count: activeStudents.length, href: "/admin/users" },
  ];
  const selectedTeacher = teachers.find((teacher) => teacher.id === form.teacherId);
  const eligibleSubjects = subjects.filter((subject) =>
    subject.departmentId === selectedTeacher?.departmentId
    && selectedTeacher?.subjectIds?.includes(subject.id)
  );
  const scopedStudents = eligibleStudents(form.teacherId, form.subjectId);
  const progressCompletions = progressAssignment
    ? completions.filter((completion) => completion.assignmentId === progressAssignment.id)
    : [];
  const progressCompletionByStudent = new Map(
    progressCompletions.map((completion) => [completion.studentId, completion])
  );
  const progressStudents = progressAssignment
    ? progressAssignment.studentIds.map((studentId) => ({
        studentId,
        student: students.find((item) => item.uid === studentId),
        completion: progressCompletionByStudent.get(studentId),
      })).sort((left, right) => {
        if (Boolean(left.completion) !== Boolean(right.completion)) return left.completion ? -1 : 1;
        return (left.student?.displayName ?? left.student?.email ?? left.studentId)
          .localeCompare(right.student?.displayName ?? right.student?.email ?? right.studentId);
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Teacher Assignments"
        description="Assign teachers to subjects and periods. Students in that scope can evaluate."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={openBulk}
              disabled={!setupReady}
              title={setupReady ? "Assign multiple teachers" : "Complete the required setup first"}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UsersRound className="h-4 w-4" /> Bulk assign
            </button>
            <button
              onClick={openNew}
              disabled={!setupReady}
              title={setupReady ? "Create a teacher assignment" : "Complete the required setup first"}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> New assignment
            </button>
          </div>
        }
      />

      <section className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {setupReady
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {setupReady ? "Ready for assignments" : "Assignment setup is incomplete"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Each evaluation needs a department, teacher, subject, period, and at least one student.
            </p>
          </div>
        </div>
        <div className="grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-6 dark:divide-slate-800">
          {setupItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className={`font-semibold ${item.count > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {item.count}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Teacher</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Period</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Student progress</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {assigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No assignments yet
                  </td>
                </tr>
              ) : (
                assigns.map((a) => {
                  const teacher = teachers.find((item) => item.id === a.teacherId);
                  const subject = subjects.find((item) => item.id === a.subjectId);
                  const subjectMatchesTeacher = Boolean(
                    teacher && subject
                    && teacher.departmentId === subject.departmentId
                    && teacher.subjectIds?.includes(subject.id)
                  );
                  return (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium">{teacher?.displayName ?? a.teacherId}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{subject ? formatSubjectLabel(subject) : a.subjectId}</span>
                      {!subjectMatchesTeacher && (
                        <span className="ml-2 inline-flex rounded bg-rose-500/10 px-1.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-300">
                          Not assigned to teacher
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{periods.find((p) => p.id === a.periodId)?.name ?? a.periodId}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-900 dark:text-white">{a.studentIds.length} assigned</span>
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">{completionCounts[a.id] ?? 0} completed</span>
                      <span className="ml-2 text-amber-600 dark:text-amber-400">{Math.max(a.studentIds.length - (completionCounts[a.id] ?? 0), 0)} pending</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setProgressAssignment(a)}
                        className="mr-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        title="View student progress"
                        aria-label="View student progress"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void openEdit(a)}
                        className="mr-1 rounded-lg p-1.5 text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                        title="Edit assignment"
                        aria-label="Edit assignment"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => onDelete(a)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                        Delete
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(progressAssignment)}
        onClose={() => setProgressAssignment(null)}
        title="Student evaluation progress"
        size="lg"
      >
        {progressAssignment && (
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-slate-950 dark:text-white">
                {teachers.find((teacher) => teacher.id === progressAssignment.teacherId)?.displayName ?? "Teacher"}
              </p>
              <p className="text-sm text-slate-500">
                {subjects.find((subject) => subject.id === progressAssignment.subjectId)?.code ?? "Subject"}
                {" / "}
                {periods.find((period) => period.id === progressAssignment.periodId)?.name ?? "Evaluation period"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ProgressSummary label="Assigned" value={progressStudents.length} tone="neutral" />
              <ProgressSummary label="Completed" value={progressStudents.filter((item) => item.completion).length} tone="complete" />
              <ProgressSummary label="Pending" value={progressStudents.filter((item) => !item.completion).length} tone="pending" />
            </div>

            <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {progressStudents.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">No students are assigned.</p>
              ) : progressStudents.map(({ studentId, student, completion }) => {
                const program = programs.find((item) => item.id === student?.programId);
                const academicDetails = [
                  program?.code ?? student?.course,
                  student?.yearLevel ? `Year ${student.yearLevel}` : "",
                  student?.section ? `Section ${student.section}` : "",
                ].filter(Boolean).join(" / ");
                return (
                  <div key={studentId} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-950 dark:text-white">
                        {student?.displayName || student?.email || studentId}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {student?.email && student.displayName ? `${student.email} / ` : ""}
                        {academicDetails || "No academic details"}
                      </p>
                    </div>
                    {completion ? (
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                        </span>
                        <p className="mt-0.5 text-[11px] text-slate-500">{fmtDateTime(completion.submittedAt)}</p>
                      </div>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <Clock3 className="h-3.5 w-3.5" /> Pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setProgressAssignment(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => !bulkLoading && setBulkOpen(false)}
        title="Bulk assign teachers"
        size="lg"
      >
        <form onSubmit={onBulkSave} className="space-y-4">
          <FormField
            label="Evaluation period"
            hint="Existing assignments in this period are skipped automatically."
          >
            <select
              required
              value={bulkPeriodId}
              onChange={(event) => {
                setBulkPeriodId(event.target.value);
                setBulkTeacherIds(new Set());
              }}
              className={inputCls}
            >
              <option value="">Select period</option>
              {assignablePeriods.map((period) => (
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
          </FormField>

          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Teachers</p>
                <p className="text-xs text-slate-500">
                  {selectedBulkRows.length} of {bulkRows.filter((row) => row.available).length} available selected
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBulkTeacherIds(new Set(
                    bulkRows.filter((row) => row.available).map((row) => row.teacher.id)
                  ))}
                  disabled={!bulkPeriodId || !bulkRows.some((row) => row.available)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setBulkTeacherIds(new Set())}
                  disabled={bulkTeacherIds.size === 0}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="max-h-[48dvh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {bulkRows.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No active teachers are available.
                </p>
              )}
              {bulkRows.map((row) => {
                const checked = row.available && bulkTeacherIds.has(row.teacher.id);
                return (
                  <div
                    key={row.teacher.id}
                    className={`grid gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(12rem,1fr)_7rem] sm:items-center ${
                      checked ? "bg-brand-50/70 dark:bg-brand-500/5" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!row.available}
                      onChange={(event) => {
                        setBulkTeacherIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.teacher.id);
                          else next.delete(row.teacher.id);
                          return next;
                        });
                      }}
                      aria-label={`Select ${row.teacher.displayName}`}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                    />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {row.teacher.displayName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {depts.find((department) => department.id === row.teacher.departmentId)?.name ?? "Department unavailable"}
                      </p>
                    </div>

                    <select
                      value={row.subjectId}
                      disabled={row.subjects.length === 0 || row.duplicate}
                      onChange={(event) => {
                        const subjectId = event.target.value;
                        setBulkSubjectIds((current) => ({
                          ...current,
                          [row.teacher.id]: subjectId,
                        }));
                        if (suggestedStudentIds(row.teacher.id, subjectId).length === 0) {
                          setBulkTeacherIds((current) => {
                            const next = new Set(current);
                            next.delete(row.teacher.id);
                            return next;
                          });
                        }
                      }}
                      aria-label={`Subject for ${row.teacher.displayName}`}
                      className={`${inputCls} min-w-0 py-2 text-xs`}
                    >
                      {row.subjects.length === 0 ? (
                        <option value="">No subject</option>
                      ) : (
                        <>
                          {row.subjects.length > 1 && <option value="">Select subject</option>}
                          {row.subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {formatSubjectLabel(subject)}
                            </option>
                          ))}
                        </>
                      )}
                    </select>

                    <div className="sm:text-right">
                      {row.available ? (
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {row.studentIds.length} student{row.studentIds.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className={`text-xs font-semibold ${
                          row.duplicate
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-slate-500"
                        }`}>
                          {row.unavailableReason}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-900 dark:text-white">{selectedBulkRows.length}</span> assignments
              <span className="mx-2">|</span>
              <span className="font-semibold text-slate-900 dark:text-white">{bulkStudentLinks}</span> student evaluation tasks
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                disabled={bulkLoading}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bulkLoading || selectedBulkRows.length === 0}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkLoading ? "Creating..." : `Create ${selectedBulkRows.length} assignments`}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={editingAssignment ? "Edit teacher assignment" : "New teacher assignment"} size="lg">
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Teacher">
            <select
              required
              disabled={Boolean(editingAssignment)}
              value={form.teacherId}
              onChange={(event) => {
                const teacherId = event.target.value;
                const teacher = teachers.find((item) => item.id === teacherId);
                const subjectId = defaultSubjectId(teacher);
                setForm({
                  ...form,
                  teacherId,
                  subjectId,
                  studentIds: suggestedStudentIds(teacherId, subjectId),
                });
              }}
              className={inputCls}
            >
              <option value="">Select teacher</option>
              {teachers.filter((teacher) => teacher.status !== "inactive").map((t) => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Subject">
            <select
              required
              disabled={Boolean(editingAssignment && completedStudentIds.size > 0)}
              value={form.subjectId}
              onChange={(event) => {
                const subjectId = event.target.value;
                setForm({
                  ...form,
                  subjectId,
                  studentIds: suggestedStudentIds(form.teacherId, subjectId),
                });
              }}
              className={inputCls}
            >
              <option value="">Select subject</option>
              {eligibleSubjects.map((s) => (
                <option key={s.id} value={s.id}>{formatSubjectLabel(s)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Period">
            <select required disabled={Boolean(editingAssignment)} value={form.periodId} onChange={(e) => setForm({ ...form, periodId: e.target.value })} className={inputCls}>
              <option value="">Select period</option>
              {assignablePeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Students"
            hint={`${form.studentIds.length} of ${scopedStudents.length} eligible students selected`}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
                <p className="text-xs text-slate-500">
                  Only students matching the teacher&apos;s Program, year, section, and department scope are available.
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      studentIds: scopedStudents.map((student) => student.uid),
                    })}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, studentIds: [] })}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {scopedStudents.length === 0 && (
                  <p className="px-3 py-5 text-center text-sm text-slate-500">
                    No active students match this teacher and subject scope.
                  </p>
                )}
                {scopedStudents.map((student) => {
                  const details = [
                    programs.find((program) => program.id === student.programId)?.code
                      ?? student.course,
                    student.yearLevel ? `Year ${student.yearLevel}` : "",
                    student.section ? `Section ${student.section}` : "",
                  ].filter(Boolean).join(" / ");
                  return (
                    <label
                      key={student.uid}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={form.studentIds.includes(student.uid)}
                        onChange={(event) => {
                          const studentIds = event.target.checked
                            ? [...form.studentIds, student.uid]
                            : form.studentIds.filter((studentId) => studentId !== student.uid);
                          setForm({ ...form, studentIds });
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 dark:text-white">
                          {student.displayName || student.email}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {details || "No academic details"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">{loading ? "Saving..." : editingAssignment ? "Save changes" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ProgressSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "complete" | "pending";
}) {
  const colors = {
    neutral: "text-slate-950 dark:text-white",
    complete: "text-emerald-600 dark:text-emerald-400",
    pending: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}
