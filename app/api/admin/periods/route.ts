import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

const DEPENDENCIES = [
  "teacherAssignments",
  "evaluations",
  "evaluationCompletions",
  "performanceReports",
] as const;

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const url = new URL(request.url);
    const periodId = asString(url.searchParams.get("id"), "Evaluation period", 200);
    const force = url.searchParams.get("force") === "true";
    const periodRef = adminDb.collection("evaluationPeriods").doc(periodId);
    const period = await periodRef.get();
    if (!period.exists) throw new ApiError(404, "Evaluation period was not found.");

    const snapshots = await Promise.all(DEPENDENCIES.map((collectionName) =>
      adminDb.collection(collectionName).where("periodId", "==", periodId).get()
    ));
    const counts = Object.fromEntries(DEPENDENCIES.map((name, index) => [
      name,
      snapshots[index].size,
    ]));
    const dependencyCount = snapshots.reduce((total, snapshot) => total + snapshot.size, 0);

    if (dependencyCount > 0 && !force) {
      throw new ApiError(
        409,
        "This period has assignments or evaluation history. Use permanent deletion only when that history must be erased."
      );
    }

    if (force) {
      const body = await request.json().catch(() => ({})) as { confirmation?: unknown };
      const confirmation = asString(body.confirmation, "Confirmation", 200);
      if (confirmation !== String(period.data()?.name ?? "")) {
        throw new ApiError(400, "The confirmation must exactly match the period name.");
      }
    }

    const writer = adminDb.bulkWriter();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((document) => writer.delete(document.ref));
    });
    await writer.close();
    await periodRef.delete();

    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: force ? "evaluation_period_force_deleted" : "evaluation_period_deleted",
      metadata: {
        periodId,
        periodName: period.data()?.name ?? "",
        deletedDependencies: JSON.stringify(counts),
      },
    });
    return NextResponse.json({ ok: true, deletedDependencies: counts });
  } catch (error) {
    return apiErrorResponse(error, "Evaluation period deletion failed.");
  }
}
