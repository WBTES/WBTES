export const FIRESTORE_QUOTA_MESSAGE =
  "The database usage quota has been reached. Ask an administrator to check Firestore usage, wait for the quota to reset, or enable billing. Repeated sign-in attempts will not reset it.";

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  // Admin SDK uses gRPC code 8; the browser SDK uses resource-exhausted.
  if (code === 8 || code === "8" || code === "RESOURCE_EXHAUSTED"
    || code === "resource-exhausted" || code === "firestore/resource-exhausted") return true;
  if (typeof code === "string" && code.startsWith("auth/")) return false;
  return typeof message === "string" && /resource[-_ ]exhausted/i.test(message);
}
