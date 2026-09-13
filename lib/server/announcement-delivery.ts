import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmails } from "@/lib/email/smtp";
import { ApiError } from "@/lib/server/require-admin";
import type { Announcement } from "@/lib/types";

export async function deliverAnnouncement(announcementId: string) {
  const reference = adminDb.collection("announcements").doc(announcementId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new ApiError(404, "Announcement was not found.");
  const announcement = {
    id: snapshot.id,
    ...snapshot.data(),
  } as Announcement;
  const now = Date.now();
  if (
    (announcement.status ?? "published") !== "published"
    || (announcement.publishAt && announcement.publishAt > now)
  ) {
    throw new ApiError(409, "Only a currently published announcement can be delivered.");
  }
  if (announcement.expiresAt && announcement.expiresAt <= now) {
    throw new ApiError(409, "This announcement has already expired.");
  }

  const usersSnapshot = announcement.audience === "all"
    ? await adminDb.collection("users").get()
    : await adminDb.collection("users").where("role", "==", announcement.audience).get();
  const recipients = usersSnapshot.docs.filter((user) => {
    const profile = user.data();
    if ((profile.status ?? "active") !== "active") return false;
    return announcement.audience !== "student"
      || matchesStudentTarget(profile, announcement);
  });

  let notified = 0;
  if (!announcement.notifiedAt) {
    for (let index = 0; index < recipients.length; index += 500) {
      const batch = adminDb.batch();
      recipients.slice(index, index + 500).forEach((user) => {
        const role = String(user.data().role ?? "");
        const defaultLink = role === "student"
          ? "/student/announcements"
          : role === "hr"
            ? "/hr/announcements"
            : role === "department_head"
              ? "/department-head/announcements"
            : "/admin/announcements";
        batch.set(
          adminDb.collection("notifications").doc(
            `announcement_${announcementId}_${user.id}`
          ),
          {
            userId: user.id,
            type: "announcement",
            title: announcement.title,
            body: announcement.body,
            read: false,
            createdAt: now,
            link: announcement.actionLink?.startsWith("/")
              ? announcement.actionLink
              : defaultLink,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
    notified = recipients.length;
  }

  let emailed = 0;
  let warning = "";
  let emailCompleted = false;
  if (announcement.sendEmail && !announcement.emailSentAt) {
    if (!isSmtpConfigured()) {
      warning = "SMTP is not configured, so announcement email was skipped.";
    } else {
      try {
        const emailAddresses = await collectEmailAddresses(
          announcement,
          recipients.map((user) => user.data())
        );
        emailed = (await sendSmtpEmails(emailAddresses.map((email) => ({
          to: email,
          subject: announcement.title,
          text: [
            announcement.body,
            announcement.actionLink?.startsWith("/")
              ? `${appUrl()}${announcement.actionLink}`
              : "",
          ].filter(Boolean).join("\n\n"),
        })))).sent;
        emailCompleted = true;
      } catch (error) {
        warning = error instanceof Error ? error.message : "Announcement email failed.";
      }
    }
  }

  const updates: Record<string, string | number> = { updatedAt: now };
  if (!announcement.notifiedAt) updates.notifiedAt = now;
  if (announcement.sendEmail && !announcement.emailSentAt && emailCompleted) {
    updates.emailSentAt = now;
  }
  await reference.update(updates);
  return { notified, emailed, warning: warning || undefined };
}

async function collectEmailAddresses(
  announcement: Announcement,
  userProfiles: Array<Record<string, unknown>>
) {
  const addresses = new Set(
    userProfiles
      .map((profile) => normalize(profile.email))
      .filter((email) => email.includes("@"))
  );
  if (announcement.audience === "student" || announcement.audience === "all") {
    const registrations = await adminDb.collection("studentRegistry").get();
    registrations.docs.forEach((registration) => {
      const student = registration.data();
      if ((student.status ?? "active") !== "active") return;
      if (
        announcement.audience === "student"
        && !matchesStudentTarget(student, announcement)
      ) {
        return;
      }
      const email = normalize(student.email);
      if (email.includes("@")) addresses.add(email);
    });
  }
  return [...addresses];
}

function matchesStudentTarget(
  profile: Record<string, unknown>,
  announcement: Announcement
) {
  const target = announcement.target;
  if (!target) return true;
  if (target.departmentId && target.departmentId !== profile.departmentId) return false;
  if (target.programId && target.programId !== profile.programId) return false;
  if (!target.programId && target.course && normalize(target.course) !== normalize(profile.course)) return false;
  if (target.yearLevel && target.yearLevel !== profile.yearLevel) return false;
  if (target.section && normalize(target.section) !== normalize(profile.section)) return false;
  return true;
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    || "http://localhost:3000";
}
