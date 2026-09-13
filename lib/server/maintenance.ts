import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { createLogicalBackup } from "@/lib/server/backups";
import { deliverAnnouncement } from "@/lib/server/announcement-delivery";
import {
  generatePerformanceReports,
  setPeriodStatus,
} from "@/lib/server/period-status";
import { isSmtpConfigured, sendSmtpEmails } from "@/lib/email/smtp";
import type {
  Announcement,
  EvaluationCompletion,
  EvaluationPeriod,
  TeacherAssignment,
} from "@/lib/types";

const MINIMUM_INTERVAL = 4 * 60 * 1000;
const LOCK_DURATION = 3 * 60 * 1000;

export type MaintenanceResult = {
  skipped: boolean;
  periodsOpened: number;
  periodsClosed: number;
  reminders: number;
  announcementsPublished: number;
  announcementsExpired: number;
  responsesSanitized: number;
  backupCreated: boolean;
  warnings: string[];
};

export async function runMaintenance(
  actorUid: string
): Promise<MaintenanceResult> {
  const stateRef = adminDb.collection("systemState").doc("maintenance");
  const now = Date.now();
  const acquired = await adminDb.runTransaction(async (transaction) => {
    const state = await transaction.get(stateRef);
    const lastRunAt = Number(state.data()?.lastRunAt ?? 0);
    const lockUntil = Number(state.data()?.lockUntil ?? 0);
    if (lockUntil > now || now - lastRunAt < MINIMUM_INTERVAL) return false;
    transaction.set(stateRef, {
      lockUntil: now + LOCK_DURATION,
      startedAt: now,
      startedBy: actorUid,
    }, { merge: true });
    return true;
  });

  const result: MaintenanceResult = {
    skipped: !acquired,
    periodsOpened: 0,
    periodsClosed: 0,
    reminders: 0,
    announcementsPublished: 0,
    announcementsExpired: 0,
    responsesSanitized: 0,
    backupCreated: false,
    warnings: [],
  };
  if (!acquired) return result;

  try {
    try {
      result.responsesSanitized = await sanitizeAnonymousResponses();
    } catch (error) {
      result.warnings.push(
        `Anonymous-response migration failed: ${errorMessage(error)}`
      );
    }
    await maintainPeriods(actorUid, result);
    await maintainDeadlineReminders(result);
    await maintainAnnouncements(result);
    try {
      const backup = await createLogicalBackup("automatic-maintenance", true);
      result.backupCreated = backup.created;
    } catch (error) {
      result.warnings.push(`Automatic backup failed: ${errorMessage(error)}`);
    }
  } finally {
    await stateRef.set({
      lastRunAt: Date.now(),
      lockUntil: 0,
      lastResult: result,
    }, { merge: true });
  }
  return result;
}

async function sanitizeAnonymousResponses() {
  const migrationRef = adminDb
    .collection("systemState")
    .doc("anonymous-response-v1");
  const migration = await migrationRef.get();
  if (migration.data()?.completedAt) return 0;

  const snapshot = await adminDb.collection("evaluations").get();
  let sanitized = 0;
  for (let index = 0; index < snapshot.docs.length; index += 200) {
    const batch = adminDb.batch();
    snapshot.docs.slice(index, index + 200).forEach((document) => {
      const data = document.data();
      const hasSensitiveFields = [
        "studentId",
        "submissionHash",
        "assignmentId",
        "submittedAt",
        "section",
      ].some((field) => field in data);
      if (!hasSensitiveFields) return;

      if ("studentId" in data) {
        const anonymousData: Record<string, unknown> = {
          ...data,
          anonymous: true,
        };
        delete anonymousData.studentId;
        delete anonymousData.submissionHash;
        delete anonymousData.assignmentId;
        delete anonymousData.submittedAt;
        delete anonymousData.section;
        batch.set(adminDb.collection("evaluations").doc(), anonymousData);
        batch.delete(document.ref);
      } else {
        batch.update(document.ref, {
          studentId: FieldValue.delete(),
          submissionHash: FieldValue.delete(),
          assignmentId: FieldValue.delete(),
          submittedAt: FieldValue.delete(),
          section: FieldValue.delete(),
          anonymous: true,
        });
      }
      sanitized += 1;
    });
    await batch.commit();
  }
  await migrationRef.set({
    completedAt: Date.now(),
    documentsSanitized: sanitized,
  });
  return sanitized;
}

async function maintainPeriods(
  actorUid: string,
  result: MaintenanceResult
) {
  const snapshot = await adminDb.collection("evaluationPeriods").get();
  const now = Date.now();
  for (const document of snapshot.docs) {
    const period = {
      id: document.id,
      ...(document.data() as Omit<EvaluationPeriod, "id">),
    };
    try {
      if (
        period.status === "scheduled"
        && period.startDate <= now
        && period.endDate > now
      ) {
        const transition = await setPeriodStatus(period.id, "open", actorUid);
        if (transition.changed) result.periodsOpened += 1;
        result.warnings.push(...transition.warnings);
      } else if (period.status === "open" && period.endDate <= now) {
        const transition = await setPeriodStatus(period.id, "closed", actorUid);
        if (transition.changed) result.periodsClosed += 1;
        result.warnings.push(...transition.warnings);
      } else if (period.status === "scheduled" && period.endDate <= now) {
        await document.ref.update({ status: "closed", updatedAt: now });
        await generatePerformanceReports(period.id);
        result.periodsClosed += 1;
      }
    } catch (error) {
      result.warnings.push(
        `Period ${period.name} could not be synchronized: ${errorMessage(error)}`
      );
    }
  }
}

async function maintainDeadlineReminders(result: MaintenanceResult) {
  const now = Date.now();
  const reminderLimit = now + 24 * 60 * 60 * 1000;
  const periods = await adminDb
    .collection("evaluationPeriods")
    .where("status", "==", "open")
    .get();

  for (const periodDocument of periods.docs) {
    const period = {
      id: periodDocument.id,
      ...(periodDocument.data() as Omit<EvaluationPeriod, "id">),
    };
    if (period.endDate <= now || period.endDate > reminderLimit) continue;
    const [assignmentSnapshot, completionSnapshot] = await Promise.all([
      adminDb
        .collection("teacherAssignments")
        .where("periodId", "==", period.id)
        .get(),
      adminDb
        .collection("evaluationCompletions")
        .where("periodId", "==", period.id)
        .get(),
    ]);
    const assignments = assignmentSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<TeacherAssignment, "id">),
    }));
    const completed = new Set(
      completionSnapshot.docs.map((item) => {
        const completion = item.data() as EvaluationCompletion;
        return `${completion.studentId}_${completion.teacherId}`;
      })
    );
    const pendingByStudent = new Map<string, number>();
    assignments.forEach((assignment) => {
      assignment.studentIds.forEach((studentId) => {
        if (completed.has(`${studentId}_${assignment.teacherId}`)) return;
        pendingByStudent.set(
          studentId,
          (pendingByStudent.get(studentId) ?? 0) + 1
        );
      });
    });
    if (pendingByStudent.size === 0) continue;

    const references = [...pendingByStudent.keys()].map((studentId) =>
      adminDb.collection("users").doc(studentId)
    );
    const students = references.length > 0
      ? (await adminDb.getAll(...references)).filter((item) =>
          item.exists && (item.data()?.status ?? "active") === "active"
        )
      : [];
    const emailMessages: Array<{
      to: string;
      subject: string;
      text: string;
      deliveryId: string;
    }> = [];
    for (const student of students) {
      const deliveryId = `deadline_${period.id}_${student.id}`;
      const deliveryRef = adminDb
        .collection("maintenanceDeliveries")
        .doc(deliveryId);
      const delivery = await deliveryRef.get();
      if (!delivery.data()?.notificationAt) {
        const batch = adminDb.batch();
        batch.set(adminDb.collection("notifications").doc(deliveryId), {
          userId: student.id,
          type: "deadline",
          title: "Evaluation deadline approaching",
          body: `${pendingByStudent.get(student.id) ?? 0} evaluation${pendingByStudent.get(student.id) === 1 ? "" : "s"} remain for ${period.name}.`,
          read: false,
          createdAt: now,
          link: "/student/evaluations",
        }, { merge: true });
        batch.set(deliveryRef, { notificationAt: now }, { merge: true });
        await batch.commit();
        result.reminders += 1;
      }
      if (!delivery.data()?.emailAt) {
        emailMessages.push({
          to: String(student.data()?.email ?? ""),
          subject: "WBTE evaluation deadline reminder",
          text: [
            `Hello ${String(student.data()?.displayName ?? "Student")},`,
            "",
            `${pendingByStudent.get(student.id) ?? 0} teacher evaluation${pendingByStudent.get(student.id) === 1 ? " is" : "s are"} still pending.`,
            `Period: ${period.name}`,
            `Deadline: ${new Date(period.endDate).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
            "",
            "Open WBTE to complete your remaining evaluations.",
          ].join("\n"),
          deliveryId,
        });
      }
    }
    if (emailMessages.length > 0 && isSmtpConfigured()) {
      try {
        await sendSmtpEmails(emailMessages);
        const writer = adminDb.bulkWriter();
        emailMessages.forEach((message) => {
          writer.set(
            adminDb.collection("maintenanceDeliveries").doc(message.deliveryId),
            { emailAt: Date.now() },
            { merge: true }
          );
        });
        await writer.close();
      } catch (error) {
        result.warnings.push(
          `Deadline emails for ${period.name} failed: ${errorMessage(error)}`
        );
      }
    }
  }
}

async function maintainAnnouncements(result: MaintenanceResult) {
  const snapshot = await adminDb.collection("announcements").get();
  const now = Date.now();
  for (const document of snapshot.docs) {
    const announcement = {
      id: document.id,
      ...(document.data() as Omit<Announcement, "id">),
    };
    try {
      if (
        announcement.expiresAt
        && announcement.expiresAt <= now
        && announcement.status !== "expired"
      ) {
        await document.ref.update({ status: "expired", updatedAt: now });
        result.announcementsExpired += 1;
        continue;
      }
      if (
        announcement.status === "scheduled"
        && (!announcement.publishAt || announcement.publishAt <= now)
      ) {
        await document.ref.update({ status: "published", updatedAt: now });
        result.announcementsPublished += 1;
        const delivery = await deliverAnnouncement(announcement.id);
        if (delivery.warning) result.warnings.push(delivery.warning);
      } else if (
        announcement.status === "published"
        && (
          !announcement.notifiedAt
          || (announcement.sendEmail && !announcement.emailSentAt)
        )
      ) {
        const delivery = await deliverAnnouncement(announcement.id);
        if (delivery.warning) result.warnings.push(delivery.warning);
      }
    } catch (error) {
      result.warnings.push(
        `Announcement ${announcement.title} could not be synchronized: ${errorMessage(error)}`
      );
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
