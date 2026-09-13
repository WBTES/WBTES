"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  LockKeyhole,
} from "lucide-react";

const platformSignals = [
  { icon: ClipboardCheck, label: "Structured student feedback" },
  { icon: LockKeyhole, label: "Three focused access roles" },
  { icon: BarChart3, label: "Analysis and exportable reports" },
];

export function Hero() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [0, 72]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1.04, 1.11]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 34]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.72], [1, 0.18]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate min-h-[calc(100svh-8rem)] overflow-hidden bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
    >
      <motion.div
        className="absolute inset-x-0 -top-16 -bottom-16 -z-30"
        style={
          reduceMotion
            ? undefined
            : {
                y: imageY,
                scale: imageScale,
              }
        }
      >
        <Image
          src="/images/wbtes-classroom.png"
          alt="Students using laptops in a bright university classroom"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[64%_center] sm:object-center"
        />
      </motion.div>

      <div className="absolute inset-0 -z-20 bg-white/30 dark:bg-slate-950/60 sm:bg-white/20 sm:dark:bg-slate-950/48" aria-hidden="true" />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-white/70 via-white/20 to-white/95 dark:from-slate-950/72 dark:via-slate-950/15 dark:to-slate-950/94"
        aria-hidden="true"
      />

      <motion.div
        className="container-tight flex min-h-[calc(100svh-8rem)] flex-col justify-end pb-8 pt-28 sm:pb-10 sm:pt-32"
        style={
          reduceMotion
            ? undefined
            : {
                y: contentY,
                opacity: contentOpacity,
              }
        }
      >
        <div className="max-w-5xl">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="text-xs font-semibold uppercase text-brand-800 dark:text-blue-200"
          >
            Academic feedback platform
          </motion.p>

          <h1 className="mt-5 font-display text-5xl font-medium leading-[0.9] tracking-normal text-slate-950 dark:text-white sm:text-7xl lg:text-8xl xl:text-9xl">
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, y: 34 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="block"
            >
              Web-Based
            </motion.span>
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, y: 34 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="block"
            >
              Teacher{" "}
              <span className="block font-normal italic text-brand-800 dark:text-blue-200 sm:inline">Evaluation</span>
            </motion.span>
          </h1>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
          >
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase text-brand-800 dark:text-blue-200">(WBTE)</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200 sm:text-base">
                A connected workspace for evaluation setup, confidential student responses,
                completion monitoring, announcements, analysis, and academic reports.
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
              <Link
                href="/login"
                className="btn group min-w-0 bg-slate-950 px-3 py-3 text-sm text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50 sm:px-5 sm:text-base"
              >
                Sign in
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/signup"
                className="btn min-w-0 bg-brand-600 px-3 py-3 text-sm text-white hover:bg-brand-500 sm:px-5 sm:text-base"
              >
                Create account
              </Link>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.32 }}
          className="mt-8 flex items-end justify-between gap-6"
        >
          <div className="hidden flex-wrap items-center gap-x-6 gap-y-2 md:flex">
            {platformSignals.map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <Icon className="h-3.5 w-3.5 text-brand-700 dark:text-blue-300" />
                {label}
              </span>
            ))}
          </div>

          <a
            href="#about"
            aria-label="Continue to the WBTE overview"
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950/10 text-slate-950 backdrop-blur-sm transition-colors hover:bg-slate-950/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <ArrowDown className="h-4 w-4" />
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
