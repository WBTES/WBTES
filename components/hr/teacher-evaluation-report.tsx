"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Lightbulb,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Star,
  TrendingUp,
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
import type { FeedbackType, WeightedFeedbackGroup } from "@/lib/types";
import type { TeacherEvaluationReportData } from "@/lib/reports";

const feedbackTone: Record<FeedbackType, {
  accent: string;
  badge: string;
  bar: string;
}> = {
  positive: {
    accent: "border-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  suggestion: {
    accent: "border-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  improvement: {
    accent: "border-rose-500",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
    bar: "bg-rose-500",
  },
};

export function TeacherEvaluationReport({
  report,
  busy,
  onPdf,
  onExcel,
}: {
  report: TeacherEvaluationReportData;
  busy: boolean;
  onPdf: () => void;
  onExcel: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const chartData = report.weightedCommentAnalysis.groups.map((group) => ({
    name: group.type === "improvement" ? "Improvement" : group.label,
    raw: group.rawCount,
    weighted: group.weightedCount,
  }));

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex flex-col gap-4 bg-slate-950 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between dark:bg-slate-950">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-brand-300">
            <ShieldCheck className="h-4 w-4" /> Confidential HR report
          </div>
          <h2 className="mt-2 text-xl font-bold">Teacher Evaluation Report</h2>
          <p className="mt-1 text-sm text-slate-400">Generated from released anonymous evaluation results.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onPdf} disabled={busy} className="btn-primary">
            <FileDown className="h-4 w-4" /> Download PDF
          </button>
          <button
            type="button"
            onClick={onExcel}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
        </div>
      </header>

      <div className="space-y-7 p-5 sm:p-6">
        <ReportSection title="Teacher information">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <Info label="Teacher" value={report.teacher} />
            <Info label="Course / Program" value={report.course} />
            <Info label="Subject" value={report.subject} />
            <Info label="Department" value={report.department} />
            <Info label="Section" value={report.section} />
            <Info label="Evaluation period" value={report.period} />
            <Info label="Students evaluated" value={report.studentsEvaluated.toLocaleString()} />
            <Info label="Analysis source" value={report.analysisSource} />
          </dl>
        </ReportSection>

        <ReportSection title="Overall evaluation">
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="flex min-h-40 flex-col items-center justify-center rounded-lg bg-slate-950 px-4 py-6 text-center text-white">
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
              <strong className="mt-3 text-4xl">{report.averageScore.toFixed(2)}</strong>
              <span className="mt-1 text-sm text-slate-400">out of 5.00</span>
              <span className="mt-3 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                {report.ratingLabel}
              </span>
            </div>
            <div className="space-y-3">
              {report.categoryAverages.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
                  Category ratings are not available for this generated report.
                </p>
              ) : report.categoryAverages.map((category) => (
                <div key={category.category}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{category.category}</span>
                    <strong>{category.average.toFixed(2)}</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <motion.div
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${Math.min((category.average / 5) * 100, 100)}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full bg-brand-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ReportSection>

        <ReportSection title="Student comment summary">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70">
                <tr>
                  <th className="px-4 py-3">Feedback type</th>
                  <th className="px-4 py-3 text-right">Raw comments</th>
                  <th className="px-4 py-3 text-right">Weighted count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.weightedCommentAnalysis.groups.map((group) => (
                  <tr key={group.type}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${feedbackTone[group.type].badge}`}>
                        {group.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{group.rawCount}</td>
                    <td className="px-4 py-3 text-right font-semibold">{group.weightedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Automatic tally groups similar feedback and applies the school weighting factor of {(report.weightedCommentAnalysis.weightingFactor * 100).toFixed(0)}%, rounded up.
          </p>
        </ReportSection>

        <ReportSection title="Comment performance summary">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  contentStyle={{ background: "rgb(15 23 42)", border: "1px solid rgb(51 65 85)", borderRadius: 8, color: "white" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="raw" name="Raw comments" fill="#3366ff" radius={[5, 5, 0, 0]} isAnimationActive={!reduceMotion} />
                <Bar dataKey="weighted" name="Weighted count" fill="#94a3b8" radius={[5, 5, 0, 0]} isAnimationActive={!reduceMotion} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ReportSection>

        <div className="grid gap-4 xl:grid-cols-3">
          {report.weightedCommentAnalysis.groups.map((group) => (
            <FeedbackSummary key={group.type} group={group} />
          ))}
        </div>

        <ReportSection title="HR recommendation">
          <div className="grid gap-5 lg:grid-cols-3">
            <RecommendationList icon={CheckCircle2} title="Strengths" items={report.strengths} tone="emerald" />
            <RecommendationList icon={TrendingUp} title="Areas for development" items={report.areasForDevelopment} tone="amber" />
            <RecommendationList icon={Lightbulb} title="Recommended action" items={report.recommendations} tone="brand" />
          </div>
        </ReportSection>

        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Confidentiality</h3>
            <p className="mt-1 text-xs leading-5 opacity-80">
              Student comments are anonymous. Detailed comments and analysis are accessible only to authorized HR personnel and other users specifically authorized by the school.
            </p>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <span className="h-4 w-1 rounded-full bg-brand-500" />
        <h3 className="text-sm font-bold uppercase text-slate-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value || "Not specified"}</dd>
    </div>
  );
}

function FeedbackSummary({ group }: { group: WeightedFeedbackGroup }) {
  const tone = feedbackTone[group.type];
  return (
    <section className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30 ${tone.accent}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold">{group.label}</h3>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${tone.badge}`}>{group.rawCount}</span>
      </div>
      <div className="mt-4 space-y-4">
        {group.themes.length === 0 ? (
          <p className="text-sm text-slate-500">No recurring themes identified.</p>
        ) : group.themes.slice(0, 5).map((theme, index) => (
          <div key={theme.name}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{index + 1}. {theme.name}</p>
              <span className="shrink-0 text-xs text-slate-500">{theme.rawCount} comment{theme.rawCount === 1 ? "" : "s"}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{themeDescription(group.type, theme.name)}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min((theme.rawCount / Math.max(group.rawCount, 1)) * 100, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-400">
        {group.summary}
      </p>
    </section>
  );
}

function RecommendationList({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
  tone: "emerald" | "amber" | "brand";
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
        {(items.length > 0 ? items : ["No recurring item was identified."]).map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function themeDescription(type: FeedbackType, theme: string) {
  const subject = theme.toLowerCase();
  if (type === "positive") return `Students frequently recognized ${subject} as a teaching strength.`;
  if (type === "suggestion") return `Students suggested additional attention or opportunities related to ${subject}.`;
  return `Students reported concerns related to ${subject}; HR review may be appropriate.`;
}
