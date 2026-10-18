"use client";

import * as React from "react";
import { Activity, BarChart3, Download, FileSpreadsheet, MessageSquareText, Star, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PageHeader, inputCls } from "@/components/data-table";
import { SchoolwideAnalytics } from "@/components/reports/schoolwide-analytics";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";
import type { DepartmentHeadReport } from "@/lib/types";
import toast from "react-hot-toast";

const FEEDBACK_COLORS = ["#10b981", "#f59e0b", "#f43f5e"];
const GRID_COLOR = "rgba(148, 163, 184, 0.2)";
const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 };

export default function DepartmentHeadReportsPage() {
  const [report, setReport] = React.useState<DepartmentHeadReport | null>(null);
  const [periodId, setPeriodId] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async (selected = periodId) => {
    setLoading(true);
    try {
      const suffix = selected ? `?periodId=${encodeURIComponent(selected)}` : "";
      const response = await authenticatedFetch(`/api/department-head/reports${suffix}`);
      setReport(await readApiResponse<DepartmentHeadReport>(response));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  React.useEffect(() => { void load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePeriod = (value: string) => {
    setPeriodId(value);
    void load(value);
  };

  const exportExcel = async () => {
    if (!report) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.teachers.map((item) => ({
        Teacher: item.teacherName,
        Responses: item.responses,
        "Average rating": item.average ?? "Protected",
      }))), "Teachers");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.categories), "Categories");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.feedback), "Comment summary");
      XLSX.writeFile(workbook, `${report.departmentName}-department-report.xlsx`);
      toast.success("Excel report exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Excel export failed");
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF();
      pdf.setFontSize(18); pdf.text("WBTE Department Report", 14, 18);
      pdf.setFontSize(11); pdf.text(report.departmentName, 14, 27);
      pdf.text(`Responses: ${report.responseCount}`, 14, 37);
      pdf.text(`Average rating: ${report.averageRating?.toFixed(2) ?? "N/A"}`, 14, 44);
      pdf.text(`Privacy threshold: ${report.minimumResponses} responses`, 14, 51);
      let y = 63;
      pdf.setFontSize(13); pdf.text("Category ratings", 14, y); y += 8;
      pdf.setFontSize(10);
      report.categories.forEach((item) => { pdf.text(`${item.category}: ${item.average.toFixed(2)} (${item.count})`, 18, y); y += 7; });
      y += 4; pdf.setFontSize(13); pdf.text("Comment summary", 14, y); y += 8; pdf.setFontSize(10);
      report.feedback.forEach((item) => { pdf.text(`${item.label}: ${item.count} raw, ${item.weightedCount} weighted`, 18, y); y += 7; });
      pdf.save(`${report.departmentName}-department-report.pdf`);
      toast.success("PDF report downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF export failed");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="School-wide Reports" description="Review participation and released aggregate results without exposing student identities or raw comments." />
      <SchoolwideAnalytics />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select aria-label="Evaluation period" value={periodId} onChange={(event) => choosePeriod(event.target.value)} className={`${inputCls} sm:max-w-sm`}>
          <option value="">All closed periods</option>
          {report?.periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={exportPdf} disabled={!report || loading} className="btn-secondary"><Download className="h-4 w-4" /> PDF</button>
          <button type="button" onClick={exportExcel} disabled={!report || loading} className="btn-secondary"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
        </div>
      </div>
      {loading || !report ? <Loading /> : <ReportBody report={report} />}
    </div>
  );
}

function ReportBody({ report }: { report: DepartmentHeadReport }) {
  const reduceMotion = useReducedMotion();
  const hasFeedback = report.feedback.some((item) => item.count > 0);
  const panelMotion = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return <div className="space-y-6">
    <motion.div {...panelMotion} transition={{ duration: 0.35 }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Teachers" value={report.teacherCount} detail="School-wide faculty" icon={Users} tone="brand" />
      <Metric label="Closed periods" value={report.periods.length} detail="Available for reporting" icon={BarChart3} tone="brand" />
      <Metric label="Released responses" value={report.responseCount} detail="From closed periods" icon={BarChart3} tone="emerald" />
      <Metric label="Average rating" value={report.averageRating !== null && report.averageRating !== undefined ? report.averageRating.toFixed(2) : "N/A"} detail="Out of 5.00" icon={Star} tone="amber" />
      <Metric label="Analyzed comments" value={report.feedback.reduce((sum, item) => sum + item.count, 0)} detail="Anonymous responses" icon={MessageSquareText} tone="cyan" />
    </motion.div>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <ChartPanel title="Rating by category" description="Average score across evaluation categories" icon={BarChart3} motionProps={panelMotion} delay={0.1}>
        {report.categories.length ? <CategoryChart data={report.categories} reduceMotion={Boolean(reduceMotion)} /> : <Empty protectedResults={false} />}
      </ChartPanel>
      <ChartPanel title="Comment classification" description="Distribution of anonymous feedback" icon={MessageSquareText} motionProps={panelMotion} delay={0.15}>
        {hasFeedback ? <FeedbackChart data={report.feedback} reduceMotion={Boolean(reduceMotion)} /> : <Empty protectedResults={false} />}
      </ChartPanel>
    </div>
  </div>;
}

type MetricTone = "brand" | "emerald" | "amber" | "cyan";
const metricTone: Record<MetricTone, string> = {
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
};

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: React.ReactNode; detail: string; icon: React.ComponentType<{ className?: string }>; tone: MetricTone }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 truncate text-2xl font-bold text-slate-950 dark:text-white">{value}</p></div><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${metricTone[tone]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{detail}</p></div>;
}

function CategoryChart({ data, reduceMotion }: { data: DepartmentHeadReport["categories"]; reduceMotion: boolean }) {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={GRID_COLOR} /><XAxis type="number" domain={[0, 5]} tick={AXIS_TICK} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="category" width={112} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={shortLabel} /><Tooltip content={<ChartTooltip suffix=" / 5" />} cursor={{ fill: "rgba(148,163,184,0.08)" }} /><Bar dataKey="average" name="Average rating" fill="#3b78ff" radius={[0, 6, 6, 0]} maxBarSize={30} isAnimationActive={!reduceMotion} animationDuration={900} animationEasing="ease-out" /></BarChart></ResponsiveContainer>;
}

function FeedbackChart({ data, reduceMotion }: { data: DepartmentHeadReport["feedback"]; reduceMotion: boolean }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return <div className="relative h-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="count" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none" isAnimationActive={!reduceMotion} animationDuration={1000} animationEasing="ease-out">{data.map((item, index) => <Cell key={item.type} fill={FEEDBACK_COLORS[index % FEEDBACK_COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip suffix=" comments" />} /><Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 10 }} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-x-0 top-[42%] -translate-y-1/2 text-center"><strong className="block text-2xl text-slate-950 dark:text-white">{total}</strong><span className="text-[11px] text-slate-500">comments</span></div></div>;
}

function ChartPanel({ title, description, icon: Icon, children, motionProps, delay }: { title: string; description: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; motionProps: Record<string, unknown>; delay: number }) {
  return <motion.section {...motionProps} transition={{ duration: 0.4, delay }} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-start gap-2"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p></div></div><div className="h-[270px] min-w-0 sm:h-[300px]">{children}</div></motion.section>;
}

function ChartTooltip({ active, payload, label, suffix = "" }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: { label?: string } }>; label?: React.ReactNode; suffix?: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return <div className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-950"><p className="truncate font-semibold text-slate-900 dark:text-white">{label ?? item.payload?.label ?? item.name}</p><p className="mt-1 text-slate-600 dark:text-slate-300"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}: <strong>{item.value}{suffix}</strong></p></div>;
}

function shortLabel(value: string) { return value.length > 17 ? `${value.slice(0, 15)}...` : value; }
function Empty({ protectedResults = false }: { protectedResults?: boolean }) { return <div className="flex h-full flex-col items-center justify-center px-6 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Activity className="h-5 w-5" /></span><p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{protectedResults ? "Waiting for the privacy threshold" : "No released data yet"}</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{protectedResults ? "More completed responses are needed before this chart can be displayed." : "This chart will update when a closed evaluation period has reportable results."}</p></div>; }
function Loading() { return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" /></div>; }