import "server-only";

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/require-admin";
import { FIRESTORE_QUOTA_MESSAGE, isFirestoreQuotaError } from "@/lib/firebase/firestore-error";

export function apiErrorResponse(error: unknown, fallback: string) {
  if (isFirestoreQuotaError(error)) {
    return NextResponse.json({
      error: FIRESTORE_QUOTA_MESSAGE,
      code: "firestore/resource-exhausted",
    }, { status: 503 });
  }
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

export function asString(value: unknown, field: string, maxLength = 500) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim().slice(0, maxLength);
}

export function optionalString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function asStringArray(value: unknown, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeEmail(value: unknown) {
  const email = asString(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.");
  }
  return email;
}

export function emailDocumentId(email: string) {
  return encodeURIComponent(email.toLowerCase());
}
