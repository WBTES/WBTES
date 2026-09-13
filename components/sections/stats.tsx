"use client";

import { motion, useReducedMotion } from "framer-motion";

const facts = [
  { value: "4", label: "access roles", detail: "Student, administrator, department head, HR" },
  { value: "3", label: "question formats", detail: "Rating, choice, and open text" },
  { value: "2", label: "report formats", detail: "PDF and Excel" },
  { value: "1", label: "response allowed", detail: "For every student assignment" },
];

export function Stats() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-white py-20 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-24" aria-label="WBTE facts">
      <div className="container-tight">
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300"
        >
          Evaluation by the numbers
        </motion.p>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4 lg:gap-10">
          {facts.map((fact, index) => (
            <motion.div
              key={fact.label}
              initial={reduceMotion ? false : { opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.55, delay: index * 0.08 }}
            >
              <p className="font-display text-6xl font-medium leading-none text-slate-950 dark:text-white sm:text-7xl">
                {fact.value}
              </p>
              <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200">{fact.label}</p>
              <p className="mt-2 max-w-[14rem] text-xs leading-relaxed text-slate-500">
                {fact.detail}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
