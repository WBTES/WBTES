"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { AnnouncementFeed, useVisibleAnnouncements } from "@/components/announcement-feed";
import { PageHeader } from "@/components/data-table";
import { useAuth } from "@/lib/firebase/auth-context";

export default function DepartmentHeadAnnouncementsPage() {
  const { profile } = useAuth();
  const { announcements, loading, error, refresh } = useVisibleAnnouncements(profile);
  return (
    <div>
      <PageHeader title="Announcements" description="Current notices for department heads." />
      {error ? (
        <div className="flex items-center gap-3 border-l-4 border-rose-500 bg-rose-50 p-4 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
          <CircleAlert className="h-5 w-5" /><p className="flex-1 text-sm">{error}</p>
          <button type="button" onClick={refresh} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Retry</button>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" /></div>
      ) : announcements.length ? (
        <AnnouncementFeed announcements={announcements} />
      ) : (
        <div className="border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">No active announcements</div>
      )}
    </div>
  );
}
