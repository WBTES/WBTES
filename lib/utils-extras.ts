// Utility functions for analytics, hashing, formatting, etc.

import { format, formatDistanceToNow } from "date-fns";

export function fmtDate(ms: number, pattern = "MMM d, yyyy") {
  return format(new Date(ms), pattern);
}

export function fmtDateTime(ms: number) {
  return format(new Date(ms), "MMM d, yyyy 'at' h:mm a");
}

export function fmtRelative(ms: number) {
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

export function fmtScore(score: number) {
  return score.toFixed(2);
}

/**
 * Simple deterministic hash for de-duplicating anonymous submissions.
 * Not cryptographic — used to enforce "one evaluation per student per teacher per period".
 */
export async function submissionHash(parts: (string | number)[]) {
  const str = parts.join("|");
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the average score from a ratings object.
 * Only numeric values (1-5 ratings) are counted.
 */
export function computeAverage(ratings: Record<string, number | string>): number {
  const nums = Object.values(ratings).filter(
    (v) => typeof v === "number" && v >= 1 && v <= 5
  ) as number[];
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function pct(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
