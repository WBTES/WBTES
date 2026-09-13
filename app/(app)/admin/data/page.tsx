"use client";

import * as React from "react";
import {
  DatabaseBackup,
  Download,
  RefreshCcw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/data-table";
import {
  authenticatedFetch,
  readApiResponse,
} from "@/lib/authenticated-fetch";
import { requestAdminNavigationRefresh } from "@/lib/admin-navigation";
import type { BackupMetadata } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-extras";
import toast from "react-hot-toast";

export default function AdminDataPage() {
  const [backups, setBackups] = React.useState<BackupMetadata[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/admin/backups");
      const data = await readApiResponse<{ backups: BackupMetadata[] }>(response);
      setBackups(data.backups);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backups could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createBackup = async () => {
    setWorking("create");
    try {
      const response = await authenticatedFetch("/api/admin/backups", {
        method: "POST",
      });
      const result = await readApiResponse<{ documentCount?: number }>(response);
      toast.success(`Backup created with ${result.documentCount ?? 0} documents`);
      await load();
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup creation failed.");
    } finally {
      setWorking("");
    }
  };

  const restore = async (backup: BackupMetadata) => {
    if (!confirm(`Restore ${backup.id}? Existing documents with the same IDs will be replaced.`)) return;
    setWorking(backup.id);
    try {
      const response = await authenticatedFetch("/api/admin/backups", {
        method: "PATCH",
        body: JSON.stringify({ backupId: backup.id }),
      });
      const result = await readApiResponse<{ restored: number }>(response);
      toast.success(`${result.restored} documents restored`);
      await load();
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setWorking("");
    }
  };

  const download = async (backup: BackupMetadata) => {
    setWorking(backup.id);
    try {
      const response = await authenticatedFetch(
        `/api/admin/backups/download?id=${encodeURIComponent(backup.id)}`
      );
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Download failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `WBTE-${backup.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setWorking("");
    }
  };

  const remove = async (backup: BackupMetadata) => {
    if (!confirm(`Delete backup ${backup.id}?`)) return;
    setWorking(backup.id);
    try {
      const response = await authenticatedFetch(
        `/api/admin/backups?id=${encodeURIComponent(backup.id)}`,
        { method: "DELETE" }
      );
      await readApiResponse(response);
      toast.success("Backup deleted");
      await load();
      requestAdminNavigationRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup deletion failed.");
    } finally {
      setWorking("");
    }
  };

  return (
    <div>
      <PageHeader
        title="Backup and Recovery"
        description="Daily automatic snapshots and administrator recovery controls."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="btn-secondary" title="Refresh backups">
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button type="button" onClick={createBackup} disabled={Boolean(working)} className="btn-primary">
              <DatabaseBackup className="h-4 w-4" />
              {working === "create" ? "Creating..." : "Create backup"}
            </button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800/60">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading backups...</td></tr>
            ) : backups.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No backups yet.</td></tr>
            ) : backups.map((backup) => (
              <tr key={backup.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{fmtDateTime(backup.createdAt)}</p>
                  <p className="text-xs text-slate-500">{backup.id}</p>
                </td>
                <td className="px-4 py-3">{backup.automatic ? "Automatic" : "Manual"}</td>
                <td className="px-4 py-3">{backup.documentCount}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${backup.status === "ready" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : backup.status === "failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>
                    {backup.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Action label="Download" onClick={() => download(backup)} disabled={backup.status !== "ready" || Boolean(working)}><Download className="h-4 w-4" /></Action>
                    <Action label="Restore" onClick={() => restore(backup)} disabled={backup.status !== "ready" || Boolean(working)}><RotateCcw className="h-4 w-4" /></Action>
                    <Action label="Delete" onClick={() => remove(backup)} disabled={Boolean(working)} danger><Trash2 className="h-4 w-4" /></Action>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Action({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-2 disabled:opacity-40 ${danger ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" : "text-slate-500 hover:bg-slate-100 hover:text-brand-700 dark:hover:bg-slate-800"}`}
    >
      {children}
    </button>
  );
}
