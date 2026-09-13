import type {
  EvaluationPeriod,
  EvaluationQuestion,
} from "@/lib/types";

export function questionAppliesToProgram(
  question: EvaluationQuestion,
  programId?: string | null
) {
  if (question.scopeType !== "programs") return true;
  return Boolean(
    programId
    && question.programIds?.includes(programId)
  );
}

export function getStudentEvaluationQuestions(
  questions: EvaluationQuestion[],
  period: EvaluationPeriod,
  programId?: string | null
) {
  const selectedQuestionIds = new Set(period.questionIds ?? []);
  const hasExplicitSelection = Array.isArray(period.questionIds);

  return questions
    .filter((question) =>
      question.active
      && (!hasExplicitSelection || selectedQuestionIds.has(question.id))
      && questionAppliesToProgram(question, programId)
    )
    .sort((a, b) => a.order - b.order);
}
