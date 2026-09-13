"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, HelpCircle, Minus, Plus } from "lucide-react";
import { Section, SectionHeader } from "@/components/section";

const faqs = [
  {
    question: "Who uses WBTE?",
    answer:
      "WBTE has four access roles: students submit evaluations, administrators operate the workflow, department heads review privacy-protected school-wide summaries, and HR reviews detailed anonymous feedback across the school.",
  },
  {
    question: "When does a new question appear for students?",
    answer:
      "The question must be active and selected in the relevant evaluation period. The period must also be open, and the student must belong to a teacher assignment connected to that period.",
  },
  {
    question: "How is student feedback protected?",
    answer:
      "Reports present scores and comments without student names. Secured response records retain the student account identifier so WBTE can enforce one submission per assignment and apply access rules.",
  },
  {
    question: "How do announcements and email work?",
    answer:
      "Published announcements appear inside the targeted users' dashboards. When email delivery is enabled, WBTE also sends the announcement through the SMTP account configured on the server.",
  },
  {
    question: "What reports are available?",
    answer:
      "Administrators and HR can review detailed reports. Department heads receive aggregate completion, rating, and comment-theme reports with PDF and Excel export options.",
  },
  {
    question: "Can students evaluate from a phone?",
    answer:
      "Yes. The student evaluation list, 1-5 agreement controls, multiple-choice questions, text responses, and submission confirmation are designed for phone, tablet, and desktop screens.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <Section id="faq" className="bg-slate-50 py-24 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-28 lg:py-32">
      <div className="grid items-start gap-10 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-14">
        <div>
          <SectionHeader
            align="left"
            eyebrow="Common questions"
            title={<>Clear answers about the real workflow</>}
            description="These answers reflect how the current WBTE implementation behaves."
          />
          <div className="mt-8 rounded-lg bg-white p-5 shadow-sm dark:bg-slate-900/70 dark:shadow-none">
            <HelpCircle className="h-5 w-5 text-brand-700 dark:text-blue-300" />
            <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
              Need help configuring a period or assignment?
            </p>
            <Link
              href="/contact"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-600 dark:text-blue-300 dark:hover:text-blue-200"
            >
              Contact the project team <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const contentId = `faq-answer-${index}`;
            return (
              <div key={faq.question} className="rounded-lg bg-white px-5 shadow-sm dark:bg-slate-900/70 dark:shadow-none">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-slate-950 dark:text-white sm:text-base">
                    {faq.question}
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={contentId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-3xl pb-5 pr-12 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
