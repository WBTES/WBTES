import { NextResponse } from "next/server";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";
import { setPeriodStatus } from "@/lib/server/period-status";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as {
      periodId?: string;
      status?: string;
      endDate?: unknown;
    };
    const periodId = body.periodId?.trim() ?? "";
    const status = body.status?.trim() ?? "";
    if (!periodId) throw new ApiError(400, "Evaluation period ID is required.");
    if (status !== "open" && status !== "closed") {
      throw new ApiError(400, "Status must be open or closed.");
    }

    if (body.endDate !== undefined && (typeof body.endDate !== "number" || !Number.isFinite(body.endDate))) {
      throw new ApiError(400, "Closing time must be a valid timestamp.");
    }
    const result = await setPeriodStatus(periodId, status, admin.uid, {
      endDate: body.endDate as number | undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error
      ? error.message
      : "Evaluation period status update failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
