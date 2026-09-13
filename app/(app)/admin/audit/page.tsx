"use client";

import * as React from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { DataTable, FormField, inputCls, PageHeader } from "@/components/data-table";
import { fmtDateTime } from "@/lib/utils-extras";
import { formatRoleLabel } from "@/lib/utils";

type ActivityLog = {
  id: string;
  userId: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export default function AdminAuditPage() {
  const [logs, setLogs] = React.useState<ActivityLog[]>([]);
  const [action, setAction] = React.useState("");
  const [role, setRole] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");

  React.useEffect(() => {
    if (!firebaseReady) return;
    (async () => {
      const snap = await getDocs(query(
        collection(db, "activityLogs"),
        orderBy("createdAt", "desc"),
        limit(1000)
      ));
      setLogs(snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ActivityLog, "id">) })));
    })();
  }, []);

  const actions = [...new Set(logs.map((log) => log.action))].sort();
  const filtered = logs.filter((log) => {
    if (action && log.action !== action) return false;
    if (role && log.userRole !== role) return false;
    if (fromDate && log.createdAt < new Date(`${fromDate}T00:00:00`).getTime()) return false;
    if (toDate && log.createdAt > new Date(`${toDate}T23:59:59.999`).getTime()) return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="Audit Logs" description="Server-recorded authentication and platform activity." />
      <section className="mb-5 grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
        <FormField label="Action">
          <select value={action} onChange={(event) => setAction(event.target.value)} className={inputCls}>
            <option value="">All actions</option>
            {actions.map((item) => <option key={item} value={item}>{friendlyAction(item)}</option>)}
          </select>
        </FormField>
        <FormField label="Role">
          <select value={role} onChange={(event) => setRole(event.target.value)} className={inputCls}>
            <option value="">All roles</option>
            <option value="admin">Administrator</option>
            <option value="hr">HR</option>
            <option value="department_head">Department Head</option>
            <option value="student">Student</option>
          </select>
        </FormField>
        <FormField label="From date">
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={inputCls} />
        </FormField>
        <FormField label="To date">
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={inputCls} />
        </FormField>
      </section>
      <DataTable
        rows={filtered}
        searchKeys={["userId", "userEmail", "action", "userRole", "ipAddress"]}
        columns={[
          { key: "createdAt", label: "Time", render: (row) => fmtDateTime((row as ActivityLog).createdAt) },
          {
            key: "userEmail",
            label: "User",
            render: (row) => (
              <div>
                <p className="font-medium">{(row as ActivityLog).userEmail || (row as ActivityLog).userId}</p>
                <p className="text-xs text-slate-500">{formatRoleLabel((row as ActivityLog).userRole || "unknown")}</p>
              </div>
            ),
          },
          { key: "action", label: "Action", render: (row) => friendlyAction((row as ActivityLog).action) },
          { key: "ipAddress", label: "IP address", render: (row) => (row as ActivityLog).ipAddress || "-" },
          {
            key: "metadata",
            label: "Details",
            render: (row) => {
              const details = formatMetadata((row as ActivityLog).metadata);
              return <span title={details} className="block max-w-sm truncate text-xs text-slate-500">{details}</span>;
            },
          },
        ]}
        empty="No audit logs yet"
      />
    </div>
  );
}

function friendlyAction(action: string) {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatMetadata(metadata?: Record<string, unknown>) {
  if (!metadata || Object.keys(metadata).length === 0) return "-";
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}
