"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  BellRing,
  CalendarCheck2,
  ClipboardList,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
  tone: string;
};

const features: Feature[] = [
  {
    icon: ClipboardList,
    title: "Flexible question bank",
    description:
      "Create agreement scales, multiple-choice questions, and open-text prompts that can be ordered and reused.",
    detail: "Three question formats",
    tone: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-blue-300",
  },
  {
    icon: CalendarCheck2,
    title: "Controlled evaluation periods",
    description:
      "Set semester dates, select the evaluation form, and control exactly when student access opens and closes.",
    detail: "Draft to closed lifecycle",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    icon: UsersRound,
    title: "Course-aware assignments",
    description:
      "Connect teachers, subjects, programs, and eligible students so every dashboard shows the correct evaluation.",
    detail: "Department-aware matching",
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  {
    icon: BellRing,
    title: "Announcements and email",
    description:
      "Publish targeted dashboard notices and deliver optional announcement email through the configured SMTP account.",
    detail: "Targeted communication",
    tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  {
    icon: BarChart3,
    title: "Analysis and exports",
    description:
      "Review participation, ratings, comparisons, and semester trends, then export evidence as PDF or Excel.",
    detail: "Operational and academic views",
    tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  },
  {
    icon: ShieldCheck,
    title: "Role-aware administration",
    description:
      "Separate student, administrator, department-head, and HR access with authentication, Firestore rules, and audit logs.",
    detail: "Three focused roles",
    tone: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  },
];

export function FeaturesGrid() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="features-grid" className="bg-white py-24 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-28 lg:py-32">
      <div className="container-tight">
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
          >
            <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Capabilities</p>
            <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Every tool supports the same controlled evaluation cycle.
            </p>
          </motion.div>

          <motion.h2
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.65 }}
            className="max-w-4xl font-display text-4xl font-medium leading-[0.98] tracking-normal sm:text-5xl lg:text-7xl"
          >
            A complete system, without losing sight of the people using it.
          </motion.h2>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:mt-24 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              whileHover={reduceMotion ? undefined : { y: -4 }}
              transition={{ duration: 0.5, delay: (index % 3) * 0.06 }}
              className="group relative min-h-[290px] overflow-hidden rounded-lg bg-slate-100 p-6 sm:p-7 dark:bg-slate-900/70"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-md ${feature.tone}`}>
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-8 max-w-[16rem] font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                {feature.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{feature.description}</p>
              <p className="mt-6 text-xs font-semibold text-brand-700 dark:text-blue-300">{feature.detail}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
