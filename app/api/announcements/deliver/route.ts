import { NextResponse } from "next/server";
import { deliverAnnouncement } from "@/lib/server/announcement-delivery";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json() as { announcementId?: unknown };
    const announcementId = asString(
      body.announcementId,
      "Announcement ID",
      200
    );
    return NextResponse.json({
      ok: true,
      ...await deliverAnnouncement(announcementId),
    });
  } catch (error) {
    return apiErrorResponse(error, "Announcement delivery failed.");
  }
}
