"use client";

import * as React from "react";
import {
  FileDown,
  FileSpreadsheet,
  RefreshCcw,
  Search,
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { FormField, inputCls, PageHeader } from "@/components/data-table";
import { SchoolwideAnalytics } from "@/components/reports/schoolwide-analytics";
import { GeneratedPerformanceAnalysis } from "@/components/reports/generated-performance-analysis";
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
import { buildReportParticipation, participationStatus } from "@/lib/report-participation";
import toast from "react-hot-toast";

type ManagedStudent = StudentRegistry & {
  accountCreated: boolean;
  emailVerified: boolean;
  lastLoginAt: number;
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

export default function AdminReportsPage() {
  const [mode, setMode] = React.useState<"responses" | "progress">("responses");
  const [submittedEvaluations, setSubmittedEvaluations] = React.useState<Evaluation[]>([]);
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [progress, setProgress] = React.useState<ProgressRow[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [performanceReports, setPerformanceReports] = React.useState<PerformanceReport[]>([]);
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
      const studentData = await readApiResponse<{ registrations: ManagedStudent[] }>(
        studentResponse
      );
      const evaluationRows = evaluationSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Evaluation, "id">),
      }));
      const completionRows = completionSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EvaluationCompletion, "id">),
      }));
      const assignmentRows = assignmentSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<TeacherAssignment, "id">),
      }));
      const teacherRows = teacherSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Teacher, "id">),
      }));
      const departmentRows = departmentSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Department, "id">),
      }));
      const programRows = programSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Program, "id">),
      }));
      const subjectRows = subjectSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Subject, "id">),
      }));
      const periodRows = periodSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<EvaluationPeriod, "id">),
      }));
      const performanceRows = performanceReportSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<PerformanceReport, "id">),
      }));

      const finalEvaluationRows = reportableEvaluations(
        evaluationRows,
        assignmentRows,
        completionRows
      ).filter((evaluation) => Number.isFinite(evaluation.averageScore) && evaluation.averageScore >= 1 && evaluation.averageScore <= 5);
      const finalReportKeys = new Set(finalEvaluationRows.map((evaluation) =>
        `${evaluation.periodId}_${evaluation.teacherId}_${evaluation.subjectId}`
      ));
      setSubmittedEvaluations(evaluationRows);
      setEvaluations(finalEvaluationRows);
      setTeachers(teacherRows);
      setDepartments(departmentRows);
      setPrograms(programRows);
      setSubjects(subjectRows);
      setPeriods(periodRows);
      setPerformanceReports(performanceRows.filter((report) =>
        finalReportKeys.has(`${report.periodId}_${report.teacherId}_${report.subjectId}`)
      ));
      setProgress(buildProgressRows(
        studentData.registrations,
        assignmentRows,
        completionRows
      ));
      setHasLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report data could not be loaded.");
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

  const matchesResponseFilters = React.useCallback((evaluation: Evaluation, ignoreSearch = false) => {
    const period = periods.find((item) => item.id === evaluation.periodId);
    if (filters.teacherId && evaluation.teacherId !== filters.teacherId) return false;
    if (filters.departmentId && evaluation.departmentId !== filters.departmentId) return false;
    if (filters.programId && evaluation.programId !== filters.programId) return false;
    if (filters.yearLevel && evaluation.yearLevel !== filters.yearLevel) return false;
    if (filters.periodId && evaluation.periodId !== filters.periodId) return false;
    if (filters.semester && period?.semester !== filters.semester) return false;
    if (filters.academicYear && period?.academicYear !== filters.academicYear) return false;
    if (filters.status === "pending") return false;
    if (ignoreSearch) return true;
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
  // Search narrows saved analyses, not the response-weighted teacher average.
  const analysisEvaluations = React.useMemo(
    () => evaluations.filter((evaluation) => matchesResponseFilters(evaluation, true)),
    [evaluations, matchesResponseFilters]
  );

  const reportParticipation = React.useMemo(() => {
    // Keep the full selected cohort in the denominator, even when the status filter is "completed".
    const cohort = progress.filter((row) => {
      const period = periods.find((item) => item.id === row.periodId);
      if (filters.teacherId && row.teacherId !== filters.teacherId) return false;
      if (filters.departmentId && row.departmentId !== filters.departmentId) return false;
      if (filters.programId && row.programId !== filters.programId) return false;
      if (filters.yearLevel && row.yearLevel !== filters.yearLevel) return false;
      if (filters.periodId && row.periodId !== filters.periodId) return false;
      if (filters.semester && period?.semester !== filters.semester) return false;
      if (filters.academicYear && period?.academicYear !== filters.academicYear) return false;
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return [
        teachers.find((item) => item.id === row.teacherId)?.displayName,
        subjects.find((item) => item.id === row.subjectId)?.name,
        departments.find((item) => item.id === row.departmentId)?.name,
        programs.find((item) => item.id === row.programId)?.code,
        row.yearLevel,
        period?.name,
      ].some((value) => value?.toLowerCase().includes(needle));
    });
    return buildReportParticipation(filteredSubmitted, cohort);
  }, [departments, filteredSubmitted, filters, periods, programs, progress, search, subjects, teachers]);
  const partialReport = filteredSubmitted.length > filteredEvaluations.length
    || reportParticipation.some((row) => participationStatus(row) === "Partial");

  const filteredProgress = React.useMemo(() => progress.filter((row) => {
    const period = periods.find((item) => item.id === row.periodId);
    if (filters.teacherId && row.teacherId !== filters.teacherId) return false;
    if (filters.departmentId && row.departmentId !== filters.departmentId) return false;
    if (filters.programId && row.programId !== filters.programId) return false;
    if (filters.yearLevel && row.yearLevel !== filters.yearLevel) return false;
    if (filters.periodId && row.periodId !== filters.periodId) return false;
    if (filters.semester && period?.semester !== filters.semester) return false;
    if (filters.academicYear && period?.academicYear !== filters.academicYear) return false;
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
  }), [
    departments,
    filters,
    periods,
    programs,
    progress,
    search,
    subjects,
    teachers,
  ]);

  const filteredPerformanceReports = React.useMemo(() => {
    if (filters.programId || filters.yearLevel || mode !== "responses") return [];
    const needle = search.trim().toLowerCase();
    return performanceReports.filter((report) => {
      const period = periods.find((item) => item.id === report.periodId);
      if (filters.teacherId && report.teacherId !== filters.teacherId) return false;
      if (filters.departmentId && report.departmentId !== filters.departmentId) return false;
      if (filters.periodId && report.periodId !== filters.periodId) return false;
      if (filters.semester && period?.semester !== filters.semester) return false;
      if (filters.academicYear && period?.academicYear !== filters.academicYear) return false;
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

  const exportReport = (kind: "pdf" | "excel") => {
    setBusy(true);
    try {
      if (mode === "responses") {
        if (filters.status === "pending") throw new Error("Pending students have no submitted responses. Choose all statuses for a partial evaluation report, or export the Student status view.");
        if (!filteredSubmitted.length && !reportParticipation.length) throw new Error("No evaluation records or assigned students match these filters.");
        const meta = reportMeta(filters, teachers, departments, periods);
        const lookups = {
          teachers: Object.fromEntries(teachers.map((item) => [item.id, item.displayName])),
          departments: Object.fromEntries(departments.map((item) => [item.id, item.name])),
          subjects: Object.fromEntries(subjects.map((item) => [item.id, item.name])),
          periods: Object.fromEntries(periods.map((item) => [item.id, item.name])),
          programs: Object.fromEntries(programs.map((item) => [item.id, item.code])),
        };
        const options = { participation: reportParticipation, partial: partialReport };
        if (kind === "pdf") exportToPDF(filteredSubmitted, meta, lookups, options);
        else exportToExcel(filteredSubmitted, meta, lookups, options);
      } else {
        if (filteredProgress.length === 0) throw new Error("No student progress rows match these filters.");
        const rows = filteredProgress.map((row) => ({
          Student: row.studentName,
          Email: row.studentEmail,
          Program: programs.find((item) => item.id === row.programId)?.code ?? "",
          YearLevel: row.yearLevel,
          Section: row.section,
          Teacher: teachers.find((item) => item.id === row.teacherId)?.displayName ?? "",
          Subject: subjects.find((item) => item.id === row.subjectId)?.name ?? "",
          Department: departments.find((item) => item.id === row.departmentId)?.name ?? "",
          Period: periods.find((item) => item.id === row.periodId)?.name ?? "",
          Status: row.status,
          Submitted: row.submittedAt ? fmtDateTime(row.submittedAt) : "",
        }));
        if (kind === "excel") {
          exportRowsToExcel(
            rows,
            "Student Progress",
            {
              Product: "WBTE",
              Generated: fmtDateTime(Date.now()),
              Records: rows.length,
              Completed: filteredProgress.filter((row) => row.status === "completed").length,
              Pending: filteredProgress.filter((row) => row.status === "pending").length,
            },
            `WBTE-Student-Progress-${Date.now()}.xlsx`
          );
        } else {
          exportRowsToPDF(
            rows,
            "WBTE Student Evaluation Progress",
            [
              `Records: ${rows.length}`,
              `Completed: ${filteredProgress.filter((row) => row.status === "completed").length}`,
              `Pending: ${filteredProgress.filter((row) => row.status === "pending").length}`,
            ],
            [
              { header: "Student", value: (row) => row.Student },
              { header: "Program", value: (row) => `${row.Program} ${row.YearLevel}/${row.Section}` },
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
      toast.success(mode === "responses" && partialReport ? "Partial report exported" : "Report exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
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
      toast.success(`${result.reports} AI performance report${result.reports === 1 ? "" : "s"} generated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const completed = filteredProgress.filter((row) => row.status === "completed").length;
  const pending = filteredProgress.length - completed;
  const average = filteredEvaluations.length
    ? filteredEvaluations.reduce((sum, evaluation) => sum + evaluation.averageScore, 0)
      / filteredEvaluations.length
    : 0;
  const submittedComments = filteredSubmitted.filter((item) => item.comment?.trim());
  const initialLoading = loading && !hasLoaded;
  const academicYears = Array.from(new Set(periods.map((period) => period.academicYear))).sort();

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Filter anonymous results or student completion records and export PDF or Excel."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading || busy} className="btn-secondary" title="Refresh reports">
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button type="button" onClick={regenerateAnalysis} disabled={busy} className="btn-secondary">
              <RefreshCcw className="h-4 w-4" /> Generate AI analysis
            </button>
            <button type="button" onClick={() => exportReport("pdf")} disabled={busy || loading} className="btn-primary">
              <FileDown className="h-4 w-4" /> PDF
            </button>
            <button type="button" onClick={() => exportReport("excel")} disabled={busy || loading} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
          </div>
        }
      />

      <SchoolwideAnalytics />

      <div className="mb-5 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button type="button" onClick={() => setMode("responses")} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === "responses" ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-500"}`}>Anonymous responses</button>
        <button type="button" onClick={() => setMode("progress")} className={`rounded-md px-4 py-2 text-sm font-semibold ${mode === "progress" ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-500"}`}>Student status</button>
      </div>

      <section className="border-y border-slate-200 py-5 dark:border-slate-800">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2 xl:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "progress" ? "Search student, teacher, subject, or period" : "Search teacher, subject, department, or period"} className={`${inputCls} pl-10`} />
          </div>
          <SelectFilter label="Teacher" value={filters.teacherId} onChange={(teacherId) => setFilters({ ...filters, teacherId })}>
            <option value="">All teachers</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
          </SelectFilter>
          <SelectFilter label="Department" value={filters.departmentId} onChange={(departmentId) => setFilters({ ...filters, departmentId })}>
            <option value="">All departments</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </SelectFilter>
          <SelectFilter label="Program" value={filters.programId} onChange={(programId) => setFilters({ ...filters, programId })}>
            <option value="">All Programs</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
          </SelectFilter>
          <SelectFilter label="Year level" value={filters.yearLevel} onChange={(yearLevel) => setFilters({ ...filters, yearLevel })}>
            <option value="">All year levels</option>
            {["1st", "2nd", "3rd", "4th"].map((year) => <option key={year} value={year}>{year} year</option>)}
          </SelectFilter>
          <SelectFilter label="Evaluation period" value={filters.periodId} onChange={(periodId) => setFilters({ ...filters, periodId })}>
            <option value="">All periods</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
          </SelectFilter>
          <SelectFilter label="Semester" value={filters.semester} onChange={(semester) => setFilters({ ...filters, semester })}>
            <option value="">All semesters</option>
            <option value="1st">1st Semester</option>
            <option value="2nd">2nd Semester</option>
            <option value="summer">Summer</option>
          </SelectFilter>
          <SelectFilter label="Academic year" value={filters.academicYear} onChange={(academicYear) => setFilters({ ...filters, academicYear })}>
            <option value="">All academic years</option>
            {academicYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </SelectFilter>
          <SelectFilter label="Evaluation status" value={filters.status} onChange={(status) => setFilters({ ...filters, status })}>
            <option value="">Completed and pending</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
          </SelectFilter>
        </div>
        <button type="button" onClick={() => { setFilters(emptyFilters); setSearch(""); }} className="mt-3 text-xs font-semibold text-brand-700 dark:text-brand-300">Clear filters</button>
      </section>

      <div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {mode === "responses" ? (
          <>
            <Summary label="Responses received" value={initialLoading ? "..." : filteredSubmitted.length} />
            <Summary label="Finalized responses" value={initialLoading ? "..." : filteredEvaluations.length} />
            <Summary label="Finalized average rating" value={initialLoading ? "..." : filteredEvaluations.length ? average.toFixed(2) : "—"} />
            <Summary label="Written comments received" value={initialLoading ? "..." : submittedComments.length} />
          </>
        ) : (
          <>
            <Summary label="Assigned student evaluations" value={initialLoading ? "..." : filteredProgress.length} />
            <Summary label="Completed" value={initialLoading ? "..." : completed} />
            <Summary label="Pending" value={initialLoading ? "..." : pending} />
          </>
        )}
      </div>

      {mode === "responses" && filteredPerformanceReports.length > 0 && (
        <GeneratedPerformanceAnalysis
          reports={filteredPerformanceReports}
          evaluations={analysisEvaluations}
          teachers={teachers}
          subjects={subjects}
          periods={periods}
        />
      )}

      {mode === "responses" ? (
        <>
          {!initialLoading && partialReport && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              Partial report: {filteredSubmitted.length} submitted responses. Downloads include the evaluated, assigned, and pending counts for each teacher and subject. Any exported ratings are preliminary; finalized charts remain protected.
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
          <ResponsePreview
            rows={filteredEvaluations}
            teachers={teachers}
            subjects={subjects}
            programs={programs}
            periods={periods}
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

function buildProgressRows(
  students: ManagedStudent[],
  assignments: TeacherAssignment[],
  completions: EvaluationCompletion[]
) {
  const studentMap = new Map(
    students.filter((student) => student.claimedUid)
      .map((student) => [student.claimedUid!, student])
  );
  const completionMap = new Map(completions.map((completion) => [
    `${completion.studentId}_${completion.assignmentId}`,
    completion,
  ]));
  const rows = new Map<string, ProgressRow>();
  assignments.forEach((assignment) => {
    assignment.studentIds.forEach((studentId) => {
      const student = studentMap.get(studentId);
      const id = `${studentId}_${assignment.id}`;
      if (rows.has(id)) return;
      const completion = completionMap.get(id);
      rows.set(id, {
        id,
        studentId,
        studentName: student?.displayName ?? "Student record unavailable",
        studentEmail: student?.email ?? "",
        programId: student?.programId ?? completion?.programId ?? assignment.programIds?.[0] ?? "",
        yearLevel: student?.yearLevel ?? completion?.yearLevel ?? assignment.yearLevels?.[0] ?? "",
        section: student?.section ?? completion?.section ?? assignment.sections?.[0] ?? "",
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
        departmentId: assignment.departmentId,
        periodId: assignment.periodId,
        status: completion ? "completed" : "pending",
        submittedAt: completion?.submittedAt ?? 0,
      });
    });
  });
  return [...rows.values()];
}

function ResponsePreview({
  rows,
  teachers,
  subjects,
  programs,
  periods,
  loading,
}: {
  rows: Evaluation[];
  teachers: Teacher[];
  subjects: Subject[];
  programs: Program[];
  periods: EvaluationPeriod[];
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
          <tr><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Program / Year</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Score</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading reports...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No finalized responses match these filters.</td></tr>
              : rows.slice(0, 100).map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{teachers.find((item) => item.id === row.teacherId)?.displayName ?? "Teacher"}</td>
                  <td className="px-4 py-3">{subjects.find((item) => item.id === row.subjectId)?.name ?? "Subject"}</td>
                  <td className="px-4 py-3">{programs.find((item) => item.id === row.programId)?.code ?? row.course ?? "—"} / {row.yearLevel || "—"}</td>
                  <td className="px-4 py-3">{periods.find((item) => item.id === row.periodId)?.name ?? "Period"}</td>
                  <td className="px-4 py-3 font-semibold">{row.averageScore.toFixed(2)}</td>
                </tr>
              ))}
        </tbody>
      </table>
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
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Loading comments...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No written comments match these filters.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium">{teachers.find((item) => item.id === row.teacherId)?.displayName ?? "Teacher"}</td>
                <td className="px-4 py-3">{subjects.find((item) => item.id === row.subjectId)?.name ?? "Subject"}</td>
                <td className="px-4 py-3">{periods.find((item) => item.id === row.periodId)?.name ?? "Period"}</td>
                <td className="max-w-xl whitespace-pre-wrap break-words px-4 py-3">{row.comment?.trim()}</td>
              </tr>
            ))}
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
          <tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Program / Class</th><th className="px-4 py-3">Teacher</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Submitted</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading progress...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No student records match these filters.</td></tr>
              : rows.slice(0, 150).map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3"><p className="font-medium">{row.studentName}</p><p className="text-xs text-slate-500">{row.studentEmail}</p></td>
                  <td className="px-4 py-3">{programs.find((item) => item.id === row.programId)?.code ?? "—"} · {row.yearLevel}/{row.section}</td>
                  <td className="px-4 py-3">{teachers.find((item) => item.id === row.teacherId)?.displayName ?? "Teacher"}</td>
                  <td className="px-4 py-3">{subjects.find((item) => item.id === row.subjectId)?.name ?? "Subject"}</td>
                  <td className="px-4 py-3">{periods.find((item) => item.id === row.periodId)?.name ?? "Period"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "completed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>{row.status}</span></td>
                  <td className="px-4 py-3">{row.submittedAt ? fmtDateTime(row.submittedAt) : "—"}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function reportMeta(
  filters: Filters,
  teachers: Teacher[],
  departments: Department[],
  periods: EvaluationPeriod[]
) {
  return {
    teacher: teachers.find((item) => item.id === filters.teacherId)?.displayName ?? "All teachers",
    department: departments.find((item) => item.id === filters.departmentId)?.name ?? "All departments",
    period: periods.find((item) => item.id === filters.periodId)?.name
      ?? [filters.semester || "All semesters", filters.academicYear || "All academic years"].join(" / "),
  };
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
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputCls}>
        {children}
      </select>
    </FormField>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
