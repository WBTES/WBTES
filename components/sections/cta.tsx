"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const nextSteps = [
  "Sign in to an existing workspace",
  "Create an active student account",
  "Continue the complete evaluation cycle",
];

export function CTASection() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="enter-wbtes"
      className="relative overflow-hidden bg-white py-24 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-28 lg:py-32"
    >
      <span
        className="pointer-events-none absolute -bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[11rem] text-slate-950/[0.025] dark:text-white/[0.025] sm:text-[16rem] lg:text-[22rem]"
        aria-hidden="true"
      >
        WBTE
      </span>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="container-tight relative text-center"
      >
        <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Enter WBTE</p>
        <h2 className="mx-auto mt-5 max-w-5xl font-display text-5xl font-medium leading-[0.94] tracking-normal sm:text-6xl lg:text-8xl">
          Make every evaluation cycle clearer.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
          Prepare the questions, reach the right students, monitor participation, and turn the
          completed responses into evidence your academic team can use.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {nextSteps.map((step) => (
            <span key={step} className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 dark:text-blue-300" />
              {step}
            </span>
          ))}
        </div>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="btn group bg-slate-950 px-7 py-3 text-base text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50"
          >
            Sign in
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/signup"
            className="btn bg-brand-600 px-7 py-3 text-base text-white hover:bg-brand-500"
          >
            Create account
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
