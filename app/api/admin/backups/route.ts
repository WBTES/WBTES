import { NextResponse } from "next/server";
import {
  createLogicalBackup,
  deleteLogicalBackup,
  listLogicalBackups,
  restoreLogicalBackup,
} from "@/lib/server/backups";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json({ backups: await listLogicalBackups() });
  } catch (error) {
    return apiErrorResponse(error, "Backups could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const result = await createLogicalBackup(admin.uid, false);
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "backup_created",
      metadata: {
        backupId: result.id,
        documents: result.documentCount ?? 0,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Backup creation failed.");
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { backupId?: unknown };
    const backupId = asString(body.backupId, "Backup", 200);
    const safetyBackup = await createLogicalBackup(
      `${admin.uid}:before-restore`,
      false
    );
    const result = await restoreLogicalBackup(backupId, admin.uid);
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "backup_restored",
      metadata: {
        backupId,
        safetyBackupId: safetyBackup.id,
        restored: result.restored,
      },
    });
    return NextResponse.json({
      ...result,
      safetyBackupId: safetyBackup.id,
    });
  } catch (error) {
    return apiErrorResponse(error, "Backup restore failed.");
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const backupId = asString(
      new URL(request.url).searchParams.get("id"),
      "Backup",
      200
    );
    await deleteLogicalBackup(backupId);
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "backup_deleted",
      metadata: { backupId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Backup deletion failed.");
  }
}
