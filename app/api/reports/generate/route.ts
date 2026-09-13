import { NextResponse } from "next/server";
import { generatePerformanceReports } from "@/lib/server/period-status";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { periodId?: unknown };
    const periodId = asString(body.periodId, "Evaluation period", 200);
    const reports = await generatePerformanceReports(periodId);
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "performance_reports_generated",
      metadata: { periodId, reports },
    });
    return NextResponse.json({ reports });
  } catch (error) {
    return apiErrorResponse(error, "Performance report generation failed.");
  }
}
