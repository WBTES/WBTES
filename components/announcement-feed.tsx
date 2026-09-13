"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Megaphone, Pin } from "lucide-react";
import {
  authenticatedFetch,
  readApiResponse,
} from "@/lib/authenticated-fetch";
import type { Announcement, AppUser } from "@/lib/types";
import { fmtRelative } from "@/lib/utils-extras";
import { cn } from "@/lib/utils";

export function useVisibleAnnouncements(profile: AppUser | null | undefined) {
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const refresh = React.useCallback(() => setReloadKey((value) => value + 1), []);

  React.useEffect(() => {
    if (!profile) return;
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const response = await authenticatedFetch("/api/announcements");
        const data = await readApiResponse<{ announcements: Announcement[] }>(
          response
        );
        if (active) {
          setAnnouncements(data.announcements);
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setAnnouncements([]);
          setError(loadError instanceof Error ? loadError.message : "Announcements could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profile, reloadKey]);

  return { announcements, loading, error, refresh };
}

export function AnnouncementFeed({ announcements, compact = false }: { announcements: Announcement[]; compact?: boolean }) {
  return (
    <div className="space-y-3">
      {announcements.map((announcement) => {
        const priority = announcement.priority ?? "normal";
        return (
          <article
            key={announcement.id}
            className={cn(
              "border bg-white dark:bg-slate-900",
              compact ? "rounded-xl p-4" : "rounded-2xl p-5",
              announcement.pinned
                ? "border-brand-300 ring-1 ring-brand-200 dark:border-brand-500/30"
                : priority === "urgent"
                  ? "border-rose-200 dark:border-rose-500/30"
                  : "border-slate-200 dark:border-slate-800"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white",
                priority === "urgent" ? "bg-rose-600" : priority === "important" ? "bg-amber-600" : "bg-slate-900 dark:bg-white dark:text-slate-900"
              )}>
                <Megaphone className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900 dark:text-white">{announcement.title}</h2>
                  {announcement.pinned && <Pin className="h-3.5 w-3.5 text-brand-500" />}
                  {priority !== "normal" && (
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      priority === "urgent"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    )}>
                      {priority}
                    </span>
                  )}
                </div>
                <p className={cn("mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-400", compact ? "line-clamp-2 text-sm" : "text-sm")}>
                  {announcement.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-xs text-slate-500">{fmtRelative(announcement.publishAt ?? announcement.createdAt)}</span>
                  {announcement.actionLink && (
                    <Link href={announcement.actionLink} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
                      {announcement.actionLabel ?? "View details"} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
