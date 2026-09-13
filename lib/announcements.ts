import type { Announcement, AppUser } from "@/lib/types";

export function getAnnouncementStatus(announcement: Announcement, now = Date.now()) {
  const stored = announcement.status ?? "published";
  if (stored === "draft") return "draft" as const;
  if (announcement.expiresAt && announcement.expiresAt <= now) return "expired" as const;
  if (stored === "scheduled" || (announcement.publishAt && announcement.publishAt > now)) {
    return "scheduled" as const;
  }
  return stored === "expired" ? "expired" as const : "published" as const;
}

export function isAnnouncementVisible(
  announcement: Announcement,
  profile: AppUser | null | undefined,
  now = Date.now()
) {
  if (!profile || getAnnouncementStatus(announcement, now) !== "published") return false;
  if (announcement.audience !== "all" && announcement.audience !== profile.role) return false;

  const target = announcement.target;
  if (!target || announcement.audience !== "student" || profile.role !== "student") return true;

  if (target.departmentId && target.departmentId !== profile.departmentId) return false;
  if (target.programId) {
    if (profile.programId && target.programId !== profile.programId) return false;
    if (!profile.programId && (!target.course || normalize(target.course) !== normalize(profile.course))) return false;
  } else if (target.course && normalize(target.course) !== normalize(profile.course)) {
    return false;
  }
  if (target.yearLevel && target.yearLevel !== profile.yearLevel) return false;
  if (target.section && target.section !== profile.section) return false;
  return true;
}

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function sortAnnouncements(a: Announcement, b: Announcement) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const priority = { urgent: 2, important: 1, normal: 0 } as const;
  const priorityDiff = priority[b.priority ?? "normal"] - priority[a.priority ?? "normal"];
  if (priorityDiff !== 0) return priorityDiff;
  return (b.publishAt ?? b.createdAt) - (a.publishAt ?? a.createdAt);
}
