"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  BarChart3,
  Pencil,
  Plus,
  UsersRound,
} from "lucide-react";

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
  writeBatch,
} from "firebase/firestore";

import { db, firebaseReady } from "@/lib/firebase/client";
import { usePrograms } from "@/lib/use-programs";
import {
  authenticatedFetch,
  readApiResponse,
  recordActivity,
} from "@/lib/authenticated-fetch";
import {
  PageHeader,
  Modal,
  FormField,
  inputCls,
} from "@/components/data-table";

import type {
  AppUser,
  Subject,
  Department,
  EvaluationCompletion,
  EvaluationPeriod,
  TeacherAssignment,
  Teacher,
} from "@/lib/types";

import toast from "react-hot-toast";
import { fmtDateTime } from "@/lib/utils-extras";
import { formatSubjectLabel } from "@/lib/utils";

const panelStyle: React.CSSProperties = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "10px 12px",
};

const darkInputStyle: React.CSSProperties = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  color: "#F9FAFB",
};

type Assignment = TeacherAssignment & {
  targetStudentCount?: number;
  studentIds: string[];
};

type AssignmentForm = {
  teacherId: string;
  subjectId: string;
  periodId: string;
  studentIds: string[];
  expectedStudentCount: number;
};

export default function AdminAssignmentsPage() {
  const router = useRouter();
  const { programs } = usePrograms();

  const [assigns, setAssigns] = React.useState<Assignment[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [students, setStudents] = React.useState<AppUser[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [depts, setDepts] = React.useState<Department[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [completions, setCompletions] =
    React.useState<EvaluationCompletion[]>([]);

  const [open, setOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [progressAssignment, setProgressAssignment] =
    React.useState<Assignment | null>(null);
  const [editingAssignment, setEditingAssignment] =
    React.useState<Assignment | null>(null);

  const [completedStudentIds, setCompletedStudentIds] =
    React.useState<Set<string>>(new Set());

  const [loading, setLoading] = React.useState(false);
  const [bulkLoading, setBulkLoading] = React.useState(false);

  const [form, setForm] = React.useState<AssignmentForm>({
    teacherId: "",
    subjectId: "",
    periodId: "",
    studentIds: [],
    expectedStudentCount: 1,
  });

  const [bulkPeriodId, setBulkPeriodId] = React.useState("");
  const [bulkTeacherIds, setBulkTeacherIds] =
    React.useState<Set<string>>(new Set());
  const [bulkSubjectIds, setBulkSubjectIds] =
    React.useState<Record<string, string>>({});
  const [bulkExpectedCounts, setBulkExpectedCounts] =
    React.useState<Record<string, number>>({});

  /* ============================================================
     REAL-TIME FIRESTORE LISTENERS
  ============================================================ */

  React.useEffect(() => {
    if (!firebaseReady) return;

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      onSnapshot(
        query(
          collection(db, "teacherAssignments"),
          orderBy("createdAt", "desc")
        ),
        (snapshot) => {
          setAssigns(
            snapshot.docs.map((item) => {
              const data = item.data();

              return {
                ...data,
                id: item.id,
                studentIds: Array.isArray(data.studentIds)
                  ? data.studentIds.map(String)
                  : [],
              } as Assignment;
            })
          );
        },
        (error) => {
          console.error("Assignments listener failed:", error);
          toast.error("Failed to load assignments.");
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, "teachers"), orderBy("displayName")),
        (snapshot) => {
          setTeachers(
            snapshot.docs.map((item) => ({
              ...item.data(),
              id: item.id,
            })) as Teacher[]
          );
        },
        (error) => {
          console.error("Teachers listener failed:", error);
          toast.error("Failed to load teachers.");
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, "users"), where("role", "==", "student")),
        (snapshot) => {
          setStudents(
            snapshot.docs.map((item) => ({
              ...item.data(),
              uid: item.id,
            })) as AppUser[]
          );
        },
        (error) => {
          console.error("Students listener failed:", error);
          toast.error("Failed to load students.");
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, "subjects"),
        (snapshot) => {
          setSubjects(
            snapshot.docs.map((item) => ({
              ...item.data(),
              id: item.id,
            })) as Subject[]
          );
        },
        (error) => {
          console.error("Subjects listener failed:", error);
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, "departments"),
        (snapshot) => {
          setDepts(
            snapshot.docs.map((item) => ({
              ...item.data(),
              id: item.id,
            })) as Department[]
          );
        },
        (error) => {
          console.error("Departments listener failed:", error);
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, "evaluationPeriods"),
        (snapshot) => {
          setPeriods(
            snapshot.docs.map((item) => ({
              ...item.data(),
              id: item.id,
            })) as EvaluationPeriod[]
          );
        },
        (error) => {
          console.error("Periods listener failed:", error);
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        collection(db, "evaluationCompletions"),
        (snapshot) => {
          setCompletions(
            snapshot.docs.map((item) => ({
              ...item.data(),
              id: item.id,
            })) as EvaluationCompletion[]
          );
        },
        (error) => {
          console.error("Completion listener failed:", error);
          toast.error("Failed to load evaluation completion records.");
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  /* ============================================================
     ACTIVE STUDENTS AND SETUP
  ============================================================ */

  const activeStudents = React.useMemo(
    () =>
      students.filter(
        (student) => (student.status ?? "active") === "active"
      ),
    [students]
  );

  const setupReady =
    depts.length > 0 &&
    programs.length > 0 &&
    teachers.length > 0 &&
    subjects.length > 0 &&
    periods.length > 0;

  /* ============================================================
     TEACHER SUBJECT AND STUDENT ELIGIBILITY
  ============================================================ */

  const eligibleSubjectsForTeacher = React.useCallback(
    (teacher: Teacher) =>
      subjects.filter(
        (subject) =>
          subject.departmentId === teacher.departmentId &&
          teacher.subjectIds?.includes(subject.id)
      ),
    [subjects]
  );

  const eligibleStudents = React.useCallback(
    (teacherId: string, subjectId: string) => {
      const teacher = teachers.find((item) => item.id === teacherId);
      const subject = subjects.find((item) => item.id === subjectId);

      if (
        !teacher ||
        !subject ||
        teacher.status === "inactive" ||
        teacher.departmentId !== subject.departmentId ||
        !teacher.subjectIds?.includes(subject.id)
      ) {
        return [];
      }

      return activeStudents.filter((student) => {
        const program = programs.find(
          (item) => item.id === student.programId
        );

        if (!program || program.departmentId !== subject.departmentId) {
          return false;
        }

        if (
          teacher.programIds?.length &&
          !teacher.programIds.includes(program.id)
        ) {
          return false;
        }

        if (
          teacher.yearLevels?.length &&
          !teacher.yearLevels.includes(student.yearLevel ?? "")
        ) {
          return false;
        }

        if (
          teacher.sections?.length &&
          !teacher.sections.some(
            (section) =>
              section.toLowerCase() ===
              (student.section ?? "").toLowerCase()
          )
        ) {
          return false;
        }

        return true;
      });
    },
    [teachers, subjects, activeStudents, programs]
  );

  const defaultSubjectId = (teacher?: Teacher) => {
    if (!teacher) return "";

    const list = eligibleSubjectsForTeacher(teacher);
    return list.length === 1 ? list[0].id : "";
  };

  const selectedTeacher = teachers.find(
    (teacher) => teacher.id === form.teacherId
  );

  const eligibleSubjects = selectedTeacher
    ? eligibleSubjectsForTeacher(selectedTeacher)
    : [];

  const scopedStudents = eligibleStudents(
    form.teacherId,
    form.subjectId
  );

  /* ============================================================
     COMPLETION COUNTS
  ============================================================ */

  const completedIdsForAssignment = React.useCallback(
    (assignmentId: string): Set<string> =>
      new Set(
        completions
          .filter(
            (completion) =>
              completion.assignmentId === assignmentId &&
              typeof completion.studentId === "string" &&
              completion.studentId.trim().length > 0
          )
          .map((completion) => String(completion.studentId))
      ),
    [completions]
  );

  const completionCount = React.useCallback(
    (assignmentId: string) =>
      completedIdsForAssignment(assignmentId).size,
    [completedIdsForAssignment]
  );

  const expectedCount = React.useCallback(
    (assignment: Assignment) => {
      const teacher = teachers.find((t) => t.id === assignment.teacherId);
      const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);
      const fallbackTarget = Number(assignment.targetStudentCount) || 0;
      
      return Math.max(
        0,
        teacherExpected > 0 ? teacherExpected : fallbackTarget,
        assignment.studentIds.length,
        completedIdsForAssignment(assignment.id).size
      );
    },
    [teachers, completedIdsForAssignment]
  );

  const pendingCount = React.useCallback(
    (assignment: Assignment) =>
      Math.max(
        expectedCount(assignment) - completionCount(assignment.id),
        0
      ),
    [expectedCount, completionCount]
  );

  /* ============================================================
     CREATE ASSIGNMENT
  ============================================================ */

  const openNew = () => {
    const teacher = teachers.find(
      (item) => item.status !== "inactive"
    );

    const subjectId = defaultSubjectId(teacher);

    const suggested = teacher
      ? eligibleStudents(teacher.id, subjectId).map(
          (student) => student.uid
        )
      : [];

    const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);
    const teacherExpectedCount = teacherExpected > 0 ? teacherExpected : Math.max(suggested.length, 1);

    setEditingAssignment(null);
    setCompletedStudentIds(new Set());

    setForm({
      teacherId: teacher?.id ?? "",
      subjectId,
      periodId: periods[0]?.id ?? "",
      studentIds: suggested,
      expectedStudentCount: teacherExpectedCount,
    });

    setOpen(true);
  };

  /* ============================================================
     EDIT ASSIGNMENT
  ============================================================ */

  const openEdit = async (assignment: Assignment) => {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "evaluationCompletions"),
          where("assignmentId", "==", assignment.id)
        )
      );

      const completed = new Set(
        snapshot.docs
          .map((item) => String(item.data().studentId ?? ""))
          .filter(Boolean)
      );

      const teacher = teachers.find((t) => t.id === assignment.teacherId);
      const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);

      const savedExpected = Math.max(
        1,
        teacherExpected > 0 ? teacherExpected : Number(assignment.targetStudentCount) || 0,
        assignment.studentIds.length,
        completed.size
      );

      setEditingAssignment(assignment);
      setCompletedStudentIds(completed);

      setForm({
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        periodId: assignment.periodId,
        studentIds: [
          ...new Set([...assignment.studentIds, ...completed]),
        ],
        expectedStudentCount: savedExpected,
      });

      setOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Unable to open this assignment.");
    }
  };

  /* ============================================================
     SAVE ASSIGNMENT
  ============================================================ */

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const teacher = teachers.find(
        (item) => item.id === form.teacherId
      );
      const subject = subjects.find(
        (item) => item.id === form.subjectId
      );
      const period = periods.find(
        (item) => item.id === form.periodId
      );

      if (!teacher || teacher.status === "inactive") {
        throw new Error("Please select an active teacher.");
      }

      if (!subject) {
        throw new Error("Please select a subject.");
      }

      if (!period) {
        throw new Error("Please select an evaluation period.");
      }

      if (
        teacher.departmentId !== subject.departmentId ||
        !teacher.subjectIds?.includes(subject.id)
      ) {
        throw new Error(
          "The selected subject is not assigned to this teacher."
        );
      }

      const completed = editingAssignment
        ? completedStudentIds
        : new Set<string>();

      const allowedIds = new Set(
        eligibleStudents(teacher.id, subject.id).map(
          (student) => student.uid
        )
      );

      const invalidIds = form.studentIds.filter(
        (id) => !allowedIds.has(id) && !completed.has(id)
      );

      if (invalidIds.length > 0) {
        throw new Error(
          "Some selected students do not match the teacher's department, program, year, or section."
        );
      }

      const studentIds = [
        ...new Set([
          ...form.studentIds.filter((id) => allowedIds.has(id)),
          ...completed,
        ]),
      ];

      const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);

      const expectedStudentCount = editingAssignment
        ? Math.max(
            teacherExpected > 0 ? teacherExpected : Number(editingAssignment.targetStudentCount) || 0,
            studentIds.length,
            completed.size,
            1
          )
        : Math.max(
            1,
            teacherExpected > 0 ? teacherExpected : Number(form.expectedStudentCount) || 0,
            studentIds.length,
            completed.size
          );

      const duplicate = assigns.some(
        (assignment) =>
          assignment.id !== editingAssignment?.id &&
          assignment.teacherId === teacher.id &&
          assignment.subjectId === subject.id &&
          assignment.periodId === period.id
      );

      if (duplicate) {
        throw new Error(
          "This teacher and subject already have an assignment for this evaluation period."
        );
      }

      const payload = {
        teacherId: teacher.id,
        subjectId: subject.id,
        departmentId: subject.departmentId,
        studentIds,
        targetStudentCount: expectedStudentCount,
        programIds: teacher.programIds ?? [],
        yearLevels: teacher.yearLevels ?? [],
        sections: teacher.sections ?? [],
        periodId: period.id,
        updatedAt: Date.now(),
      };

      if (editingAssignment) {
        if (
          editingAssignment.subjectId !== subject.id &&
          completed.size > 0
        ) {
          const response = await authenticatedFetch(
            "/api/admin/assignments",
            {
              method: "PATCH",
              body: JSON.stringify({
                assignmentId: editingAssignment.id,
                subjectId: subject.id,
              }),
            }
          );

          await readApiResponse<{
            ok: true;
            recordsUpdated: number;
          }>(response);
        }

        await updateDoc(
          doc(db, "teacherAssignments", editingAssignment.id),
          payload
        );

        void recordActivity("teacher_assignment_updated", {
          assignmentId: editingAssignment.id,
          teacherId: teacher.id,
          periodId: period.id,
          expectedStudentCount,
          assignedStudents: studentIds.length,
        });

        toast.success("Assignment updated successfully.");
      } else {
        const created = await addDoc(
          collection(db, "teacherAssignments"),
          {
            ...payload,
            createdAt: Date.now(),
          }
        );

        void recordActivity("teacher_assignment_created", {
          assignmentId: created.id,
          teacherId: teacher.id,
          periodId: period.id,
          expectedStudentCount,
          assignedStudents: studentIds.length,
        });

        toast.success("Assignment created successfully.");
      }

      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Save failed."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
     BULK ASSIGNMENTS
  ============================================================ */

  const bulkRows = teachers
    .filter((teacher) => teacher.status !== "inactive")
    .map((teacher) => {
      const teacherSubjects = eligibleSubjectsForTeacher(teacher);

      const subjectId =
        bulkSubjectIds[teacher.id] ?? defaultSubjectId(teacher);

      const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);
      const defaultCount = teacherExpected > 0 ? teacherExpected : 1;

      const count = Math.max(
        1,
        Math.floor(Number(bulkExpectedCounts[teacher.id] ?? defaultCount))
      );

      const studentIds = subjectId
        ? eligibleStudents(teacher.id, subjectId)
            .map((student) => student.uid)
            .slice(0, count)
        : [];

      const duplicate = assigns.some(
        (assignment) =>
          assignment.teacherId === teacher.id &&
          assignment.subjectId === subjectId &&
          assignment.periodId === bulkPeriodId
      );

      const available = Boolean(
        bulkPeriodId &&
          subjectId &&
          !duplicate &&
          teacherSubjects.some((subject) => subject.id === subjectId)
      );

      return {
        teacher,
        subjects: teacherSubjects,
        subjectId,
        count,
        studentIds,
        duplicate,
        available,
      };
    });

  const selectedBulkRows = bulkRows.filter(
    (row) => row.available && bulkTeacherIds.has(row.teacher.id)
  );

  const openBulk = () => {
    const subjectIds: Record<string, string> = {};
    const counts: Record<string, number> = {};

    teachers
      .filter((teacher) => teacher.status !== "inactive")
      .forEach((teacher) => {
        const subjectId = defaultSubjectId(teacher);
        subjectIds[teacher.id] = subjectId;

        const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);
        counts[teacher.id] = teacherExpected > 0 ? teacherExpected : 1;
      });

    setBulkPeriodId(periods[0]?.id ?? "");
    setBulkSubjectIds(subjectIds);
    setBulkExpectedCounts(counts);
    setBulkTeacherIds(new Set());
    setBulkOpen(true);
  };

  const onBulkSave = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!bulkPeriodId || selectedBulkRows.length === 0) {
      toast.error(
        "Select an evaluation period and at least one available teacher."
      );
      return;
    }

    setBulkLoading(true);

    try {
      for (
        let start = 0;
        start < selectedBulkRows.length;
        start += 400
      ) {
        const batch = writeBatch(db);

        selectedBulkRows
          .slice(start, start + 400)
          .forEach((row) => {
            const ref = doc(collection(db, "teacherAssignments"));

            const teacherExpected = Number((row.teacher as Teacher & { expectedStudents?: number })?.expectedStudents);

            batch.set(ref, {
              teacherId: row.teacher.id,
              subjectId: row.subjectId,
              departmentId: row.teacher.departmentId,
              studentIds: row.studentIds,
              targetStudentCount: Math.max(
                teacherExpected > 0 ? teacherExpected : row.count,
                row.studentIds.length
              ),
              programIds: row.teacher.programIds ?? [],
              yearLevels: row.teacher.yearLevels ?? [],
              sections: row.teacher.sections ?? [],
              periodId: bulkPeriodId,
              createdAt: Date.now(),
            });
          });

        await batch.commit();
      }

      void recordActivity("teacher_assignments_bulk_created", {
        periodId: bulkPeriodId,
        assignments: selectedBulkRows.length,
      });

      toast.success(
        `${selectedBulkRows.length} assignment(s) created successfully.`
      );

      setBulkOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Bulk assignment failed."
      );
    } finally {
      setBulkLoading(false);
    }
  };

  /* ============================================================
     DELETE ASSIGNMENT
  ============================================================ */

  const onDelete = async (assignment: Assignment) => {
    try {
      const pending = pendingCount(assignment);
      if (pending > 0) {
        toast.error(
          "Cannot delete assignment: Some students have not finished evaluating this teacher."
        );
        return;
      }

      const [evaluationDocs, completionDocs] = await Promise.all([
        getDocs(
          query(
            collection(db, "evaluations"),
            where("assignmentId", "==", assignment.id)
          )
        ),
        getDocs(
          query(
            collection(db, "evaluationCompletions"),
            where("assignmentId", "==", assignment.id)
          )
        ),
      ]);

      if (!evaluationDocs.empty || !completionDocs.empty) {
        toast.error(
          "This assignment has evaluation submissions and cannot be deleted."
        );
        return;
      }

      if (!window.confirm("Delete this assignment?")) return;

      await deleteDoc(
        doc(db, "teacherAssignments", assignment.id)
      );

      void recordActivity("teacher_assignment_deleted", {
        assignmentId: assignment.id,
      });

      toast.success("Assignment deleted.");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Assignment deletion failed."
      );
    }
  };

  /* ============================================================
     PROGRESS MODAL DATA
  ============================================================ */

  const progressCompletions = progressAssignment
    ? completions.filter(
        (completion) =>
          completion.assignmentId === progressAssignment.id
      )
    : [];

  const progressCompletionMap = new Map(
    progressCompletions
      .filter((completion) => Boolean(completion.studentId))
      .map((completion) => [
        String(completion.studentId),
        completion,
      ])
  );

  const progressStudents = progressAssignment
    ? [
        ...new Set([
          ...progressAssignment.studentIds,
          ...Array.from(progressCompletionMap.keys()),
        ]),
      ]
        .map((studentId) => ({
          studentId,
          student: students.find(
            (item) => item.uid === studentId
          ),
          completion: progressCompletionMap.get(studentId),
        }))
        .sort((a, b) => {
          if (Boolean(a.completion) !== Boolean(b.completion)) {
            return a.completion ? -1 : 1;
          }

          const nameA =
            a.student?.displayName ??
            a.student?.email ??
            a.studentId;

          const nameB =
            b.student?.displayName ??
            b.student?.email ??
            b.studentId;

          return nameA.localeCompare(nameB);
        })
    : [];

  const progressCompleted = progressAssignment
    ? completionCount(progressAssignment.id)
    : 0;

  const progressExpected = progressAssignment
    ? expectedCount(progressAssignment)
    : 0;

  const progressPending = progressAssignment
    ? pendingCount(progressAssignment)
    : 0;

  /* ============================================================
     SETUP LINKS
  ============================================================ */

  const setupItems = [
    {
      label: "Departments",
      count: depts.length,
      href: "/admin/departments",
    },
    {
      label: "Programs",
      count: programs.length,
      href: "/admin/programs",
    },
    {
      label: "Teachers",
      count: teachers.length,
      href: "/admin/teachers",
    },
    {
      label: "Subjects",
      count: subjects.length,
      href: "/admin/subjects",
    },
    {
      label: "Evaluation periods",
      count: periods.length,
      href: "/admin/periods",
    },
    {
      label: "Active students",
      count: activeStudents.length,
      href: "/admin/users",
    },
  ];

  /* ============================================================
     PAGE UI
  ============================================================ */

  return (
    <div className="min-h-screen bg-gray-900">
      <PageHeader
        title="Teacher Assignments"
        description="Manage teacher assignments and track student evaluation completion."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={openBulk}
              disabled={!setupReady}
              className="btn-secondary disabled:opacity-50"
            >
              <UsersRound className="h-4 w-4" />
              Bulk assign
            </button>

            <button
              type="button"
              onClick={openNew}
              disabled={!setupReady}
              className="btn-primary disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              New assignment
            </button>
          </div>
        }
      />

      <section className="mb-5 overflow-hidden" style={panelStyle}>
        {!setupReady && (
          <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-semibold text-slate-200">
              Assignment setup is incomplete. Check the setup items below.
            </p>
          </div>
        )}

        <div className="grid divide-y divide-slate-700 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-6">
          {setupItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-800"
            >
              <span className="text-slate-300">{item.label}</span>
              <span
                className={
                  item.count > 0
                    ? "font-semibold text-emerald-400"
                    : "font-semibold text-amber-400"
                }
              >
                {item.count}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ASSIGNMENTS TABLE */}

      <div className="overflow-hidden" style={panelStyle}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-gray-800">
              <tr>
                {[
                  "Teacher",
                  "Subject",
                  "Period",
                  "Student Progress",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300 ${
                      heading === "Actions" ? "text-right" : ""
                    }`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-700">
              {assigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No assignments yet.
                  </td>
                </tr>
              ) : (
                assigns.map((assignment) => {
                  const teacher = teachers.find(
                    (item) => item.id === assignment.teacherId
                  );

                  const subject = subjects.find(
                    (item) => item.id === assignment.subjectId
                  );

                  const period = periods.find(
                    (item) => item.id === assignment.periodId
                  );

                  const completed = completionCount(assignment.id);
                  const expected = expectedCount(assignment);
                  const pending = pendingCount(assignment);
                  const isFullyCompleted = expected > 0 && pending === 0;

                  const validSubject = Boolean(
                    teacher &&
                      subject &&
                      teacher.departmentId === subject.departmentId &&
                      teacher.subjectIds?.includes(subject.id)
                  );

                  return (
                    <tr
                      key={assignment.id}
                      className="hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {teacher?.displayName ?? assignment.teacherId}
                      </td>

                      <td className="px-4 py-3 text-slate-200">
                        {subject
                          ? formatSubjectLabel(subject)
                          : assignment.subjectId}

                        {!validSubject && (
                          <span className="ml-2 rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300">
                            Not assigned
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-200">
                          {period?.name ?? assignment.periodId}
                        </p>

                        {period?.status && (
                          <p className="text-xs text-slate-500">
                            {period.status}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-400">
                            Completed: {completed}/{expected}
                          </span>

                          <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-semibold text-amber-400">
                            Pending: {pending}
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{
                              width: `${
                                expected > 0
                                  ? Math.min(
                                      (completed / expected) * 100,
                                      100
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/admin/analytics?assignmentId=${assignment.id}`)
                          }
                          className="mr-1 rounded-lg p-1.5 text-slate-300 hover:bg-slate-700"
                          title="View analytics"
                          aria-label="View analytics"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void openEdit(assignment)}
                          className="mr-1 rounded-lg p-1.5 text-sky-300 hover:bg-sky-500/10"
                          title="Edit assignment"
                          aria-label="Edit assignment"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          disabled={!isFullyCompleted}
                          onClick={() => void onDelete(assignment)}
                          title={
                            isFullyCompleted
                              ? "Delete assignment"
                              : "Cannot delete: Some student evaluations are still pending"
                          }
                          className={`rounded-lg px-2 py-1.5 ${
                            isFullyCompleted
                              ? "text-rose-400 hover:bg-rose-500/10"
                              : "cursor-not-allowed text-slate-600 opacity-40"
                          }`}
                        >
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

      {/* STUDENT PROGRESS MODAL */}

      <Modal
        open={Boolean(progressAssignment)}
        onClose={() => setProgressAssignment(null)}
        title="Student evaluation progress"
        size="lg"
      >
        {progressAssignment && (
          <div className="space-y-4 bg-gray-900 text-slate-100">
            <div className="rounded-lg p-4" style={panelStyle}>
              <p className="font-semibold text-white">
                {teachers.find(
                  (item) => item.id === progressAssignment.teacherId
                )?.displayName ?? "Teacher"}
              </p>

              <p className="text-sm text-slate-400">
                {subjects.find(
                  (item) => item.id === progressAssignment.subjectId
                )
                  ? formatSubjectLabel(
                      subjects.find(
                        (item) => item.id === progressAssignment.subjectId
                      )!
                    )
                  : "Subject unavailable"}
                {" / "}
                {periods.find(
                  (item) => item.id === progressAssignment.periodId
                )?.name ?? "Evaluation period"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ProgressSummary
                label="Completed"
                value={`${progressCompleted}/${progressExpected}`}
                tone="complete"
              />

              <ProgressSummary
                label="Pending"
                value={progressPending}
                tone="pending"
              />

              <ProgressSummary
                label="Registered students"
                value={progressStudents.length}
                tone="neutral"
              />
            </div>

            <p className="text-xs text-slate-400">
              Completed is calculated from unique student IDs in
              evaluationCompletions for this assignment. Pending is the
              expected total minus completed evaluations. Expected students
              without registered accounts cannot be listed by name.
            </p>

            <div
              className="max-h-[50vh] divide-y divide-slate-700 overflow-y-auto"
              style={panelStyle}
            >
              {progressStudents.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  No registered students are linked to this assignment yet.
                  Expected pending evaluations are still included in the
                  count above.
                </p>
              ) : (
                progressStudents.map(
                  ({ studentId, student, completion }) => {
                    const program = programs.find(
                      (item) => item.id === student?.programId
                    );

                    const details = [
                      program?.code ?? student?.course,
                      student?.yearLevel
                        ? `Year ${student.yearLevel}`
                        : "",
                      student?.section
                        ? `Section ${student.section}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" / ");

                    return (
                      <div
                        key={studentId}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {student?.displayName ||
                              student?.email ||
                              studentId}
                          </p>

                          <p className="truncate text-xs text-slate-400">
                            {student?.email && student?.displayName
                              ? `${student.email} / `
                              : ""}
                            {details || "No academic details"}
                          </p>
                        </div>

                        {completion ? (
                          <div className="shrink-0 text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Completed
                            </span>

                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {fmtDateTime(completion.submittedAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            Pending
                          </span>
                        )}
                      </div>
                    );
                  }
                )
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setProgressAssignment(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* BULK ASSIGNMENT MODAL */}

      <Modal
        open={bulkOpen}
        onClose={() => !bulkLoading && setBulkOpen(false)}
        title="Bulk assign teachers"
        size="lg"
      >
        <form onSubmit={onBulkSave} className="space-y-4">
          <FormField label="Evaluation period">
            <select
              required
              value={bulkPeriodId}
              onChange={(event) => {
                setBulkPeriodId(event.target.value);
                setBulkTeacherIds(new Set());
              }}
              className={inputCls}
              style={darkInputStyle}
            >
              <option value="">Select period</option>

              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                  {period.status ? ` (${period.status})` : ""}
                </option>
              ))}
            </select>
          </FormField>

          <div className="overflow-hidden" style={panelStyle}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-3 py-3">
              <p className="text-sm font-semibold text-white">
                Teachers ({selectedBulkRows.length} selected)
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!bulkPeriodId}
                  onClick={() =>
                    setBulkTeacherIds(
                      new Set(
                        bulkRows
                          .filter((row) => row.available)
                          .map((row) => row.teacher.id)
                      )
                    )
                  }
                  className="text-xs font-semibold text-sky-300 disabled:opacity-50"
                >
                  Select all
                </button>

                <button
                  type="button"
                  onClick={() => setBulkTeacherIds(new Set())}
                  className="text-xs font-semibold text-slate-300"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="max-h-[45vh] divide-y divide-slate-700 overflow-y-auto">
              {bulkRows.map((row) => (
                <div
                  key={row.teacher.id}
                  className="grid gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,1fr)_7rem]"
                >
                  <input
                    type="checkbox"
                    checked={
                      row.available &&
                      bulkTeacherIds.has(row.teacher.id)
                    }
                    disabled={!row.available}
                    onChange={(event) => {
                      setBulkTeacherIds((current) => {
                        const next = new Set(current);

                        if (event.target.checked) {
                          next.add(row.teacher.id);
                        } else {
                          next.delete(row.teacher.id);
                        }

                        return next;
                      });
                    }}
                    className="mt-2 h-4 w-4"
                  />

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {row.teacher.displayName}
                    </p>

                    <p className="text-xs text-slate-400">
                      {depts.find(
                        (item) =>
                          item.id === row.teacher.departmentId
                      )?.name ?? "Department unavailable"}
                    </p>

                    {!row.available && (
                      <p className="text-xs text-amber-400">
                        {row.duplicate
                          ? "Already assigned"
                          : !row.subjects.length
                            ? "No assigned subject"
                            : "Select a period and subject"}
                      </p>
                    )}
                  </div>

                  <select
                    value={row.subjectId}
                    disabled={!row.subjects.length || row.duplicate}
                    onChange={(event) =>
                      setBulkSubjectIds((current) => ({
                        ...current,
                        [row.teacher.id]: event.target.value,
                      }))
                    }
                    className={inputCls}
                    style={darkInputStyle}
                  >
                    <option value="">Select subject</option>

                    {row.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {formatSubjectLabel(subject)}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={1}
                    required
                    value={row.count}
                    disabled={row.duplicate}
                    aria-label={`Expected students for ${row.teacher.displayName}`}
                    onChange={(event) =>
                      setBulkExpectedCounts((current) => ({
                        ...current,
                        [row.teacher.id]: Math.max(
                          1,
                          Math.floor(Number(event.target.value) || 1)
                        ),
                      }))
                    }
                    className={inputCls}
                    style={darkInputStyle}
                  />
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            The number field sets the expected student count. It defaults to the student count specified in each teacher&apos;s profile.
          </p>

          <div className="flex justify-end gap-2">
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
              className="btn-primary disabled:opacity-50"
            >
              {bulkLoading
                ? "Creating..."
                : `Create ${selectedBulkRows.length} assignment(s)`}
            </button>
          </div>
        </form>
      </Modal>

      {/* CREATE / EDIT ASSIGNMENT MODAL */}

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={
          editingAssignment
            ? "Edit teacher assignment"
            : "New teacher assignment"
        }
        size="lg"
      >
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Teacher">
            <select
              required
              disabled={Boolean(editingAssignment)}
              value={form.teacherId}
              onChange={(event) => {
                const teacherId = event.target.value;
                const teacher = teachers.find(
                  (item) => item.id === teacherId
                );
                const subjectId = defaultSubjectId(teacher);
                const ids = eligibleStudents(
                  teacherId,
                  subjectId
                ).map((student) => student.uid);

                const teacherExpected = Number((teacher as Teacher & { expectedStudents?: number })?.expectedStudents);
                const autoCount = teacherExpected > 0 ? teacherExpected : Math.max(ids.length, 1);

                setForm((current) => ({
                  ...current,
                  teacherId,
                  subjectId,
                  studentIds: ids,
                  expectedStudentCount: autoCount,
                }));
              }}
              className={inputCls}
              style={darkInputStyle}
            >
              <option value="">Select teacher</option>

              {teachers
                .filter((teacher) => teacher.status !== "inactive")
                .map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.displayName}
                  </option>
                ))}
            </select>
          </FormField>

          <FormField label="Subject">
            <select
              required
              value={form.subjectId}
              onChange={(event) => {
                const subjectId = event.target.value;
                const ids = eligibleStudents(
                  form.teacherId,
                  subjectId
                ).map((student) => student.uid);

                setForm((current) => ({
                  ...current,
                  subjectId,
                  studentIds: [
                    ...new Set([
                      ...ids,
                      ...completedStudentIds,
                    ]),
                  ],
                  expectedStudentCount: Math.max(
                    current.expectedStudentCount,
                    ids.length,
                    completedStudentIds.size,
                    1
                  ),
                }));
              }}
              className={inputCls}
              style={darkInputStyle}
            >
              <option value="">Select subject</option>

              {eligibleSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {formatSubjectLabel(subject)}
                </option>
              ))}
            </select>
          </FormField>

          {!editingAssignment && (
            <FormField
              label="Expected Number of Students"
              hint="Prefilled automatically from the teacher's profile. You can modify it if needed."
            >
              <input
                type="number"
                min={1}
                required
                value={form.expectedStudentCount}
                onChange={(event) => {
                  const value = Math.max(
                    1,
                    Math.floor(Number(event.target.value) || 1)
                  );

                  setForm((current) => ({
                    ...current,
                    expectedStudentCount: value,
                  }));
                }}
                className={inputCls}
                style={darkInputStyle}
              />
            </FormField>
          )}

          <FormField label="Evaluation Period">
            <select
              required
              disabled={Boolean(editingAssignment)}
              value={form.periodId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  periodId: event.target.value,
                }))
              }
              className={inputCls}
              style={darkInputStyle}
            >
              <option value="">Select evaluation period</option>

              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                  {period.status ? ` — ${period.status}` : ""}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Registered Students"
            hint={`${form.studentIds.length} registered student account(s) linked to this assignment. Students without accounts are counted in the expected total but cannot be listed by name.`}
          >
            <div className="overflow-hidden" style={panelStyle}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-3 py-2">
                <p className="text-xs text-slate-400">
                  Select registered student accounts
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        studentIds: [
                          ...new Set([
                            ...scopedStudents.map(
                              (student) => student.uid
                            ),
                            ...completedStudentIds,
                          ]),
                        ],
                      }))
                    }
                    className="text-xs font-semibold text-sky-300"
                  >
                    Select all
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        studentIds: Array.from(completedStudentIds),
                      }))
                    }
                    className="text-xs font-semibold text-slate-300"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-56 divide-y divide-slate-700 overflow-y-auto">
                {scopedStudents.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-400">
                    No registered students match this teacher and subject.
                    You can still enter the expected student count above.
                  </p>
                ) : (
                  scopedStudents.map((student) => {
                    const program = programs.find(
                      (item) => item.id === student.programId
                    );

                    const details = [
                      program?.code ?? student.course,
                      student.yearLevel
                        ? `Year ${student.yearLevel}`
                        : "",
                      student.section
                        ? `Section ${student.section}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" / ");

                    const checked = form.studentIds.includes(student.uid);
                    const completed = completedStudentIds.has(student.uid);

                    return (
                      <label
                        key={student.uid}
                        className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setForm((current) => ({
                              ...current,
                              studentIds: event.target.checked
                                ? [
                                    ...new Set([
                                      ...current.studentIds,
                                      student.uid,
                                    ]),
                                  ]
                                : completed
                                  ? current.studentIds
                                  : current.studentIds.filter(
                                      (id) => id !== student.uid
                                    ),
                            }));

                            if (!event.target.checked && completed) {
                              toast.error(
                                "A student who has completed an evaluation cannot be removed."
                              );
                            }
                          }}
                          className="mt-1 h-4 w-4"
                        />

                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-white">
                            {student.displayName || student.email}
                          </span>

                          <span className="block text-xs text-slate-400">
                            {student.email && student.displayName
                              ? `${student.email} / `
                              : ""}
                            {details || "No academic details"}
                          </span>
                        </span>

                        {completed && (
                          <span className="text-xs font-semibold text-emerald-400">
                            Completed
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </FormField>

          <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
            <p className="text-xs text-slate-400">
              Live evaluation summary
            </p>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-400">
                Completed:{" "}
                {editingAssignment ? completedStudentIds.size : 0}/
                {Math.max(
                  form.expectedStudentCount,
                  form.studentIds.length,
                  completedStudentIds.size
                )}
              </span>

              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 font-semibold text-amber-400">
                Pending:{" "}
                {Math.max(
                  Math.max(
                    form.expectedStudentCount,
                    form.studentIds.length,
                    completedStudentIds.size
                  ) -
                    (editingAssignment ? completedStudentIds.size : 0),
                  0
                )}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading
                ? "Saving..."
                : editingAssignment
                  ? "Save changes"
                  : "Save assignment"}
            </button>
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
  value: string | number;
  tone: "neutral" | "complete" | "pending";
}
) {
  const color =
    tone === "complete"
      ? "text-emerald-400"
      : tone === "pending"
        ? "text-amber-400"
        : "text-white";

  return (
    <div className="rounded-lg" style={panelStyle}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
