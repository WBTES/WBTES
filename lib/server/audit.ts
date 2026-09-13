import "server-only";

import { adminDb } from "@/lib/firebase/admin";

export async function writeAuditLog(input: {
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress?: string;
}) {
  await adminDb.collection("activityLogs").add({
    userId: input.userId,
    userEmail: input.userEmail ?? "",
    userRole: input.userRole ?? "",
    action: input.action.slice(0, 100),
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress ?? "",
    createdAt: Date.now(),
  });
}
