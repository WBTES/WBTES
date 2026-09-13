"use client";

import { AnnouncementFeed, useVisibleAnnouncements } from "@/components/announcement-feed";
import { PageHeader } from "@/components/data-table";
import { useAuth } from "@/lib/firebase/auth-context";

export default function StudentAnnouncementsPage() {
  const { profile } = useAuth();
  const { announcements, loading } = useVisibleAnnouncements(profile);

  return (
    <div>
      <PageHeader title="Announcements" description="Current notices for your class and evaluation activities." />
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No active announcements
        </div>
      ) : (
        <AnnouncementFeed announcements={announcements} />
      )}
    </div>
  );
}
