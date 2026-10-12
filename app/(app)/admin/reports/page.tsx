"use client";

import * as React from "react";
import {
  Award,
  FileDown,
  FileSpreadsheet,
  RefreshCcw,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FormField, inputCls, PageHeader } from "@/components/data-table";
import { SchoolwideAnalytics } from "@/components/reports/schoolwide-analytics";
import { FinalizedRatingsTable } from "@/components/reports/finalized-ratings-table";
import {
  exportRowsToExcel,
  exportRowsToPDF,
  exportToExcel,
  exportToPDF,
} from "@/lib/reports";
import {
  authenticatedFetch,
  readApiResponse,
} from "@/lib/authenticated-fetch";
import type {
  Department,
  Evaluation,
  EvaluationCompletion,
  EvaluationPeriod,
  PerformanceReport,
  Program,
  StudentRegistry,
  Subject,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-extras";
import { reportableEvaluations } from "@/lib/evaluation-results";
import { groupReportRatings } from "@/lib/report-ratings";
import {
  buildReportParticipation,
  participationStatus,
} from "@/lib/report-participation";
import toast from "react-hot-toast";

type ManagedStudent = StudentRegistry & {
  accountCreated: boolean;
  emailVerified: boolean;
  lastLoginAt: number;
};

type AssignmentWithTarget = TeacherAssignment & {
  targetStudentCount?: number | string;
  studentIds?: string[];
  programIds?: string[];
  yearLevels?: string[];
  sections?: string[];
};

type ProgressRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  programId: string;
  yearLevel: string;
  section: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  periodId: string;
  status: "completed" | "pending";
  submittedAt: number;
};

type AssignmentProgress = {
  assignmentId: string;
  teacherId: string;
  subjectId: string;
  departmentId: string;
  periodId: string;
  programIds: string[];
  yearLevels: string[];
  sections: string[];
  target: number;
  completed: number;
  pending: number;
};

type DepartmentProgress = {
  departmentId: string;
  department: string;
  target: number;
  completed: number;
  pending: number;
  rate: number;
};

type Filters = {
  teacherId: string;
  departmentId: string;
  programId: string;
  yearLevel: string;
  periodId: string;
  semester: string;
  academicYear: string;
  status: string;
};

const emptyFilters: Filters = {
  teacherId: "",
  departmentId: "",
  programId: "",
  yearLevel: "",
  periodId: "",
  semester: "",
  academicYear: "",
  status: "",
};

function uniqueStrings(values: unknown[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    ),
  ];
}

function getStudentIdentifiers(student: ManagedStudent): string[] {
  const record = student as ManagedStudent & {
    id?: string;
    studentId?: string;
    schoolNumber?: string;
    claimedUid?: string;
  };

  return uniqueStrings([
    record.id,
    record.studentId,
    record.schoolNumber,
    record.claimedUid,
  ]);
}

function matchesAssignmentStudent(
  student: ManagedStudent,
  assignment: AssignmentWithTarget
): boolean {
  const record = student as ManagedStudent & {
    programId?: string;
    yearLevel?: string;
    section?: string;
  };

  const programIds = assignment.programIds ?? [];
  const yearLevels = assignment.yearLevels ?? [];
  const sections = assignment.sections ?? [];

  if (
    programIds.length > 0 &&
    (!record.programId || !programIds.includes(record.programId))
  ) {
    return false;
  }

  if (
    yearLevels.length > 0 &&
    (!record.yearLevel || !yearLevels.includes(record.yearLevel))
  ) {
    return false;
  }

  if (
    sections.length > 0 &&
    (!record.section || !sections.includes(record.section))
  ) {
    return false;
  }

  return true;
}

function getAssignmentTarget(
  assignment: AssignmentWithTarget,
  matchedStudentCount: number
): number {
  const configuredTarget = Number(assignment.targetStudentCount ?? 0);
  const listedStudentCount = uniqueStrings(assignment.studentIds ?? []).length;

  if (Number.isFinite(configuredTarget) && configuredTarget > 0) {
    return Math.max(Math.floor(configuredTarget), listedStudentCount);
  }

  return Math.max(matchedStudentCount, listedStudentCount);
}

function getUniqueCompletions(
  completions: EvaluationCompletion[]
): Map<string, EvaluationCompletion> {
  const result = new Map<string, EvaluationCompletion>();

  for (const completion of completions) {
    if (!completion.assignmentId || !completion.studentId) continue;

    const key = `${completion.assignmentId}_${completion.studentId}`;
    const previous = result.get(key);

    if (
      !previous ||
      Number(completion.submittedAt ?? 0) >
        Number(previous.submittedAt ?? 0)
    ) {
      result.set(key, completion);
    }
  }

  return result;
}

function buildProgressRows(
  students: ManagedStudent[],
  assignments: AssignmentWithTarget[],
  completions: EvaluationCompletion[]
): ProgressRow[] {
  const studentsByIdentifier = new Map<string, ManagedStudent>();

  for (const student of students) {
    for (const identifier of getStudentIdentifiers(student)) {
      studentsByIdentifier.set(identifier, student);
    }
  }

  const completionMap = getUniqueCompletions(completions);
  const rows = new Map<string, ProgressRow>();

  for (const assignment of assignments) {
    const listedIds = uniqueStrings(assignment.studentIds ?? []);
    const explicitlyAssigned = listedIds.length > 0;

    const matchingStudents = students.filter((student) => {
      if (explicitlyAssigned) {
        const identifiers = getStudentIdentifiers(student);
        return listedIds.some((id) => identifiers.includes(id));
      }

      return matchesAssignmentStudent(student, assignment);
    });

    const assignedIds = new Set<string>(listedIds);

    for (const student of matchingStudents) {
      const identifier = getStudentIdentifiers(student)[0];
      if (identifier) assignedIds.add(identifier);
    }

    const target = getAssignmentTarget(
      assignment,
      matchingStudents.length
    );

    for (const studentId of assignedIds) {
      const student = studentsByIdentifier.get(studentId);

      const record = student as
        | (ManagedStudent & {
            programId?: string;
            yearLevel?: string;
            section?: string;
          })
        | undefined;

      const completion =
        completionMap.get(`${assignment.id}_${studentId}`) ??
        [...completionMap.values()].find(
          (item) =>
            item.assignmentId === assignment.id &&
            item.studentId !== undefined &&
            getStudentIdentifiers(student ?? ({} as ManagedStudent)).includes(
              item.studentId
            )
        );

      const id = `${assignment.id}_${studentId}`;
      if (rows.has(id)) continue;

      rows.set(id, {
        id,
        studentId,
        studentName: record?.displayName ?? "Student record unavailable",
        studentEmail: record?.email ?? "",
        programId:
          record?.programId ??
          completion?.programId ??
          assignment.programIds?.[0] ??
          "",
        yearLevel:
          record?.yearLevel ??
          completion?.yearLevel ??
          assignment.yearLevels?.[0] ??
          "",
        section:
          record?.section ??
          completion?.section ??
          assignment.sections?.[0] ??
          "",
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        departmentId: assignment.departmentId,
        periodId: assignment.periodId,
        status: completion ? "completed" : "pending",
        submittedAt: completion
          ? Number(completion.submittedAt ?? 0)
          : 0,
      });
    }

    const placeholderCount = Math.max(0, target - assignedIds.size);

    for (let index = 0; index < placeholderCount; index += 1) {
      const placeholderId = `unidentified-${index + 1}`;
      const id = `${assignment.id}_${placeholderId}`;

      if (rows.has(id)) continue;

      rows.set(id, {
        id,
        studentId: placeholderId,
        studentName: `Assigned student not identified (${index + 1})`,
        studentEmail: "",
        programId: assignment.programIds?.[0] ?? "",
        yearLevel: assignment.yearLevels?.[0] ?? "",
        section: assignment.sections?.[0] ?? "",
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        departmentId: assignment.departmentId,
        periodId: assignment.periodId,
        status: "pending",
        submittedAt: 0,
      });
    }
  }

  return [...rows.values()];
}

function buildAssignmentProgress(
  assignments: AssignmentWithTarget[],
  students: ManagedStudent[],
  completions: EvaluationCompletion[]
): AssignmentProgress[] {
  const uniqueCompletions = getUniqueCompletions(completions);
  const completionRows = [...uniqueCompletions.values()];

  return assignments.map((assignment) => {
    const listedIds = uniqueStrings(assignment.studentIds ?? []);
    const explicitlyAssigned = listedIds.length > 0;

    const matchingStudents = students.filter((student) => {
      if (explicitlyAssigned) {
        const identifiers = getStudentIdentifiers(student);
        return listedIds.some((id) => identifiers.includes(id));
      }

      return matchesAssignmentStudent(student, assignment);
    });

    const target = getAssignmentTarget(
      assignment,
      matchingStudents.length
    );

    const completionStudentIds = new Set<string>();

    for (const completion of completionRows) {
      if (completion.assignmentId !== assignment.id) continue;
      if (!completion.studentId) continue;

      completionStudentIds.add(completion.studentId);
    }

    let completedCount = 0;

    if (explicitlyAssigned) {
      const allowedIdentifiers = new Set<string>(listedIds);

      for (const student of matchingStudents) {
        for (const identifier of getStudentIdentifiers(student)) {
          allowedIdentifiers.add(identifier);
        }
      }

      completedCount = completionRows.filter(
        (completion) =>
          completion.assignmentId === assignment.id &&
          Boolean(completion.studentId) &&
          allowedIdentifiers.has(completion.studentId!)
      ).length;
    } else {
      completedCount = completionStudentIds.size;
    }

    const completed = Math.min(target, completedCount);

    return {
      assignmentId: assignment.id,
      teacherId: assignment.teacherId,
      subjectId: assignment.subjectId,
      departmentId: assignment.departmentId,
      periodId: assignment.periodId,
      programIds: assignment.programIds ?? [],
      yearLevels: assignment.yearLevels ?? [],
      sections: assignment.sections ?? [],
      target,
      completed,
      pending: Math.max(0, target - completed),
    };
  });
}

function reportMeta(
  filters: Filters,
  teachers: Teacher[],
  departments: Department[],
  periods: EvaluationPeriod[]
) {
  return {
    teacher:
      teachers.find((item) => item.id === filters.teacherId)?.displayName ??
      "All teachers",
    department:
      departments.find((item) => item.id === filters.departmentId)?.name ??
      "All departments",
    period:
      periods.find((item) => item.id === filters.periodId)?.name ??
      [
        filters.semester || "All semesters",
        filters.academicYear || "All academic years",
      ].join(" / "),
  };
}


function deriveAccurateAnalysis(report: PerformanceReport, evaluations: Evaluation[]) {
  const teacherEvals = evaluations.filter(
    (e) => e.teacherId === report.teacherId && e.subjectId === report.subjectId
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  const avg = report.averageScore;

  if (avg >= 4.5) {
    strengths.push("Consistently exceptional student approval ratings across instruction.");
    strengths.push("High clarity of course concepts and highly engaging delivery style.");
  } else if (avg >= 4.0) {
    strengths.push("Solid foundational command of subject matter with reliable classroom engagement.");
    strengths.push("Good rapport established with students regarding course deliverables.");
  } else if (avg >= 3.0) {
    strengths.push("Adequate delivery of core curriculum requirements.");
  } else {
    weaknesses.push("Overall student ratings fall below expected threshold, pointing to instructional friction.");
  }

  const comments = teacherEvals
    .map((e) => e.comment?.toLowerCase() || "")
    .filter(Boolean);

  const fastCount = comments.filter((c) => c.includes("fast") || c.includes("speed")).length;
  const slowCount = comments.filter((c) => c.includes("slow") || c.includes("behind")).length;
  const clearCount = comments.filter((c) => c.includes("clear") || c.includes("understand") || c.includes("good")).length;
  const confuseCount = comments.filter((c) => c.includes("confus") || c.includes("hard") || c.includes("unclear")).length;
  const promptCount = comments.filter((c) => c.includes("late") || c.includes("feedback") || c.includes("return")).length;

  if (clearCount > 0) {
    strengths.push("Students explicitly highlighted clear explanations and effective concept breakdown.");
  }
  if (fastCount > 0) {
    weaknesses.push("Student feedback notes that lesson pacing can occasionally feel rushed or too fast.");
    recommendations.push("Consider slowing down pacing during complex modular topics or incorporating recap check-ins.");
  }
  if (slowCount > 0) {
    weaknesses.push("Student feedback mentions pacing can feel slightly slow or redundant.");
  }
  if (confuseCount > 0) {
    weaknesses.push("Some student comments reflect confusion regarding technical instructions or lab guidelines.");
    recommendations.push("Provide supplementary step-by-step documentation or visual guides for major assignments.");
  }
  if (promptCount > 0) {
    weaknesses.push("Feedback indicates room for improvement in returning graded outputs more promptly.");
    recommendations.push("Streamline grading rubrics to ensure timely return of student feedback.");
  }

  if (strengths.length === 0) {
    strengths.push("Maintains standard classroom discipline and structure.");
  }
  if (weaknesses.length === 0) {
    if (avg >= 4.0) {
      weaknesses.push("No major weaknesses noted by current student cohorts.");
    } else {
      weaknesses.push("Student feedback suggests a need for more interactive Q&A sessions.");
    }
  }
  if (recommendations.length === 0) {
    if (avg >= 4.2) {
      recommendations.push("Maintain current effective teaching strategies and share best practices with department peers.");
    } else {
      recommendations.push("Incorporate more formative quizzes or interactive student participation exercises.");
    }
  }

  return { strengths, weaknesses, recommendations };
}

export default function AdminReportsPage() {
  const [mode, setMode] = React.useState<"responses" | "progress">(
    "responses"
  );

  const [submittedEvaluations, setSubmittedEvaluations] = React.useState<
    Evaluation[]
  >([]);
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [progress, setProgress] = React.useState<ProgressRow[]>([]);
  const [assignmentProgress, setAssignmentProgress] = React.useState<
    AssignmentProgress[]
  >([]);

  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [performanceReports, setPerformanceReports] = React.useState<
    PerformanceReport[]
  >([]);

  const [filters, setFilters] = React.useState<Filters>(emptyFilters);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const loadInProgress = React.useRef(false);

  const load = React.useCallback(async () => {
    if (loadInProgress.current) return;

    loadInProgress.current = true;
    setLoading(true);

    try {
      const [
        studentResponse,
        evaluationSnapshot,
        completionSnapshot,
        assignmentSnapshot,
        teacherSnapshot,
        departmentSnapshot,
        programSnapshot,
        subjectSnapshot,
        periodSnapshot,
        performanceReportSnapshot,
      ] = await Promise.all([
        authenticatedFetch("/api/admin/students"),
        getDocs(collection(db, "evaluations")),
        getDocs(collection(db, "evaluationCompletions")),
        getDocs(collection(db, "teacherAssignments")),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "departments")),
        getDocs(collection(db, "programs")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "evaluationPeriods")),
        getDocs(collection(db, "performanceReports")),
      ]);

      const studentData = await readApiResponse<{
        registrations: ManagedStudent[];
      }>(studentResponse);

      const students = studentData.registrations ?? [];

      const evaluationRows: Evaluation[] =
        evaluationSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Evaluation, "id">),
        }));

      const completionRows: EvaluationCompletion[] =
        completionSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationCompletion, "id">),
        }));

      const assignmentRows: AssignmentWithTarget[] =
        assignmentSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<AssignmentWithTarget, "id">),
        }));

      const teacherRows: Teacher[] = teacherSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Teacher, "id">),
      }));

      const departmentRows: Department[] =
        departmentSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Department, "id">),
        }));

      const programRows: Program[] = programSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Program, "id">),
      }));

      const subjectRows: Subject[] = subjectSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Subject, "id">),
      }));

      const periodRows: EvaluationPeriod[] =
        periodSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<EvaluationPeriod, "id">),
        }));

      const performanceRows: PerformanceReport[] =
        performanceReportSnapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<PerformanceReport, "id">),
        }));

      const finalizedRows = reportableEvaluations(
        evaluationRows,
        assignmentRows,
        completionRows
      ).filter((evaluation) => Number.isFinite(evaluation.averageScore) && evaluation.averageScore >= 1 && evaluation.averageScore <= 5);

      const finalizedKeys = new Set(
        finalizedRows.map(
          (evaluation) =>
            `${evaluation.periodId}_${evaluation.teacherId}_${evaluation.subjectId}`
        )
      );
      setSubmittedEvaluations(evaluationRows);
      setEvaluations(finalizedRows);
      setTeachers(teacherRows);
      setDepartments(departmentRows);
      setPrograms(programRows);
      setSubjects(subjectRows);
      setPeriods(periodRows);

      setPerformanceReports(
        performanceRows.filter((report) =>
          finalizedKeys.has(
            `${report.periodId}_${report.teacherId}_${report.subjectId}`
          )
        )
      );

      setProgress(
        buildProgressRows(students, assignmentRows, completionRows)
      );

      setAssignmentProgress(
        buildAssignmentProgress(
          assignmentRows,
          students,
          completionRows
        )
      );

      setHasLoaded(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Report data could not be loaded."
      );
    } finally {
      loadInProgress.current = false;
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();

    const refresh = () => void load();
    window.addEventListener("focus", refresh);

    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const matchesResponseFilters = React.useCallback((evaluation: Evaluation) => {
    const period = periods.find((item) => item.id === evaluation.periodId);
    if (filters.teacherId && evaluation.teacherId !== filters.teacherId) return false;
    if (filters.departmentId && evaluation.departmentId !== filters.departmentId) return false;
    if (filters.programId && evaluation.programId !== filters.programId) return false;
    if (filters.yearLevel && evaluation.yearLevel !== filters.yearLevel) return false;
    if (filters.periodId && evaluation.periodId !== filters.periodId) return false;
    if (filters.semester && period?.semester !== filters.semester) return false;
    if (filters.academicYear && period?.academicYear !== filters.academicYear) return false;
    if (filters.status === "pending") return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [
      teachers.find((item) => item.id === evaluation.teacherId)?.displayName,
      subjects.find((item) => item.id === evaluation.subjectId)?.name,
      departments.find((item) => item.id === evaluation.departmentId)?.name,
      programs.find((item) => item.id === evaluation.programId)?.code,
      evaluation.yearLevel,
      period?.name,
    ].some((value) => value?.toLowerCase().includes(needle));
  }, [
    departments,
    filters,
    periods,
    programs,
    search,
    subjects,
    teachers,
  ]);
  const filteredSubmitted = React.useMemo(
    () => submittedEvaluations.filter((evaluation) => matchesResponseFilters(evaluation)),
    [submittedEvaluations, matchesResponseFilters]
  );

  const filteredEvaluations = React.useMemo(
    () => evaluations.filter((evaluation) => matchesResponseFilters(evaluation)),
    [evaluations, matchesResponseFilters]
  );
  const finalizedRatings = React.useMemo(
    () => groupReportRatings(filteredEvaluations, programs),
    [filteredEvaluations, programs]
  );

  const reportParticipation = React.useMemo(() => {
    const cohort = progress.filter((row) => {
      const period = periods.find((item) => item.id === row.periodId);

      if (filters.teacherId && row.teacherId !== filters.teacherId)
        return false;
      if (filters.departmentId && row.departmentId !== filters.departmentId)
        return false;
      if (filters.programId && row.programId !== filters.programId)
        return false;
      if (filters.yearLevel && row.yearLevel !== filters.yearLevel)
        return false;
      if (filters.periodId && row.periodId !== filters.periodId)
        return false;
      if (filters.semester && period?.semester !== filters.semester)
        return false;
      if (
        filters.academicYear &&
        period?.academicYear !== filters.academicYear
      )
        return false;

      const needle = search.trim().toLowerCase();
      if (!needle) return true;

      return [
        teachers.find((item) => item.id === row.teacherId)?.displayName,
        subjects.find((item) => item.id === row.subjectId)?.name,
        departments.find((item) => item.id === row.departmentId)?.name,
        programs.find((item) => item.id === row.programId)?.code,
        row.yearLevel,
        periods.find((item) => item.id === row.periodId)?.name,
      ].some((value) => value?.toLowerCase().includes(needle));
    });

    return buildReportParticipation(filteredSubmitted, cohort);
  }, [
    departments,
    filteredSubmitted,
    filters,
    periods,
    programs,
    progress,
    search,
    subjects,
    teachers,
  ]);

  const partialReport =
    filteredSubmitted.length > filteredEvaluations.length ||
    reportParticipation.some(
      (row) => participationStatus(row) === "Partial"
    );

  const filteredProgress = React.useMemo(
    () =>
      progress.filter((row) => {
        const period = periods.find((item) => item.id === row.periodId);

        if (filters.teacherId && row.teacherId !== filters.teacherId)
          return false;
        if (filters.departmentId && row.departmentId !== filters.departmentId)
          return false;
        if (filters.programId && row.programId !== filters.programId)
          return false;
        if (filters.yearLevel && row.yearLevel !== filters.yearLevel)
          return false;
        if (filters.periodId && row.periodId !== filters.periodId)
          return false;
        if (filters.semester && period?.semester !== filters.semester)
          return false;
        if (
          filters.academicYear &&
          period?.academicYear !== filters.academicYear
        )
          return false;
        if (filters.status && row.status !== filters.status) return false;

        const needle = search.trim().toLowerCase();
        if (!needle) return true;

        return [
          row.studentName,
          row.studentEmail,
          teachers.find((item) => item.id === row.teacherId)?.displayName,
          subjects.find((item) => item.id === row.subjectId)?.name,
          departments.find((item) => item.id === row.departmentId)?.name,
          programs.find((item) => item.id === row.programId)?.code,
          row.yearLevel,
          row.section,
          period?.name,
          row.status,
        ].some((value) => value?.toLowerCase().includes(needle));
      }),
    [
      departments,
      filters,
      periods,
      programs,
      progress,
      search,
      subjects,
      teachers,
    ]
  );

  const filteredAssignmentProgress = React.useMemo(
    () =>
      assignmentProgress.filter((assignment) => {
        const period = periods.find(
          (item) => item.id === assignment.periodId
        );

        if (
          filters.teacherId &&
          assignment.teacherId !== filters.teacherId
        )
          return false;
        if (
          filters.departmentId &&
          assignment.departmentId !== filters.departmentId
        )
          return false;
        if (
          filters.programId &&
          !assignment.programIds.includes(filters.programId)
        )
          return false;
        if (
          filters.yearLevel &&
          !assignment.yearLevels.includes(filters.yearLevel)
        )
          return false;
        if (
          filters.periodId &&
          assignment.periodId !== filters.periodId
        )
          return false;
        if (filters.semester && period?.semester !== filters.semester)
          return false;
        if (
          filters.academicYear &&
          period?.academicYear !== filters.academicYear
        )
          return false;

        const needle = search.trim().toLowerCase();
        if (!needle) return true;

        return [
          teachers.find((item) => item.id === assignment.teacherId)
            ?.displayName,
          subjects.find((item) => item.id === assignment.subjectId)?.name,
          departments.find((item) => item.id === assignment.departmentId)
            ?.name,
          programs
            .filter((item) => assignment.programIds.includes(item.id))
            .map((item) => item.code)
            .join(" "),
          assignment.yearLevels.join(" "),
          period?.name,
        ].some((value) => value?.toLowerCase().includes(needle));
      }),
    [
      assignmentProgress,
      departments,
      filters,
      periods,
      programs,
      search,
      subjects,
      teachers,
    ]
  );

  const departmentProgressData = React.useMemo<DepartmentProgress[]>(() => {
    const totals = new Map<string, DepartmentProgress>();

    for (const assignment of filteredAssignmentProgress) {
      const departmentId = assignment.departmentId || "__unassigned__";
      const departmentName =
        departments.find((item) => item.id === assignment.departmentId)
          ?.name ?? "Unassigned department";

      const current = totals.get(departmentId) ?? {
        departmentId,
        department: departmentName,
        target: 0,
        completed: 0,
        pending: 0,
        rate: 0,
      };

      current.target += assignment.target;
      current.completed += assignment.completed;
      current.pending += assignment.pending;

      totals.set(departmentId, current);
    }

    return [...totals.values()]
      .map((item) => ({
        ...item,
        rate:
          item.target > 0
            ? Number(((item.completed / item.target) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [filteredAssignmentProgress, departments]);

  const graphAssignedTotal = departmentProgressData.reduce(
    (sum, item) => sum + item.target,
    0
  );

  const graphCompletedTotal = departmentProgressData.reduce(
    (sum, item) => sum + item.completed,
    0
  );

  const graphPendingTotal = departmentProgressData.reduce(
    (sum, item) => sum + item.pending,
    0
  );

  const filteredPerformanceReports = React.useMemo(() => {
    if (filters.programId || filters.yearLevel || mode !== "responses")
      return [];

    const needle = search.trim().toLowerCase();

    return performanceReports.filter((report) => {
      const period = periods.find((item) => item.id === report.periodId);

      if (filters.teacherId && report.teacherId !== filters.teacherId)
        return false;
      if (
        filters.departmentId &&
        report.departmentId !== filters.departmentId
      )
        return false;
      if (filters.periodId && report.periodId !== filters.periodId)
        return false;
      if (filters.semester && period?.semester !== filters.semester)
        return false;
      if (
        filters.academicYear &&
        period?.academicYear !== filters.academicYear
      )
        return false;
      if (!needle) return true;

      return [
        teachers.find((item) => item.id === report.teacherId)?.displayName,
        subjects.find((item) => item.id === report.subjectId)?.name,
        departments.find((item) => item.id === report.departmentId)?.name,
        period?.name,
        report.summary,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [
    departments,
    filters,
    mode,
    performanceReports,
    periods,
    search,
    subjects,
    teachers,
  ]);

  const topTeachersRanking = React.useMemo(() => {
    const teacherMap = new Map<
      string,
      { teacherId: string; totalScore: number; count: number; comments: string[] }
    >();

    for (const ev of filteredEvaluations) {
      const current = teacherMap.get(ev.teacherId) ?? {
        teacherId: ev.teacherId,
        totalScore: 0,
        count: 0,
        comments: [],
      };
      current.totalScore += ev.averageScore;
      current.count += 1;
      if (ev.comment?.trim()) {
        current.comments.push(ev.comment.trim());
      }
      teacherMap.set(ev.teacherId, current);
    }

    return [...teacherMap.values()]
      .map((item) => ({
        teacherId: item.teacherId,
        teacher: teachers.find((t) => t.id === item.teacherId)?.displayName ?? "Unknown Teacher",
        department: departments.find(
          (d) => d.id === teachers.find((t) => t.id === item.teacherId)?.departmentId
        )?.name ?? "—",
        averageScore: item.count > 0 ? item.totalScore / item.count : 0,
        totalEvaluations: item.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore || b.totalEvaluations - a.totalEvaluations);
  }, [filteredEvaluations, teachers, departments]);

  const exportReport = (kind: "pdf" | "excel") => {
    setBusy(true);

    try {
      if (mode === "responses") {
        if (filters.status === "pending") {
          throw new Error(
            "Pending students have no submitted responses. Choose all statuses or export the Student status view."
          );
        }

        if (
          filteredSubmitted.length === 0 &&
          reportParticipation.length === 0
        ) {
          throw new Error(
            "No evaluation records or assigned students match these filters."
          );
        }

        const meta = reportMeta(filters, teachers, departments, periods);

        const lookups = {
          teachers: Object.fromEntries(teachers.map((item) => [item.id, item.displayName])),
          departments: Object.fromEntries(departments.map((item) => [item.id, item.code || item.name])),
          subjects: Object.fromEntries(subjects.map((item) => [item.id, item.name])),
          periods: Object.fromEntries(periods.map((item) => [item.id, item.name])),
          programs: Object.fromEntries(programs.map((item) => [item.id, item.code])),
        };
        const options = { participation: reportParticipation, partial: partialReport, finalizedRatings };
        if (kind === "pdf") exportToPDF(filteredSubmitted, meta, lookups, options);
        else exportToExcel(filteredSubmitted, meta, lookups, options);
      } else {
        if (filteredProgress.length === 0) {
          throw new Error(
            "No student progress rows match these filters."
          );
        }

        const rows = filteredProgress.map((row) => ({
          Student: row.studentName,
          Email: row.studentEmail,
          Program:
            programs.find((item) => item.id === row.programId)?.code ?? "",
          YearLevel: row.yearLevel,
          Section: row.section,
          Teacher:
            teachers.find((item) => item.id === row.teacherId)
              ?.displayName ?? "",
          Subject:
            subjects.find((item) => item.id === row.subjectId)?.name ?? "",
          Department:
            departments.find((item) => item.id === row.departmentId)
              ?.name ?? "",
          Period:
            periods.find((item) => item.id === row.periodId)?.name ?? "",
          Status: row.status,
          Submitted: row.submittedAt
            ? fmtDateTime(row.submittedAt)
            : "",
        }));

        const completedCount = filteredProgress.filter(
          (row) => row.status === "completed"
        ).length;
        const pendingCount = filteredProgress.filter(
          (row) => row.status === "pending"
        ).length;

        if (kind === "excel") {
          exportRowsToExcel(
            rows,
            "Student Progress",
            {
              Product: "WBTE",
              Generated: fmtDateTime(Date.now()),
              Records: rows.length,
              Completed: completedCount,
              Pending: pendingCount,
            },
            `WBTE-Student-Progress-${Date.now()}.xlsx`
          );
        } else {
          exportRowsToPDF(
            rows,
            "WBTE Student Evaluation Progress",
            [
              `Records: ${rows.length}`,
              `Completed: ${completedCount}`,
              `Pending: ${pendingCount}`,
            ],
            [
              { header: "Student", value: (row) => row.Student },
              {
                header: "Program",
                value: (row) =>
                  `${row.Program} ${row.YearLevel}/${row.Section}`,
              },
              { header: "Teacher", value: (row) => row.Teacher },
              { header: "Subject", value: (row) => row.Subject },
              { header: "Period", value: (row) => row.Period },
              { header: "Status", value: (row) => row.Status },
              { header: "Submitted", value: (row) => row.Submitted },
            ],
            `WBTE-Student-Progress-${Date.now()}.pdf`
          );
        }
      }

      toast.success(
        mode === "responses" && partialReport
          ? "Partial report exported"
          : "Report exported"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Export failed."
      );
    } finally {
      setBusy(false);
    }
  };

  const regenerateAnalysis = async () => {
    if (!filters.periodId) {
      toast.error("Select one evaluation period first.");
      return;
    }

    setBusy(true);

    try {
      const response = await authenticatedFetch("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ periodId: filters.periodId }),
      });

      const result = await readApiResponse<{ reports: number }>(response);

      await load();

      toast.success(
        `${result.reports} AI performance report${
          result.reports === 1 ? "" : "s"
        } generated`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Analysis generation failed."
      );
    } finally {
      setBusy(false);
    }
  };

  const assignedTotal = filteredAssignmentProgress.reduce(
    (sum, item) => sum + item.target,
    0
  );

  const completedTotal = filteredAssignmentProgress.reduce(
    (sum, item) => sum + item.completed,
    0
  );

  const pendingTotal = Math.max(0, assignedTotal - completedTotal);

  const average = filteredEvaluations.length
    ? filteredEvaluations.reduce(
        (sum, evaluation) => sum + evaluation.averageScore,
        0
      ) / filteredEvaluations.length
    : 0;

  const submittedComments = filteredSubmitted.filter((item) =>
    item.comment?.trim()
  );

  const initialLoading = loading && !hasLoaded;

  const academicYears = Array.from(
    new Set(
      periods
        .map((period) => period.academicYear)
        .filter((year): year is string => Boolean(year))
    )
  ).sort();

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Filter anonymous results or student completion records and export PDF or Excel."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              className="btn-secondary"
              title="Refresh reports"
            >
              <RefreshCcw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => void regenerateAnalysis()}
              disabled={busy}
              className="btn-secondary"
            >
              <RefreshCcw className="h-4 w-4" />
              Generate AI analysis
            </button>

            <button
              type="button"
              onClick={() => exportReport("pdf")}
              disabled={busy || loading}
              className="btn-primary"
            >
              <FileDown className="h-4 w-4" />
              PDF
            </button>

            <button
              type="button"
              onClick={() => exportReport("excel")}
              disabled={busy || loading}
              className="btn-secondary"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
          </div>
        }
      />

      <SchoolwideAnalytics />

      <div className="mb-5 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setMode("responses")}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${
            mode === "responses"
              ? "bg-white shadow-sm dark:bg-slate-900"
              : "text-slate-500"
          }`}
        >
          Anonymous responses
        </button>

        <button
          type="button"
          onClick={() => setMode("progress")}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${
            mode === "progress"
              ? "bg-white shadow-sm dark:bg-slate-900"
              : "text-slate-500"
          }`}
        >
          Student status
        </button>
      </div>

      <section className="border-y border-slate-200 py-5 dark:border-slate-800">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2 xl:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                mode === "progress"
                  ? "Search student, teacher, subject, or period"
                  : "Search teacher, subject, department, or period"
              }
              className={`${inputCls} pl-10`}
            />
          </div>

          <SelectFilter
            label="Teacher"
            value={filters.teacherId}
            onChange={(teacherId) =>
              setFilters((current) => ({ ...current, teacherId }))
            }
          >
            <option value="">All teachers</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.displayName}
              </option>
            ))}
          </SelectFilter>

          <SelectFilter
            label="Department"
            value={filters.departmentId}
            onChange={(departmentId) =>
              setFilters((current) => ({ ...current, departmentId }))
            }
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectFilter>

          <SelectFilter
            label="Program"
            value={filters.programId}
            onChange={(programId) =>
              setFilters((current) => ({ ...current, programId }))
            }
          >
            <option value="">All Programs</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.code}
              </option>
            ))}
          </SelectFilter>

          <SelectFilter
            label="Year level"
            value={filters.yearLevel}
            onChange={(yearLevel) =>
              setFilters((current) => ({ ...current, yearLevel }))
            }
          >
            <option value="">All year levels</option>
            {["1st", "2nd", "3rd", "4th"].map((year) => (
              <option key={year} value={year}>
                {year} year
              </option>
            ))}
          </SelectFilter>

          <SelectFilter
            label="Evaluation period"
            value={filters.periodId}
            onChange={(periodId) =>
              setFilters((current) => ({ ...current, periodId }))
            }
          >
            <option value="">All periods</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </SelectFilter>

          <SelectFilter
            label="Semester"
            value={filters.semester}
            onChange={(semester) =>
              setFilters((current) => ({ ...current, semester }))
            }
          >
            <option value="">All semesters</option>
            <option value="1st">1st Semester</option>
            <option value="2nd">2nd Semester</option>
            <option value="summer">Summer</option>
          </SelectFilter>

          <SelectFilter
            label="Academic year"
            value={filters.academicYear}
            onChange={(academicYear) =>
              setFilters((current) => ({ ...current, academicYear }))
            }
          >
            <option value="">All academic years</option>
            {academicYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </SelectFilter>

          <SelectFilter
            label="Evaluation status"
            value={filters.status}
            onChange={(status) =>
              setFilters((current) => ({ ...current, status }))
            }
          >
            <option value="">Completed and pending</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
          </SelectFilter>
        </div>

        <button
          type="button"
          onClick={() => {
            setFilters(emptyFilters);
            setSearch("");
          }}
          className="mt-3 text-xs font-semibold text-brand-700 dark:text-brand-300"
        >
          Clear filters
        </button>
      </section>

      <div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {mode === "responses" ? (
          <>
            <Summary
              label="Responses received"
              value={initialLoading ? "..." : filteredSubmitted.length}
            />
            <Summary
              label="Finalized responses"
              value={initialLoading ? "..." : filteredEvaluations.length}
            />
            <Summary
              label="Finalized average rating"
              value={
                initialLoading
                  ? "..."
                  : filteredEvaluations.length
                    ? average.toFixed(2)
                    : "—"
              }
            />
            <Summary
              label="Written comments received"
              value={initialLoading ? "..." : submittedComments.length}
            />
          </>
        ) : (
          <>
            <Summary
              label="Assigned student evaluations"
              value={initialLoading ? "..." : assignedTotal}
            />
            <Summary
              label="Completed"
              value={initialLoading ? "..." : completedTotal}
            />
            <Summary
              label="Pending"
              value={initialLoading ? "..." : pendingTotal}
            />
            <Summary
              label="Completion rate"
              value={
                initialLoading
                  ? "..."
                  : assignedTotal
                    ? `${((completedTotal / assignedTotal) * 100).toFixed(1)}%`
                    : "0%"
              }
            />
          </>
        )}
      </div>

      {mode === "progress" && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5">
            <h2 className="text-base font-bold">
              Completed and Pending Evaluations by Department
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Department totals are calculated from assignment targets and
              recorded completions using the selected report filters.
            </p>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Summary
              label="Total assigned evaluation tasks"
              value={
                initialLoading ? "..." : graphAssignedTotal.toLocaleString()
              }
            />
            <Summary
              label="Completed"
              value={
                initialLoading ? "..." : graphCompletedTotal.toLocaleString()
              }
            />
            <Summary
              label="Pending evaluation tasks"
              value={
                initialLoading ? "..." : graphPendingTotal.toLocaleString()
              }
            />
          </div>

          <div className="h-[360px] w-full">
            {initialLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Loading department progress...
              </div>
            ) : departmentProgressData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No assignment progress is available for the selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={departmentProgressData}
                  margin={{ top: 10, right: 20, left: 5, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#94a3b8"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="department"
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      Number(value ?? 0).toLocaleString(),
                      String(name),
                    ]}
                    labelFormatter={(label) => `Department: ${label}`}
                  />
                  <Legend />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3 text-right">Assigned</th>
                  <th className="px-3 py-3 text-right">Completed</th>
                  <th className="px-3 py-3 text-right">Pending</th>
                  <th className="px-3 py-3 text-right">Completion rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {departmentProgressData.map((item) => (
                  <tr key={item.departmentId}>
                    <td className="px-3 py-3 font-medium">
                      {item.department}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {item.target.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                      {item.completed.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-amber-600">
                      {item.pending.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {item.rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-bold dark:border-slate-700">
                <tr>
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right">
                    {graphAssignedTotal.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-600">
                    {graphCompletedTotal.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-amber-600">
                    {graphPendingTotal.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {graphAssignedTotal > 0
                      ? `${(
                          (graphCompletedTotal / graphAssignedTotal) *
                          100
                        ).toFixed(1)}%`
                      : "0.0%"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {mode === "responses" && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="text-base font-bold">
                  Top Performing Teachers
                </h2>
                <p className="text-xs text-slate-500">
                  Ranked across all completed student ratings and average scores.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Teacher</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Completed Ratings</th>
                  <th className="px-4 py-3 text-right">Average Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {initialLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Loading top teachers...
                    </td>
                  </tr>
                ) : topTeachersRanking.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No teacher rankings available for the selected filters.
                    </td>
                  </tr>
                ) : (
                  topTeachersRanking.slice(0, 10).map((row, index) => (
                    <tr key={row.teacherId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-semibold">
                        {index === 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <Star className="h-4 w-4 fill-amber-500" /> 1st
                          </span>
                        ) : index === 1 ? (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Star className="h-4 w-4 fill-slate-400" /> 2nd
                          </span>
                        ) : index === 2 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <Star className="h-4 w-4 fill-amber-700" /> 3rd
                          </span>
                        ) : (
                          `#${index + 1}`
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{row.teacher}</td>
                      <td className="px-4 py-3 text-slate-400">{row.department}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.totalEvaluations}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">
                        {row.averageScore.toFixed(2)} / 5.00
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}


      {mode === "responses" &&
        filteredPerformanceReports.length > 0 && (
          <AiAnalysisPreview
            reports={filteredPerformanceReports}
            evaluations={filteredEvaluations}
            teachers={teachers}
            subjects={subjects}
            periods={periods}
          />
        )}

      {mode === "responses" ? (
        <>
          {!initialLoading && partialReport && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              Partial report: {filteredSubmitted.length} submitted responses.
              Downloads include participation information when available.
              Submitted ratings may be preliminary; finalized ratings follow
              the system&apos;s report-finalization rules.
            </p>
          )}

          <AnonymousCommentsPreview
            rows={submittedComments}
            teachers={teachers}
            subjects={subjects}
            periods={periods}
            loading={initialLoading}
          />
          {!initialLoading && filteredSubmitted.length > filteredEvaluations.length && (
            <p className="mb-3 text-sm text-slate-500">
              Ratings appear after every assigned student has submitted for that teacher and subject.
            </p>
          )}
          <h2 className="mb-3 text-sm font-semibold">Finalized ratings</h2>
          <FinalizedRatingsTable
            key={JSON.stringify([filters, search])}
            ratings={finalizedRatings}
            teachers={teachers}
            subjects={subjects}
            periods={periods}
            departments={departments}
            loading={initialLoading}
          />
        </>
      ) : (
        <ProgressPreview
          rows={filteredProgress}
          teachers={teachers}
          subjects={subjects}
          programs={programs}
          periods={periods}
          loading={initialLoading}
        />
      )}
    </div>
  );
}


function AiAnalysisPreview({
  reports,
  evaluations,
  teachers,
  subjects,
  periods,
}: {
  reports: PerformanceReport[];
  evaluations: Evaluation[];
  teachers: Teacher[];
  subjects: Subject[];
  periods: EvaluationPeriod[];
}) {
  return (
    <section className="mb-5 border-y border-slate-200 py-5 dark:border-slate-800">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600" />
        <div>
          <h2 className="text-sm font-semibold">
            Generated performance analysis (Accurate Student Feedback Insights)
          </h2>
          <p className="text-xs text-slate-500">
            Strengths, weaknesses, and recommendations dynamically calculated from individual instructor scores and student comments.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {reports.slice(0, 12).map((report) => {
          const accurate = deriveAccurateAnalysis(report, evaluations);

          return (
            <article
              key={report.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">
                    {teachers.find((item) => item.id === report.teacherId)
                      ?.displayName ?? "Teacher"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {subjects.find((item) => item.id === report.subjectId)
                      ?.name ?? "Subject"}{" "}
                    /{" "}
                    {periods.find((item) => item.id === report.periodId)?.name ??
                      "Period"}
                  </p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-800">
                  {report.averageScore.toFixed(2)} / 5
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {report.summary}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <AnalysisList title="Strengths" items={accurate.strengths} />
                <AnalysisList
                  title="Weaknesses"
                  items={accurate.weaknesses}
                />
                <AnalysisList
                  title="Recommendations"
                  items={accurate.recommendations}
                />
              </div>

              {report.graphInsights.length > 0 && (
                <div className="mt-4">
                  <AnalysisList
                    title="Graph insights"
                    items={report.graphInsights}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AnalysisList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-slate-500">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
        {items.length === 0
          ? <li>None identified</li>
          : items.map((item) => (
              <li key={item}>- {item}</li>
            ))}
      </ul>
    </div>
  );
}

function AnonymousCommentsPreview({
  rows,
  teachers,
  subjects,
  periods,
  loading,
}: {
  rows: Evaluation[];
  teachers: Teacher[];
  subjects: Subject[];
  periods: EvaluationPeriod[];
  loading: boolean;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold">Anonymous comments</h2>
      <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3">Teacher</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading comments...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No written comments match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">
                    {teachers.find((item) => item.id === row.teacherId)
                      ?.displayName ?? "Teacher"}
                  </td>
                  <td className="px-4 py-3">
                    {subjects.find((item) => item.id === row.subjectId)?.name ??
                      "Subject"}
                  </td>
                  <td className="px-4 py-3">
                    {periods.find((item) => item.id === row.periodId)?.name ??
                      "Period"}
                  </td>
                  <td className="max-w-xl whitespace-pre-wrap break-words px-4 py-3">
                    {row.comment?.trim()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProgressPreview({
  rows,
  teachers,
  subjects,
  programs,
  periods,
  loading,
}: {
  rows: ProgressRow[];
  teachers: Teacher[];
  subjects: Subject[];
  programs: Program[];
  periods: EvaluationPeriod[];
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[1040px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Program / Class</th>
            <th className="px-4 py-3">Teacher</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Period</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                Loading progress...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                No student records match these filters.
              </td>
            </tr>
          ) : (
            rows.slice(0, 150).map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{row.studentName}</p>
                  <p className="text-xs text-slate-500">{row.studentEmail}</p>
                </td>
                <td className="px-4 py-3">
                  {programs.find((item) => item.id === row.programId)?.code ??
                    "—"}{" "}
                  · {row.yearLevel}/{row.section}
                </td>
                <td className="px-4 py-3">
                  {teachers.find((item) => item.id === row.teacherId)
                    ?.displayName ?? "Teacher"}
                </td>
                <td className="px-4 py-3">
                  {subjects.find((item) => item.id === row.subjectId)?.name ??
                    "Subject"}
                </td>
                <td className="px-4 py-3">
                  {periods.find((item) => item.id === row.periodId)?.name ??
                    "Period"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.submittedAt ? fmtDateTime(row.submittedAt) : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <FormField label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputCls}
      >
        {children}
      </select>
    </FormField>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
