"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";

export function AuthAside({
  eyebrow,
  title,
  description,
  points,
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
}) {
  const reduceMotion = useReducedMotion();

  return (
    <aside className="relative hidden min-h-[680px] overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900 lg:block">
      <span
        className="pointer-events-none absolute -bottom-10 -right-3 font-display text-[9rem] tracking-normal text-slate-950/[0.035] dark:text-white/[0.035]"
        aria-hidden="true"
      >
        WBTE
      </span>

      <FloatingEvaluationElements reduceMotion={Boolean(reduceMotion)} />

      <div className="relative z-10 flex h-full min-h-[680px] flex-col justify-between p-8 xl:p-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold text-slate-950 dark:text-white">WBTE</p>
            <p className="text-[10px] font-medium text-slate-400">Web-Based Teacher Evaluation</p>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md"
        >
          <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-200">{eyebrow}</p>
          <h2 className="mt-4 font-display text-5xl font-medium leading-[0.96] tracking-normal text-slate-950 dark:text-white xl:text-6xl">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
          <ul className="mt-7 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-blue-300" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.p
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="relative text-xs text-slate-500 dark:text-slate-400"
        >
          Secure access for the role assigned to your account.
        </motion.p>
      </div>
    </aside>
  );
}

function FloatingEvaluationElements({
  reduceMotion,
}: {
  reduceMotion: boolean;
}) {
  const float = (delay: number, distance: number) => ({
    animate: reduceMotion ? undefined : { y: [0, -distance, 0] },
    transition: {
      duration: 5.5,
      delay,
      repeat: Number.POSITIVE_INFINITY,
      ease: "easeInOut" as const,
    },
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        {...float(0, 10)}
        className="absolute -right-8 top-20 w-48 rounded-lg bg-white p-4 opacity-80 shadow-2xl shadow-slate-300/60 dark:bg-slate-950/80 dark:opacity-75 dark:shadow-black/25"
      >
        <div className="flex items-center gap-2 text-brand-700 dark:text-blue-300">
          <ClipboardCheck className="h-4 w-4" />
          <span className="h-2 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="mt-4 flex gap-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <span
              key={item}
              className={`h-6 w-6 rounded-full ${
                item === 3 ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-800"
              }`}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        {...float(1.1, 8)}
        className="absolute left-6 top-28 flex h-16 w-16 items-center justify-center rounded-lg bg-white opacity-80 shadow-2xl shadow-slate-300/60 dark:bg-slate-950/75 dark:opacity-65 dark:shadow-black/20"
      >
        <ShieldCheck className="h-7 w-7 text-emerald-700 dark:text-emerald-300" />
      </motion.div>

      <motion.div
        {...float(1.8, 12)}
        className="absolute right-4 bottom-8 w-36 rounded-lg bg-white p-3 opacity-80 shadow-2xl shadow-slate-300/60 dark:bg-slate-950/80 dark:opacity-65 dark:shadow-black/25"
      >
        <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-300">
          <BarChart3 className="h-4 w-4" />
          <span className="h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="mt-3 flex h-14 items-end gap-2">
          {["h-7", "h-11", "h-9", "h-14"].map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={`${height} flex-1 rounded-sm ${
                index === 3 ? "bg-cyan-500/70" : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
