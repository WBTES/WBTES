import "server-only";

import { ApiError } from "@/lib/server/require-admin";

export function assertAllowedSchoolEmail(email: string) {
  const configuredDomains = (process.env.SCHOOL_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  if (configuredDomains.length === 0) return;

  const domain = email.split("@")[1] ?? "";
  if (!configuredDomains.includes(domain)) {
    throw new ApiError(403, "Use an allowed school email address.");
  }
}
