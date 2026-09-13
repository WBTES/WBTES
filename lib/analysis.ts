import type { Evaluation } from "@/lib/types";

export type PerformanceSummary = {
  total: number;
  average: number;
  ratingLabel: string;
  strengths: string[];
  recommendations: string[];
  summary: string;
};

export function summarizePerformance(evaluations: Evaluation[]): PerformanceSummary {
  const total = evaluations.length;
  const average = total
    ? evaluations.reduce((sum, evaluation) => sum + evaluation.averageScore, 0) / total
    : 0;

  const ratingLabel =
    average >= 4.5 ? "Excellent" :
    average >= 4 ? "Very good" :
    average >= 3 ? "Satisfactory" :
    average > 0 ? "Needs support" :
    "No data";

  const comments = evaluations
    .map((evaluation) => evaluation.comment?.trim())
    .filter(Boolean) as string[];

  const strengths = [
    average >= 4 ? "Consistently positive student ratings" : "Evaluation data is available for review",
    comments.length > 0 ? "Qualitative comments are available for context" : "Quantitative ratings can guide discussion",
  ];

  const recommendations = [
    average < 4 && total > 0
      ? "Review lower-rated criteria and plan targeted coaching or peer mentoring"
      : "Maintain current teaching practices and document effective strategies",
    comments.length > 0
      ? "Review anonymous comments for repeated themes"
      : "Encourage students to include constructive optional comments",
  ];

  const summary = total === 0
    ? "No submitted evaluations are available for this filter yet."
    : `${ratingLabel} performance with an average rating of ${average.toFixed(2)} across ${total} submitted evaluation${total === 1 ? "" : "s"}. ${recommendations[0]}.`;

  return {
    total,
    average,
    ratingLabel,
    strengths,
    recommendations,
    summary,
  };
}

export function groupEvaluationsByTeacherSubject(evaluations: Evaluation[]) {
  const grouped: Record<string, Evaluation[]> = {};
  for (const evaluation of evaluations) {
    const key = `${evaluation.teacherId}|${evaluation.subjectId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(evaluation);
  }
  return grouped;
}
