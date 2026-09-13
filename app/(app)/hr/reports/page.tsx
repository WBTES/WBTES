"use client";

import * as React from "react";
import {
  CircleAlert,
  FileText,
  Filter,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-context";
import { PageHeader, FormField, inputCls } from "@/components/data-table";
import { TeacherEvaluationReport } from "@/components/hr/teacher-evaluation-report";
import {
  exportTeacherEvaluationReportExcel,
  exportTeacherEvaluationReportPDF,
  type TeacherEvaluationReportData,
} from "@/lib/reports";
import { analyzeWeightedComments } from "@/lib/comment-analysis";
import { summarizePerformance } from "@/lib/analysis";
import { loadReleasedDepartmentResults } from "@/lib/firebase/department-results";
import type {
  Department,
  Evaluation,
  EvaluationPeriod,
  PerformanceReport,
  Program,
  Subject,
  Teacher,
} from "@/lib/types";
import toast from "react-hot-toast";

type ReportFilter = {
  teacherId: string;
  subjectId: string;
  periodId: string;
};

const emptyFilter: ReportFilter = {
  teacherId: "",
  subjectId: "",
  periodId: "",
};

export default function HrReportsPage() {
  const { profile } = useAuth();
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [generatedReports, setGeneratedReports] = React.useState<PerformanceReport[]>([]);
  const [filter, setFilter] = React.useState<ReportFilter>(emptyFilter);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [noDept, setNoDept] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!firebaseReady || !profile) return;
    if (profile.role !== "hr" && profile.role !== "admin") return;
    setLoading(true);
    setError("");
    setNoDept(false);
    try {
      const [departmentSnapshot, results, teacherSnapshot, subjectSnapshot, programSnapshot] = await Promise.all([
        getDocs(collection(db, "departments")),
        loadReleasedDepartmentResults(null, true),
        getDocs(collection(db, "teachers")),
        getDocs(collection(db, "subjects")),
        getDocs(collection(db, "programs")),
      ]);
      setDepartments(departmentSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Department, "id">),
      })));
      setEvaluations(results.evaluations);
      setPeriods(results.periods);
      setGeneratedReports(results.reports);
      setTeachers(teacherSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Teacher, "id">),
      })).sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setSubjects(subjectSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Subject, "id">),
      })).sort((a, b) => a.code.localeCompare(b.code)));
      setPrograms(programSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Program, "id">),
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Teacher evaluation reports could not be loaded.");
      setDepartments([]);
      setEvaluations([]);
      setPeriods([]);
      setGeneratedReports([]);
      setTeachers([]);
      setSubjects([]);
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const teacher = teachers.find((item) => item.id === filter.teacherId);
  const availableSubjects = React.useMemo(() => {
    if (!teacher?.subjectIds?.length) return subjects;
    return subjects.filter((subject) => teacher.subjectIds?.includes(subject.id));
  }, [subjects, teacher]);
  const selectedSubject = subjects.find((item) => item.id === filter.subjectId);
  const selectedPeriod = periods.find((item) => item.id === filter.periodId);
  const selectedDepartment = departments.find((item) => item.id === teacher?.departmentId);
  const selectionComplete = Boolean(teacher && selectedSubject && selectedPeriod);

  const filteredEvaluations = React.useMemo(() => {
    if (!selectionComplete) return [];
    return evaluations.filter((evaluation) =>
      evaluation.teacherId === filter.teacherId
      && evaluation.subjectId === filter.subjectId
      && evaluation.periodId === filter.periodId
    );
  }, [evaluations, filter.periodId, filter.subjectId, filter.teacherId, selectionComplete]);

  const generatedReport = generatedReports.find((report) =>
    report.teacherId === filter.teacherId
    && report.subjectId === filter.subjectId
    && report.periodId === filter.periodId
  );

  const reportData = React.useMemo<TeacherEvaluationReportData | null>(() => {
    if (!teacher || !selectedSubject || !selectedPeriod || filteredEvaluations.length === 0) {
      return null;
    }
    const performance = summarizePerformance(filteredEvaluations);
    const rawComments = filteredEvaluations
      .map((evaluation) => evaluation.comment?.trim() ?? "")
      .filter(Boolean);
    const weightedCommentAnalysis = generatedReport?.weightedCommentAnalysis
      ?? analyzeWeightedComments(rawComments);
    const fallbackProgramIds = filteredEvaluations
      .map((evaluation) => evaluation.programId)
      .filter((programId): programId is string => Boolean(programId));
    const programIds = unique(generatedReport?.programIds?.length
      ? generatedReport.programIds
      : fallbackProgramIds);
    const programLabels = programIds
      .map((programId) => programs.find((program) => program.id === programId))
      .filter((program): program is Program => Boolean(program))
      .map((program) => program.code);
    const yearLevels = unique(generatedReport?.yearLevels?.length
      ? generatedReport.yearLevels
      : filteredEvaluations.map((evaluation) => evaluation.yearLevel ?? "").filter(Boolean));
    const sections = unique(generatedReport?.sections ?? []);
    const improvementThemes = weightedCommentAnalysis.groups
      .find((group) => group.type === "improvement")
      ?.themes.slice(0, 4).map((theme) => `Address recurring feedback related to ${theme.name.toLowerCase()}`) ?? [];

    return {
      teacher: teacher.displayName,
      course: programLabels.length > 0 ? programLabels.join(", ") : "All assigned programs",
      subject: `${selectedSubject.code} - ${selectedSubject.name}`,
      department: selectedDepartment?.name ?? "Unassigned department",
      section: formatSectionScope(programLabels, yearLevels, sections),
      period: selectedPeriod.name,
      studentsEvaluated: filteredEvaluations.length,
      averageScore: generatedReport?.averageScore ?? performance.average,
      ratingLabel: generatedReport?.ratingLabel ?? performance.ratingLabel,
      categoryAverages: generatedReport?.categoryAverages ?? [],
      weightedCommentAnalysis,
      strengths: generatedReport?.strengths?.length
        ? generatedReport.strengths
        : performance.strengths,
      areasForDevelopment: generatedReport?.weaknesses?.length
        ? generatedReport.weaknesses
        : improvementThemes,
      recommendations: generatedReport?.recommendations?.length
        ? generatedReport.recommendations
        : performance.recommendations,
      analysisSource: generatedReport?.aiGenerated ? "Gemini AI" : "Built-in rules",
      evaluations: filteredEvaluations,
    };
  }, [filteredEvaluations, generatedReport, programs, selectedDepartment, selectedPeriod, selectedSubject, teacher]);

  const exportReport = (kind: "pdf" | "excel") => {
    if (!reportData) {
      toast.error("Select a teacher, subject, and evaluation period with released results.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "pdf") exportTeacherEvaluationReportPDF(reportData);
      else exportTeacherEvaluationReportExcel(reportData);
      toast.success(kind === "pdf" ? "PDF report downloaded" : "Excel report exported");
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Report export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Teacher Evaluation Reports"
        description="Build confidential reports from released anonymous results."
      />

      {error ? (
        <div className="flex flex-col gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center">
          <CircleAlert className="h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">{error}</p>
          <button type="button" onClick={load} className="btn-secondary shrink-0">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : noDept ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          You are not assigned to a department. Ask an administrator to set your department.
        </div>
      ) : loading ? (
        <ReportSkeleton />
      ) : periods.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white">No evaluation results have been released</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Reports, ratings, and anonymous comments become available after an administrator closes an evaluation period.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-brand-500" />
                <h2 className="text-sm font-semibold">Report scope</h2>
              </div>
              <button
                type="button"
                onClick={() => setFilter(emptyFilter)}
                disabled={!filter.teacherId && !filter.subjectId && !filter.periodId}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-white"
              >
                Clear filters
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <FormField label="Teacher">
                <select
                  value={filter.teacherId}
                  onChange={(event) => setFilter({
                    teacherId: event.target.value,
                    subjectId: "",
                    periodId: filter.periodId,
                  })}
                  className={inputCls}
                >
                  <option value="">Select teacher</option>
                  {teachers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                </select>
              </FormField>
              <FormField label="Subject">
                <select
                  value={filter.subjectId}
                  onChange={(event) => setFilter((current) => ({ ...current, subjectId: event.target.value }))}
                  disabled={!filter.teacherId}
                  className={inputCls}
                >
                  <option value="">Select subject</option>
                  {availableSubjects.map((item) => (
                    <option key={item.id} value={item.id}>{item.code} - {item.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Evaluation period">
                <select
                  value={filter.periodId}
                  onChange={(event) => setFilter((current) => ({ ...current, periodId: event.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select released period</option>
                  {periods
                    .slice()
                    .sort((a, b) => b.endDate - a.endDate)
                    .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </FormField>
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              Only closed-period school-wide results are available. Student identities are excluded.
            </div>
          </div>

          {!selectionComplete ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 px-5 text-center dark:border-slate-700">
              <FileText className="h-8 w-8 text-slate-400" />
              <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">Select the report scope</h2>
              <p className="mt-1 max-w-lg text-sm leading-6 text-slate-500">
                Choose one teacher, subject, and released evaluation period to build the full teacher evaluation report.
              </p>
            </div>
          ) : filteredEvaluations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
              No released evaluations match this teacher, subject, and period.
            </div>
          ) : reportData ? (
            <TeacherEvaluationReport
              report={reportData}
              busy={busy}
              onPdf={() => exportReport("pdf")}
              onExcel={() => exportReport("excel")}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function formatSectionScope(programs: string[], years: string[], sections: string[]) {
  if (programs.length === 1 && years.length === 1 && sections.length === 1) {
    return `${programs[0]} ${ordinalNumber(years[0])}${sections[0]}`;
  }
  const parts = [
    years.length > 0 ? `Year ${years.join(", ")}` : "",
    sections.length > 0 ? `Section ${sections.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "All assigned sections";
}

function ordinalNumber(value: string) {
  const match = value.match(/\d+/);
  return match?.[0] ?? value;
}

function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading teacher reports">
      <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-[32rem] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}
