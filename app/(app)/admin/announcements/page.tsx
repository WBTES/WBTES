"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, MailCheck, Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase/client";
import { usePrograms } from "@/lib/use-programs";
import { FormField, inputCls, Modal, PageHeader } from "@/components/data-table";
import type { Announcement, AppUser, Department, UserRole } from "@/lib/types";
import { useAuth } from "@/lib/firebase/auth-context";
import { getAnnouncementStatus } from "@/lib/announcements";
import toast from "react-hot-toast";
import { fmtDateTime, fmtRelative } from "@/lib/utils-extras";
import { cn } from "@/lib/utils";
import { recordActivity } from "@/lib/authenticated-fetch";

type PublishChoice = "draft" | "published" | "scheduled";
type Priority = "normal" | "important" | "urgent";

const AUDIENCES: { value: "all" | UserRole; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "student", label: "Students" },
  { value: "hr", label: "HR" },
  { value: "department_head", label: "Department Head" },
  { value: "admin", label: "Administrators" },
];

const EMPTY_FORM = {
  title: "",
  body: "",
  audience: "all" as "all" | UserRole,
  priority: "normal" as Priority,
  publishChoice: "published" as PublishChoice,
  publishAt: "",
  expiresAt: "",
  pinned: false,
  departmentId: "",
  programId: "",
  yearLevel: "",
  section: "",
  actionLabel: "",
  actionLink: "",
  sendEmail: false,
};

function toDateTimeLocal(ms?: number | null) {
  if (!ms) return "";
  const date = new Date(ms);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].sort();
}

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const { programs } = usePrograms();
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [students, setStudents] = React.useState<AppUser[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Announcement | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);
  const [testingEmail, setTestingEmail] = React.useState(false);

  React.useEffect(() => {
    if (!firebaseReady) return;
    const unsubAnnouncements = onSnapshot(
      query(collection(db, "announcements"), orderBy("createdAt", "desc")),
      (snap) => setAnnouncements(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Announcement, "id">) })))
    );
    const unsubStudents = onSnapshot(
      query(collection(db, "users"), where("role", "==", "student")),
      (snap) => setStudents(snap.docs.map((item) => ({ uid: item.id, ...(item.data() as Omit<AppUser, "uid">) })))
    );
    const unsubDepartments = onSnapshot(collection(db, "departments"), (snap) =>
      setDepartments(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Department, "id">) })))
    );
    return () => {
      unsubAnnouncements();
      unsubStudents();
      unsubDepartments();
    };
  }, []);

  const yearLevels = React.useMemo(() => unique(students.map((student) => student.yearLevel)), [students]);
  const sections = React.useMemo(() => unique(students.map((student) => student.section)), [students]);

  const callAdminApi = async <T,>(path: string, body?: Record<string, unknown>) => {
    if (!user) throw new Error("Sign in again before using this action.");
    const token = await user.getIdToken();
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Server request failed.");
    return data;
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, publishAt: toDateTimeLocal(Date.now()) });
    setOpen(true);
  };

  const openEdit = (announcement: Announcement) => {
    const status = getAnnouncementStatus(announcement);
    const legacyCourse = announcement.target?.course?.trim().toLowerCase();
    const legacyProgram = legacyCourse
      ? programs.find((program) =>
          program.code.trim().toLowerCase() === legacyCourse
          || program.name.trim().toLowerCase() === legacyCourse
        )
      : undefined;
    setEditing(announcement);
    setForm({
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      priority: announcement.priority ?? "normal",
      publishChoice: status === "expired" ? "published" : status,
      publishAt: toDateTimeLocal(announcement.publishAt ?? announcement.createdAt),
      expiresAt: toDateTimeLocal(announcement.expiresAt),
      pinned: announcement.pinned,
      departmentId: announcement.target?.departmentId ?? "",
      programId: announcement.target?.programId ?? legacyProgram?.id ?? "",
      yearLevel: announcement.target?.yearLevel ?? "",
      section: announcement.target?.section ?? "",
      actionLabel: announcement.actionLabel ?? "",
      actionLink: announcement.actionLink ?? "",
      sendEmail: announcement.sendEmail ?? false,
    });
    setOpen(true);
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const now = Date.now();
    const publishAt = form.publishChoice === "draft" ? null : new Date(form.publishAt || now).getTime();
    const expiresAt = form.expiresAt ? new Date(form.expiresAt).getTime() : null;

    if (form.publishChoice === "scheduled" && (!publishAt || publishAt <= now)) {
      toast.error("Choose a future publishing time");
      return;
    }
    if (expiresAt && publishAt && expiresAt <= publishAt) {
      toast.error("Expiration must be after publishing");
      return;
    }
    if (form.actionLink && !form.actionLink.startsWith("/")) {
      toast.error("Action link must be an internal path beginning with /");
      return;
    }

    setLoading(true);
    try {
      const selectedProgram = programs.find((program) => program.id === form.programId);
      const hasStudentTarget = form.audience === "student" && Boolean(form.departmentId || form.programId || form.yearLevel || form.section);
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        priority: form.priority,
        status: form.publishChoice,
        publishAt,
        expiresAt,
        pinned: form.pinned,
        target: hasStudentTarget
          ? {
              departmentId: (selectedProgram?.departmentId ?? form.departmentId) || null,
              programId: selectedProgram?.id ?? null,
              course: selectedProgram?.code ?? null,
              yearLevel: form.yearLevel || null,
              section: form.section || null,
            }
          : null,
        actionLabel: form.actionLink ? form.actionLabel.trim() || "View details" : null,
        actionLink: form.actionLink.trim() || null,
        sendEmail: form.sendEmail,
        notifiedAt: form.publishChoice === "published" ? null : editing?.notifiedAt ?? null,
        emailSentAt: form.publishChoice === "published" && form.sendEmail
          ? null
          : editing?.emailSentAt ?? null,
        updatedAt: now,
      };

      let announcementId: string;
      if (editing) {
        await updateDoc(doc(db, "announcements", editing.id), payload);
        announcementId = editing.id;
      } else {
        const announcementRef = await addDoc(collection(db, "announcements"), {
          ...payload,
          createdBy: user?.uid ?? "system",
          createdAt: now,
        });
        announcementId = announcementRef.id;
      }

      if (form.publishChoice === "published") {
        try {
          const delivery = await callAdminApi<{ notified: number; emailed: number }>("/api/announcements/deliver", { announcementId });
          toast.success(
            form.sendEmail
              ? `Published: ${delivery.notified} notified, ${delivery.emailed} emailed`
              : `Published: ${delivery.notified} users notified`
          );
        } catch (deliveryError) {
          toast.error(`Announcement saved, but delivery failed: ${deliveryError instanceof Error ? deliveryError.message : "Unknown error"}`);
        }
      } else {
        toast.success(editing ? "Announcement updated" : "Announcement saved");
      }
      await recordActivity(
        editing ? "announcement_updated" : "announcement_created",
        {
          announcementId,
          audience: form.audience,
          status: form.publishChoice,
          emailRequested: form.sendEmail,
        }
      );
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const togglePin = async (announcement: Announcement) => {
    try {
      await updateDoc(doc(db, "announcements", announcement.id), { pinned: !announcement.pinned, updatedAt: Date.now() });
      await recordActivity("announcement_pin_changed", {
        announcementId: announcement.id,
        pinned: !announcement.pinned,
      });
      toast.success(announcement.pinned ? "Announcement unpinned" : "Announcement pinned");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Announcement could not be updated");
    }
  };

  const onDelete = async (announcement: Announcement) => {
    if (!confirm(`Delete ${announcement.title}?`)) return;
    try {
      await deleteDoc(doc(db, "announcements", announcement.id));
      await recordActivity("announcement_deleted", {
        announcementId: announcement.id,
      });
      toast.success("Announcement deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Announcement deletion failed");
    }
  };

  const sendTestEmail = async () => {
    setTestingEmail(true);
    try {
      const data = await callAdminApi<{ sentTo?: string }>("/api/email/test");
      toast.success(`Test email sent to ${data.sentTo ?? "your email"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Test email failed");
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Publish targeted notices and evaluation reminders."
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={sendTestEmail} disabled={testingEmail} className="btn-secondary">
              <MailCheck className="h-4 w-4" /> {testingEmail ? "Testing..." : "Test email"}
            </button>
            <button onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" /> New announcement
            </button>
          </div>
        }
      />

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No announcements yet
          </div>
        ) : (
          announcements.map((announcement) => {
            const status = getAnnouncementStatus(announcement);
            const target = announcement.target;
            const targetProgram = programs.find((program) => program.id === target?.programId);
            const targetSummary = target
              ? [
                  departments.find((department) => department.id === target.departmentId)?.name,
                  targetProgram?.code ?? target.course,
                  target.yearLevel,
                  target.section,
                ].filter(Boolean).join(" / ")
              : "";
            return (
              <article
                key={announcement.id}
                className={cn(
                  "rounded-2xl border bg-white p-5 dark:bg-slate-900",
                  announcement.pinned ? "border-brand-300 ring-1 ring-brand-200 dark:border-brand-500/30" : "border-slate-200 dark:border-slate-800"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{announcement.title}</h2>
                      {announcement.pinned && <Pin className="h-3.5 w-3.5 text-brand-500" />}
                      <StatusBadge status={status} />
                      <PriorityBadge priority={announcement.priority ?? "normal"} />
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {announcement.audience === "all" ? "everyone" : announcement.audience.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{announcement.body}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{fmtRelative(announcement.publishAt ?? announcement.createdAt)}</span>
                      {status === "scheduled" && announcement.publishAt && <span>Publishes {fmtDateTime(announcement.publishAt)}</span>}
                      {announcement.expiresAt && <span>Expires {fmtDateTime(announcement.expiresAt)}</span>}
                      {targetSummary && <span>Target: {targetSummary}</span>}
                    </div>
                    {announcement.actionLink && (
                      <Link href={announcement.actionLink} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
                        {announcement.actionLabel ?? "View details"} <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => togglePin(announcement)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={announcement.pinned ? "Unpin" : "Pin"}>
                      <Pin className="h-4 w-4" />
                    </button>
                    <button onClick={() => openEdit(announcement)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => onDelete(announcement)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit announcement" : "New announcement"} size="lg">
        <form onSubmit={onSave} className="space-y-4">
          <FormField label="Title">
            <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputCls} />
          </FormField>
          <FormField label="Message">
            <textarea required rows={4} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} className={inputCls} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Audience">
              <select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value as "all" | UserRole })} className={inputCls}>
                {AUDIENCES.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })} className={inputCls}>
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </FormField>
          </div>

          {form.audience === "student" && (
            <FormField label="Student targeting" hint="Leave every field set to All to reach every student.">
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={form.departmentId}
                  onChange={(event) => {
                    const departmentId = event.target.value;
                    const selectedProgram = programs.find((program) => program.id === form.programId);
                    setForm({
                      ...form,
                      departmentId,
                      programId: selectedProgram && departmentId && selectedProgram.departmentId !== departmentId ? "" : form.programId,
                    });
                  }}
                  className={inputCls}
                  aria-label="Department target"
                >
                  <option value="">All departments</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
                <select
                  value={form.programId}
                  onChange={(event) => {
                    const program = programs.find((item) => item.id === event.target.value);
                    setForm({
                      ...form,
                      programId: event.target.value,
                      departmentId: program?.departmentId ?? form.departmentId,
                    });
                  }}
                  className={inputCls}
                  aria-label="Program target"
                >
                  <option value="">All programs</option>
                  {programs
                    .filter((program) =>
                      (program.status === "active" || program.id === form.programId)
                      && (!form.departmentId || program.departmentId === form.departmentId)
                    )
                    .map((program) => <option key={program.id} value={program.id}>{program.code} - {program.name}</option>)}
                </select>
                <select value={form.yearLevel} onChange={(event) => setForm({ ...form, yearLevel: event.target.value })} className={inputCls} aria-label="Year level target">
                  <option value="">All year levels</option>
                  {yearLevels.map((yearLevel) => <option key={yearLevel} value={yearLevel}>{yearLevel}</option>)}
                </select>
                <select value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} className={inputCls} aria-label="Section target">
                  <option value="">All sections</option>
                  {sections.map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              </div>
            </FormField>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Publishing">
              <select value={form.publishChoice} onChange={(event) => setForm({ ...form, publishChoice: event.target.value as PublishChoice })} className={inputCls}>
                <option value="published">Publish now</option>
                <option value="scheduled">Schedule</option>
                <option value="draft">Save as draft</option>
              </select>
            </FormField>
            {form.publishChoice !== "draft" && (
              <FormField label={form.publishChoice === "scheduled" ? "Publish at" : "Published at"}>
                <input required type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} className={inputCls} />
              </FormField>
            )}
          </div>

          <FormField label="Expiration" hint="Optional. The announcement disappears automatically after this time.">
            <input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className={inputCls} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Action label">
              <input value={form.actionLabel} onChange={(event) => setForm({ ...form, actionLabel: event.target.value })} className={inputCls} placeholder="Start evaluation" />
            </FormField>
            <FormField label="Action link" hint="Internal path, such as /student/evaluations">
              <input value={form.actionLink} onChange={(event) => setForm({ ...form, actionLink: event.target.value })} className={inputCls} placeholder="/student/evaluations" />
            </FormField>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Pin to top
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.sendEmail} onChange={(event) => setForm({ ...form, sendEmail: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Send email when published
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {form.publishChoice === "scheduled" && <CalendarClock className="h-4 w-4" />}
              {loading ? "Saving..." : editing ? "Save changes" : form.publishChoice === "published" ? "Publish" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof getAnnouncementStatus> }) {
  const classes = {
    draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    scheduled: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    published: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    expired: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{status}</span>;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-xs font-medium",
      priority === "urgent"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
    )}>
      {priority}
    </span>
  );
}
