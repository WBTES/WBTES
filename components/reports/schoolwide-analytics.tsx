"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { EvaluationAnalyticsCharts } from "./evaluation-analytics-charts";
import { authenticatedFetch, readApiResponse } from "@/lib/authenticated-fetch";
import { useAuth } from "@/lib/firebase/auth-context";
import { inputCls } from "@/components/data-table";
import type { AnalyticsData } from "@/lib/analytics";

type Response = { data: AnalyticsData; periods: Array<{ id: string; name: string }> };

export function SchoolwideAnalytics() {
  const { profile } = useAuth();
  const [result, setResult] = React.useState<Response | null>(null);
  const [periodId, setPeriodId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    if (!profile) return;
    let current = true;
    setLoading(true);
    setError("");
    const suffix = periodId ? `?periodId=${encodeURIComponent(periodId)}` : "";
    authenticatedFetch(`/api/analytics${suffix}`)
      .then((response) => readApiResponse<Response>(response))
      .then((data) => { if (current) setResult(data); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Analytics could not be loaded."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [periodId, refresh, profile]);

  return <section className="my-6 min-w-0 space-y-4" aria-label="School-wide analytics" aria-busy={loading}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h2 className="text-base font-semibold">School-wide analytics</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Live participation; ratings from completed assignments{profile?.role !== "admin" ? " in closed periods" : ""}{profile?.role === "department_head" ? " with at least 5 responses per result" : ""}.</p></div>
      <div className="flex items-center gap-2">
        <select aria-label="Analytics period" value={periodId} onChange={(event) => setPeriodId(event.target.value)} className={`${inputCls} sm:w-60`}>
          <option value="">All evaluation periods</option>
          {result?.periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
        </select>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className="btn-secondary shrink-0" aria-label="Refresh analytics" title="Refresh analytics"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
    </div>
    {loading && result && <p role="status" className="text-xs text-slate-500 dark:text-slate-400">Updating charts...</p>}
    {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : result ? <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Responses received" value={result.data.totalEvaluations} />
        <Summary label="Completed evaluation tasks" value={result.data.completionByDepartment.reduce((sum, item) => sum + item.completed, 0)} />
        <Summary label="Pending evaluation tasks" value={result.data.completionByDepartment.reduce((sum, item) => sum + item.pending, 0)} />
      </div>
      <EvaluationAnalyticsCharts data={result.data} />
    </> : <div className="h-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" aria-label="Loading analytics" />}
  </section>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></div>;
}
