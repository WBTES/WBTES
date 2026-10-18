import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Evaluation, EvaluationQuestion } from "@/lib/types";
import type { EvaluationLookups } from "@/lib/reports";

export async function loadReportQuestions(evaluations: Evaluation[]) {
  const ids = [...new Set(evaluations.flatMap((evaluation) => Object.keys(evaluation.ratings)))];
  const questions: NonNullable<EvaluationLookups["questions"]> = {};
  // Only read questions used by this export, within Firestore's query operand limit.
  for (let index = 0; index < ids.length; index += 30) {
    const snapshot = await getDocs(query(
      collection(db, "evaluationQuestions"),
      where(documentId(), "in", ids.slice(index, index + 30))
    ));
    for (const document of snapshot.docs) {
      questions[document.id] = document.data() as Omit<EvaluationQuestion, "id">;
    }
  }
  return questions;
}
