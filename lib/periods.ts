import type { EvaluationPeriod, PeriodStatus } from "@/lib/types";

export function effectivePeriodStatus(
  period: EvaluationPeriod,
  now = Date.now()
): PeriodStatus {
  if (period.status === "closed" || now >= period.endDate) return "closed";
  if (period.status === "draft") return "draft";
  if (now < period.startDate) return "scheduled";
  return "open";
}

export function remainingTimeLabel(endDate: number, now = Date.now()) {
  const remaining = endDate - now;
  if (remaining <= 0) return "Deadline passed";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"} remaining`;
  const minutes = Math.max(1, Math.floor(remaining / 60_000));
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
}
