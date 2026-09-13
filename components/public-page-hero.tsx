"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowDown,
  BarChart3,
  ClipboardCheck,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const floatingElements = [
  {
    icon: ClipboardCheck,
    className: "right-[9%] top-[18%] h-20 w-20 text-brand-700 dark:text-blue-300",
    delay: 0,
  },
  {
    icon: BarChart3,
    className: "right-[25%] top-[34%] h-14 w-14 text-cyan-700 dark:text-cyan-300",
    delay: 0.8,
  },
  {
    icon: ShieldCheck,
    className: "right-[5%] top-[49%] h-16 w-16 text-emerald-700 dark:text-emerald-300",
    delay: 1.5,
  },
  {
    icon: MessageSquareText,
    className: "left-[7%] top-[27%] h-12 w-12 text-amber-700 dark:text-amber-300",
    delay: 2,
  },
];

export function PublicPageHero({
  eyebrow,
  title,
  statement,
  description,
  nextHref,
  children,
}: {
  eyebrow: string;
  title: string;
  statement: string;
  description: string;
  nextHref: string;
  children?: React.ReactNode;
}) {
  const sectionRef = React.useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 28]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate min-h-[calc(100svh-8rem)] overflow-hidden bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
    >
      <span
        className="pointer-events-none absolute left-1/2 top-[12%] -z-20 -translate-x-1/2 whitespace-nowrap font-display text-[9rem] tracking-normal text-slate-950/[0.025] dark:text-white/[0.025] sm:text-[15rem] lg:text-[22rem]"
        aria-hidden="true"
      >
        WBTE
      </span>

      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        {floatingElements.map(({ icon: Icon, className, delay }) => (
          <motion.span
            key={className}
            animate={
              reduceMotion
                ? undefined
                : {
                    y: [0, -12, 0],
                    rotate: [0, 2, 0],
                  }
            }
            transition={{
              duration: 6,
              delay,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
            className={cn(
              "absolute hidden items-center justify-center rounded-lg bg-slate-100 shadow-2xl shadow-slate-300/40 dark:bg-slate-900/80 dark:shadow-black/20 sm:flex",
              className
            )}
          >
            <Icon className="h-1/2 w-1/2" />
          </motion.span>
        ))}
      </div>

      <motion.div
        className="container-tight flex min-h-[calc(100svh-8rem)] flex-col justify-end pb-9 pt-28 sm:pb-11 sm:pt-32"
        style={reduceMotion ? undefined : { y: contentY }}
      >
        <div className="max-w-5xl">
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-200"
          >
            {eyebrow}
          </motion.p>

          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-5xl break-words font-display text-5xl font-medium leading-[0.92] tracking-normal text-slate-950 dark:text-white sm:text-7xl lg:text-8xl xl:text-9xl"
          >
            {title}
          </motion.h1>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.15 }}
            className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)] md:items-end md:gap-10"
          >
            <p className="max-w-3xl font-display text-2xl font-normal italic leading-tight tracking-normal text-brand-800 dark:text-blue-100 sm:text-3xl">
              {statement}
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-200 sm:text-base">
              {description}
            </p>
          </motion.div>

          {children && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
              className="mt-7"
            >
              {children}
            </motion.div>
          )}
        </div>

        <motion.a
          href={nextHref}
          aria-label="Continue to the next section"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.32 }}
          className="ml-auto mt-8 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-900 backdrop-blur-sm transition-colors hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
        >
          <ArrowDown className="h-4 w-4" />
        </motion.a>
      </motion.div>
    </section>
  );
}

export function PublicReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
