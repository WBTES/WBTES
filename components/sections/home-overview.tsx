"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Mail,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import { publicContactEmail } from "@/lib/branding";

const statement =
  "One connected evaluation cycle turns student feedback into clear, confidential evidence for better academic decisions.";

const objectives: Array<{
  icon: LucideIcon;
  title: string;
  body: string;
}> = [
  {
    icon: ShieldCheck,
    title: "Protect confidentiality",
    body: "Keep completion tracking separate from anonymous ratings and written feedback.",
  },
  {
    icon: Target,
    title: "Make progress measurable",
    body: "Connect programs, teachers, subjects, schedules, forms, and participation in one cycle.",
  },
  {
    icon: BarChart3,
    title: "Turn feedback into action",
    body: "Give administrators, department heads, and HR the appropriate trends, themes, comparisons, and exportable evidence.",
  },
];

export function HomeOverview() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-white py-24 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-28 lg:py-32" id="about">
      <div className="container-tight">
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55 }}
          >
            <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Purpose</p>
            <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Built for an evaluation process that remains understandable from setup to reporting.
            </p>
          </motion.div>

          <RevealStatement text={statement} />
        </div>

        <div className="mt-20 grid gap-12 md:grid-cols-3 md:gap-9 lg:mt-24">
          {objectives.map(({ icon: Icon, title, body }, index) => (
            <motion.article
              key={title}
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-70px" }}
              transition={{ duration: 0.6, delay: index * 0.08 }}
              className="relative pt-2"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-brand-700 dark:bg-slate-900 dark:text-blue-200">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-7 font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                {title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
            </motion.article>
          ))}
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16"
        >
          <Link
            href="/about"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-600 dark:text-blue-300 dark:hover:text-blue-200"
          >
            Read about the project
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function RevealStatement({ text }: { text: string }) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  const reduceMotion = useReducedMotion();

  return (
    <h2
      ref={ref}
      className="max-w-5xl font-display text-4xl font-medium leading-[1.02] tracking-normal text-slate-950 dark:text-white sm:text-5xl lg:text-6xl xl:text-7xl"
    >
      {text.split(" ").map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          className="mr-[0.22em] inline-block"
          initial={reduceMotion ? false : { opacity: 0.14, y: 10, filter: "blur(5px)" }}
          animate={
            inView
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0.14, y: 10, filter: "blur(5px)" }
          }
          transition={{
            duration: 0.48,
            delay: reduceMotion ? 0 : index * 0.028,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </h2>
  );
}

export function HomeContact() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="contact-home"
      className="relative overflow-hidden bg-white py-20 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-24"
    >
      <Mail
        className="pointer-events-none absolute -right-8 top-1/2 h-52 w-52 -translate-y-1/2 text-brand-700/[0.06] dark:text-blue-400/[0.06]"
        aria-hidden="true"
      />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.65 }}
        className="container-tight relative grid gap-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
      >
        <div>
          <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Contact</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-[0.98] tracking-normal sm:text-5xl lg:text-6xl">
            Questions about your evaluation workflow?
          </h2>
          <a
            href={`mailto:${publicContactEmail}`}
            className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
          >
            <Mail className="h-4 w-4 text-brand-700 dark:text-blue-300" />
            {publicContactEmail}
          </a>
        </div>
        <Link
          href="/contact"
          className="btn group w-fit bg-slate-950 px-6 py-3 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50"
        >
          Contact WBTE
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>
    </section>
  );
}
