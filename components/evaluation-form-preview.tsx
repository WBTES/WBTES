import type { EvaluationQuestion } from "@/lib/types";

export function EvaluationFormPreview({
  questions,
}: {
  questions: EvaluationQuestion[];
}) {
  if (questions.length === 0) {
    return (
      <div className="border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        This form has no questions.
      </div>
    );
  }

  return (
    <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
      {questions.map((question, index) => (
        <section
          key={question.id}
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
        >
          <p className="text-sm font-semibold">
            {index + 1}. {question.text}
            {question.required && <span className="ml-1 text-rose-500">*</span>}
          </p>
          {question.category && (
            <p className="mt-1 text-xs text-slate-500">{question.category}</p>
          )}

          {question.type === "rating" && (
            <div className="mt-4">
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <div
                    key={rating}
                    className="flex h-10 items-center justify-center rounded-md border border-slate-300 text-sm font-semibold dark:border-slate-700"
                  >
                    {rating}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between gap-3 text-xs text-slate-500">
                <span>{question.scaleMinLabel || "Strongly disagree"}</span>
                <span className="text-right">{question.scaleMaxLabel || "Strongly agree"}</span>
              </div>
            </div>
          )}

          {question.type === "multiple_choice" && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {question.options?.map((option) => (
                <div key={option.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  {option.label}
                </div>
              ))}
            </div>
          )}

          {question.type === "text" && (
            <div className="mt-4 h-20 rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
          )}
        </section>
      ))}
    </div>
  );
}
