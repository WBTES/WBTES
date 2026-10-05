export const MAX_EVALUATIONS_PER_SESSION = 5;

export function normalizeEvaluationQueue(currentAssignmentId: string, value: string | null) {
  const queue = [...new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean))]
    .slice(0, MAX_EVALUATIONS_PER_SESSION);
  return queue.includes(currentAssignmentId) ? queue : [currentAssignmentId];
}

export function evaluationQueueHref(queue: string[], currentAssignmentId = queue[0]) {
  if (!currentAssignmentId || !queue.includes(currentAssignmentId) || queue.length > MAX_EVALUATIONS_PER_SESSION) {
    throw new Error("Choose between 1 and 5 evaluations.");
  }
  return `/student/evaluate/${encodeURIComponent(currentAssignmentId)}?queue=${encodeURIComponent(queue.join(","))}`;
}

export function nextPendingEvaluation(queue: string[], currentAssignmentId: string, completedIds: ReadonlySet<string>) {
  const currentIndex = queue.indexOf(currentAssignmentId);
  const remaining = [...queue.slice(currentIndex + 1), ...queue.slice(0, Math.max(currentIndex, 0))];
  return remaining.find((id) => id !== currentAssignmentId && !completedIds.has(id)) ?? null;
}
