import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse } from "@/lib/server/api-response";
import { requireAdmin } from "@/lib/server/require-admin";
import type {
  AdminNavigationStatus,
  BackupMetadata,
  EvaluationCompletion,
  EvaluationPeriod,
  TeacherAssignment,
} from "@/lib/types";

export const runtime = "nodejs";

const BACKUP_STALE_AFTER = 36 * 60 * 60 * 1000;
const BACKUP_STUCK_AFTER = 15 * 60 * 1000;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const now = Date.now();
    const [pendingSnapshot, periodSnapshot, backupSnapshot] = await Promise.all([
      adminDb
        .collection("studentRegistry")
        .where("status", "==", "pending")
        .count()
        .get(),
      adminDb.collection("evaluationPeriods").get(),
      adminDb
        .collection("systemBackups")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get(),
    ]);

    const periods = periodSnapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<EvaluationPeriod, "id">),
    }));
    const overduePeriodIds = periods
      .filter((period) => period.status === "open" && period.endDate <= now)
      .map((period) => period.id);
    const scheduleActions = periods.filter((period) =>
      (period.status === "scheduled" && period.startDate <= now)
      || (period.status === "open" && period.endDate <= now)
    ).length;
    const latestBackup = backupSnapshot.empty
      ? null
      : {
          id: backupSnapshot.docs[0].id,
          ...(backupSnapshot.docs[0].data() as Omit<BackupMetadata, "id">),
        };
    const backupIssue = getBackupIssue(latestBackup, now);

    const status: AdminNavigationStatus = {
      pendingStudents: pendingSnapshot.data().count,
      overdueEvaluations: await countOverdueEvaluations(overduePeriodIds),
      scheduleActions,
      backupWarning: backupIssue !== null,
      backupIssue,
      updatedAt: now,
    };

    return NextResponse.json(status, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "Admin action status could not be loaded.");
  }
}

async function countOverdueEvaluations(periodIds: string[]) {
  if (periodIds.length === 0) return 0;

  const snapshots = await Promise.all(periodIds.map(async (periodId) => {
    const [assignments, completions] = await Promise.all([
      adminDb
        .collection("teacherAssignments")
        .where("periodId", "==", periodId)
        .get(),
      adminDb
        .collection("evaluationCompletions")
        .where("periodId", "==", periodId)
        .get(),
    ]);
    return { assignments, completions };
  }));
  const pending = new Set<string>();

  snapshots.forEach(({ assignments }) => {
    assignments.docs.forEach((document) => {
      const assignment = document.data() as TeacherAssignment;
      assignment.studentIds?.forEach((studentId) => {
        pending.add(
          `${studentId}_${document.id}`
        );
      });
    });
  });
  snapshots.forEach(({ completions }) => {
    completions.docs.forEach((document) => {
      const completion = document.data() as EvaluationCompletion;
      pending.delete(
        `${completion.studentId}_${completion.assignmentId}`
      );
    });
  });

  return pending.size;
}

function getBackupIssue(
  backup: BackupMetadata | null,
  now: number
): AdminNavigationStatus["backupIssue"] {
  if (!backup) return "missing";
  if (backup.status === "failed") return "failed";
  if (
    backup.status === "creating"
    && backup.createdAt <= now - BACKUP_STUCK_AFTER
  ) {
    return "stuck";
  }
  if (
    backup.status === "ready"
    && backup.createdAt <= now - BACKUP_STALE_AFTER
  ) {
    return "stale";
  }
  return null;
}
