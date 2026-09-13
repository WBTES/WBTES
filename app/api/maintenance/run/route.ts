import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-response";
import { runMaintenance } from "@/lib/server/maintenance";
import {
  ApiError,
  requireAuthenticatedAppUser,
} from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.MAINTENANCE_SECRET?.trim() ?? "";
    const providedSecret = request.headers.get("x-maintenance-secret") ?? "";
    let actorUid = "external-cron";
    if (!configuredSecret || providedSecret !== configuredSecret) {
      const { decoded } = await requireAuthenticatedAppUser(request);
      actorUid = decoded.uid;
    }
    if (
      configuredSecret
      && providedSecret
      && providedSecret !== configuredSecret
    ) {
      throw new ApiError(401, "Maintenance secret is invalid.");
    }
    return NextResponse.json(await runMaintenance(actorUid));
  } catch (error) {
    return apiErrorResponse(error, "Maintenance run failed.");
  }
}
