import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  ApiError,
  requireAuthenticatedAppUser,
} from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { decoded, profile } = await requireAuthenticatedAppUser(request);
    const body = await request.json() as {
      action?: string;
      metadata?: Record<string, unknown>;
    };
    const action = body.action?.trim().slice(0, 100) || "activity";
    const metadata = sanitizeMetadata(body.metadata);
    await adminDb.collection("activityLogs").add({
      userId: decoded.uid,
      userEmail: profile.email,
      userRole: profile.role,
      action,
      metadata,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
      createdAt: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error
      ? error.message
      : "Activity log request failed.";
    return NextResponse.json({ error: message }, { status });
  }
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .filter(([, item]) =>
        typeof item === "string"
        || typeof item === "number"
        || typeof item === "boolean"
      )
      .map(([key, item]) => [
        key.slice(0, 100),
        typeof item === "string" ? item.slice(0, 500) : item,
      ])
  );
}
