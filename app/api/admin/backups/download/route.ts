import { exportLogicalBackup } from "@/lib/server/backups";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const backupId = asString(
      new URL(request.url).searchParams.get("id"),
      "Backup",
      200
    );
    const backup = await exportLogicalBackup(backupId);
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="WBTE-${backupId}.json"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Backup download failed.");
  }
}
