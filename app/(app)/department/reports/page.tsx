"use client";

import * as React from "react";
import {
  CircleAlert,
  FileDown,
  FileSpreadsheet,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { loadReportQuestions } from "@/lib/firebase/report-questions";
import { PageHeader, FormField, inputCls } from "@/components/data-table";
import { exportToPDF, exportToExcel } from "@/lib/reports";
import { useAuth } from "@/lib/firebase/auth-context";
import type {
  Department,
  Evaluation,
  EvaluationPeriod,
  PerformanceReport,
  Program,
  Subject,
  Teacher,
} from "@/lib/types";
import { summarizePerformance } from "@/lib/analysis";
import { consolidateComments } from "@/lib/comment-analysis";
import { loadReleasedDepartmentResults } from "@/lib/firebase/department-results";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function DeptReportsPage() {
  const { profile } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [myDept, setMyDept] = React.useState<Department | null>(null);
  const [evaluations, setEvaluations] = React.useState<Evaluation[]>([]);
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [programs, setPrograms] = React.useState<Program[]>([]);
  const [periods, setPeriods] = React.useState<EvaluationPeriod[]>([]);
  const [generatedReports, setGeneratedReports] = React.useState<PerformanceReport[]>([]);
  const [filter, setFilter] = React.useState({
    teacherId: "",
    subjectId: "",
    programId: "",
    yearLevel: "",
    periodId: "",
    semester: "",
    academicYear: "",
  });

  const load = React.useCallback(async () => {
    if (!firebaseReady || !profile) return;
    setLoading(true);
    setError("");
    setMyDept(null);
    try {
      let dept: Department | null = null;
      const deptId = profile.departmentId;
      if (deptId) {
        const dDoc = await getDoc(doc(db, "departments", deptId));
        if (dDoc.exists()) dept = { id: dDoc.id, ...(dDoc.data() as Omit<Department, "id">) };
      } else if (profile.role === "admin") {
        const dSnap = await getDocs(collection(db, "departments"));
        if (!dSnap.empty) dept = { id: dSnap.docs[0].id, ...(dSnap.docs[0].data() as Omit<Department, "id">) };
      }
      setMyDept(dept);
      if (!dept) {
        setEvaluations([]);
        setTeachers([]);
        setSubjects([]);
        setPrograms([]);
        setPeriods([]);
        setGeneratedReports([]);
        return;
      }

      const [results, tSnap, sSnap, programSnap] = await Promise.all([
        loadReleasedDepartmentResults(dept.id, true),
        getDocs(query(collection(db, "teachers"), where("departmentId", "==", dept.id))),
        getDocs(query(collection(db, "subjects"), where("departmentId", "==", dept.id))),
        getDocs(query(collection(db, "programs"), where("departmentId", "==", dept.id))),
      ]);
      setEvaluations(results.evaluations);
      setTeachers(tSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Teacher, "id">) })));
      setSubjects(sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, "id">) })));
      setPrograms(programSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Program, "id">) })));
      setPeriods(results.periods);
      setGeneratedReports(results.reports);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Department reports could not be loaded.");
      setEvaluations([]);
      setTeachers([]);
      setSubjects([]);
      setPrograms([]);
      setPeriods([]);
      setGeneratedReports([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = evaluations.filter((evaluation) => {
    const period = periods.find((p) => p.id === evaluation.periodId);
    if (filter.teacherId && evaluation.teacherId !== filter.teacherId) return false;
    if (filter.subjectId && evaluation.subjectId !== filter.subjectId) return false;
    if (filter.programId && evaluation.programId !== filter.programId) return false;
    if (filter.yearLevel && evaluation.yearLevel !== filter.yearLevel) return false;
    if (filter.periodId && evaluation.periodId !== filter.periodId) return false;
    if (filter.semester && period?.semester !== filter.semester) return false;
    if (filter.academicYear && period?.academicYear !== filter.academicYear) return false;
    return true;
  });

  const summary = summarizePerformance(filtered);
  const matchingGeneratedReports = generatedReports.filter((report) => {
    if (filter.programId || filter.yearLevel) return false;
    const period = periods.find((p) => p.id === report.periodId);
    if (filter.teacherId && report.teacherId !== filter.teacherId) return false;
    if (filter.subjectId && report.subjectId !== filter.subjectId) return false;
    if (filter.periodId && report.periodId !== filter.periodId) return false;
    if (filter.semester && period?.semester !== filter.semester) return false;
    if (filter.academicYear && period?.academicYear !== filter.academicYear) return false;
    return true;
  });
  const selectedGeneratedReport = matchingGeneratedReports.length === 1 ? matchingGeneratedReports[0] : null;
  const analysis = selectedGeneratedReport
    ? {
      summary: selectedGeneratedReport.summary,
      strengths: selectedGeneratedReport.strengths?.length ? selectedGeneratedReport.strengths : summary.strengths,
      weaknesses: selectedGeneratedReport.weaknesses ?? [],
      recommendations: selectedGeneratedReport.recommendations?.length ? selectedGeneratedReport.recommendations : summary.recommendations,
      graphInsights: selectedGeneratedReport.graphInsights ?? [],
      commentAnalysis: selectedGeneratedReport.commentAnalysis,
      provider: selectedGeneratedReport.analysisProvider ?? "rules",
    }
    : {
      ...summary,
      weaknesses: [] as string[],
      graphInsights: [] as string[],
      commentAnalysis: undefined,
      provider: "rules" as const,
    };
  const academicYears = Array.from(new Set(periods.map((p) => p.academicYear))).filter(Boolean).sort();
  const consolidated = consolidateComments(
    filtered
      .map((evaluation) => evaluation.comment?.trim() ?? "")
      .filter(Boolean)
  );
  const comments = consolidated.uniqueComments.slice(0, 50);

  const teacherName = filter.teacherId
    ? teachers.find((teacher) => teacher.id === filter.teacherId)?.displayName ?? "Selected teacher"
    : "All department teachers";
  const subjectName = filter.subjectId
    ? subjects.find((subject) => subject.id === filter.subjectId)?.name ?? "Selected subject"
    : "All subjects";
  const periodLabel = [filter.semester || "All semesters", filter.academicYear || "All academic years"].join(" / ");

  const generate = async (kind: "pdf" | "excel") => {
    if (!myDept) {
      toast.error("You are not assigned as HR for a department");
      return;
    }
    if (filtered.length === 0) {
      toast.error("No data to export");
      return;
    }
    setBusy(true);
    try {
      const lookups = {
        questions: kind === "excel" ? await loadReportQuestions(filtered) : undefined,
        teachers: Object.fromEntries(teachers.map((item) => [item.id, item.displayName])),
        subjects: Object.fromEntries(subjects.map((item) => [item.id, item.name])),
        departments: { [myDept.id]: myDept.name },
        periods: Object.fromEntries(periods.map((item) => [item.id, item.name])),
        programs: Object.fromEntries(programs.map((item) => [item.id, item.code])),
      };
      if (kind === "pdf") {
        exportToPDF(filtered, {
          teacher: teacherName,
          department: myDept.name,
          period: `${subjectName} / ${periodLabel}`,
        }, lookups);
      } else {
        exportToExcel(filtered, {
          teacher: teacherName,
          department: myDept.name,
          period: `${subjectName} / ${periodLabel}`,
        }, lookups);
      }
      toast.success("Exported");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Department Reports" description="Filter, analyze, and download teacher performance reports." />

      {error ? (
        <div className="flex flex-col gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center">
          <CircleAlert className="h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">{error}</p>
          <button type="button" onClick={load} className="btn-secondary shrink-0">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : !myDept ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          You are not assigned to a department. Ask an administrator to assign your department.
        </div>
      ) : (
        <div className="space-y-5">
          {periods.length === 0 && (
            <div className="border-l-4 border-brand-500 bg-brand-50 p-4 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              Results, comments, analysis, and exports become available after an evaluation period closes.
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FormField label="Teacher">
                <select value={filter.teacherId} onChange={(e) => setFilter({ ...filter, teacherId: e.target.value })} className={inputCls}>
                  <option value="">All teachers</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
                </select>
              </FormField>
              <FormField label="Subject">
                <select value={filter.subjectId} onChange={(e) => setFilter({ ...filter, subjectId: e.target.value })} className={inputCls}>
                  <option value="">All subjects</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}
                </select>
              </FormField>
              <FormField label="Program">
                <select value={filter.programId} onChange={(e) => setFilter({ ...filter, programId: e.target.value })} className={inputCls}>
                  <option value="">All programs</option>
                  {programs
                    .filter((program) => program.departmentId === myDept?.id)
                    .map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
                </select>
              </FormField>
              <FormField label="Year level">
                <select value={filter.yearLevel} onChange={(e) => setFilter({ ...filter, yearLevel: e.target.value })} className={inputCls}>
                  <option value="">All year levels</option>
                  {["1st", "2nd", "3rd", "4th"].map((year) => <option key={year} value={year}>{year} year</option>)}
                </select>
              </FormField>
              <FormField label="Evaluation period">
                <select value={filter.periodId} onChange={(e) => setFilter({ ...filter, periodId: e.target.value })} className={inputCls}>
                  <option value="">All periods</option>
                  {periods
                    .slice()
                    .sort((a, b) => b.startDate - a.startDate)
                    .map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                </select>
              </FormField>
              <FormField label="Semester">
                <select value={filter.semester} onChange={(e) => setFilter({ ...filter, semester: e.target.value })} className={inputCls}>
                  <option value="">All semesters</option>
                  <option value="1st">1st Semester</option>
                  <option value="2nd">2nd Semester</option>
                  <option value="summer">Summer</option>
                </select>
              </FormField>
              <FormField label="Academic year">
                <select value={filter.academicYear} onChange={(e) => setFilter({ ...filter, academicYear: e.target.value })} className={inputCls}>
                  <option value="">All years</option>
                  {academicYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </FormField>
            </div>
            <p className="mt-4 text-xs text-slate-500">Department: <strong>{myDept?.name ?? "Not set"}</strong></p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-500">Average rating</p>
              <p className="mt-1 flex items-center gap-2 text-3xl font-bold">
                <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                {summary.total ? summary.average.toFixed(2) : "-"}
              </p>
              <p className="mt-1 text-xs text-slate-500">{summary.total} submitted evaluation{summary.total === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-500" />
                <h3 className="text-sm font-semibold">AI-assisted summary</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{analysis.summary}</p>
              <p className="mt-2 text-xs text-slate-500">
                Analysis source: {selectedGeneratedReport?.aiGenerated ? "Gemini AI" : "built-in rules"}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniList title="Strengths" items={analysis.strengths} />
                <MiniList
                  title="Areas to improve"
                  items={analysis.weaknesses.length > 0 ? analysis.weaknesses : ["No recurring weakness identified"]}
                />
                <MiniList title="Recommendations" items={analysis.recommendations} />
              </div>
              {analysis.graphInsights.length > 0 && (
                <div className="mt-4">
                  <MiniList title="Graph insights" items={analysis.graphInsights} />
                </div>
              )}
              {analysis.commentAnalysis && (
                <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {analysis.commentAnalysis.summary}
                </p>
              )}
            </div>
          </div>

          {matchingGeneratedReports.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold">Generated teacher-subject reports</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {matchingGeneratedReports.slice(0, 6).map((report) => {
                  const teacher = teachers.find((item) => item.id === report.teacherId)?.displayName ?? "Teacher";
                  const subject = subjects.find((item) => item.id === report.subjectId)?.name ?? "Subject";
                  return (
                    <div key={report.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{teacher}</p>
                          <p className="text-xs text-slate-500">{subject} / {periods.find((p) => p.id === report.periodId)?.name ?? "Period"}</p>
                        </div>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                          {report.aiGenerated ? "Gemini" : "Rules"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{report.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                          Average {report.averageScore.toFixed(2)}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                          {report.totalEvaluations} response{report.totalEvaluations === 1 ? "" : "s"}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                          Trend {report.trendChange && report.trendChange > 0 ? "+" : ""}{report.trendChange?.toFixed(2) ?? "0.00"}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        {report.categoryAverages.length > 0 && (
                          <div className="h-52">
                            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Criteria</p>
                            <ResponsiveContainer width="100%" height="90%">
                              <BarChart data={report.categoryAverages}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                                <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                                <Tooltip cursor={false} contentStyle={{ background: "rgb(15 23 42)", border: "none", borderRadius: 6, color: "white" }} />
                                <Bar dataKey="average" fill="#2563eb" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {report.trendHistory && report.trendHistory.length > 0 && (
                          <div className="h-52">
                            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Performance trend</p>
                            <ResponsiveContainer width="100%" height="90%">
                              <LineChart data={report.trendHistory}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                                <XAxis dataKey="periodName" tick={{ fontSize: 9 }} />
                                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                                <Tooltip cursor={false} contentStyle={{ background: "rgb(15 23 42)", border: "none", borderRadius: 6, color: "white" }} />
                                <Line type="monotone" dataKey="average" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <MiniList title="Strengths" items={report.strengths} />
                        <MiniList title="Weaknesses" items={report.weaknesses ?? []} />
                        <MiniList title="Recommendations" items={report.recommendations} />
                      </div>
                      {report.commentAnalysis && (
                        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <MessageSquareText className="h-4 w-4 text-brand-600" />
                            <p className="text-xs font-semibold uppercase text-slate-500">Comment analysis</p>
                          </div>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{report.commentAnalysis.summary}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {report.commentAnalysis.themes.slice(0, 6).map((theme) => (
                              <span key={theme.name} className="rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700">
                                {theme.name} ({theme.count})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Consolidated anonymous comments</h3>
                <span className="text-xs text-slate-500">
                  {consolidated.analysis.uniqueComments} unique
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {consolidated.analysis.summary}
              </p>
              {consolidated.analysis.themes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {consolidated.analysis.themes.slice(0, 8).map((theme) => (
                    <span key={theme.name} className="rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700">
                      {theme.name} ({theme.count})
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                {comments.length === 0 ? (
                  <p className="text-sm text-slate-500">No comments for this filter.</p>
                ) : (
                  comments.map((comment, index) => (
                    <div key={`${comment}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                      <p className="text-slate-700 dark:text-slate-300">{comment}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold">Export filtered report</h3>
              <div className="mt-3 flex flex-col gap-2">
                <button onClick={() => generate("pdf")} disabled={busy || loading} className="btn-primary"><FileDown className="h-4 w-4" /> PDF</button>
                <button onClick={() => generate("excel")} disabled={busy || loading} className="btn-secondary"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
        {items.length === 0
          ? <li>Nothing recurring was identified.</li>
          : items.map((item) => <li key={item}>- {item}</li>)}
      </ul>
    </div>
  );
}
