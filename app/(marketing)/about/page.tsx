import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ShieldCheck,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { PublicPageHero, PublicReveal } from "@/components/public-page-hero";

const principles: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  iconBg: string;
}> = [
  {
    icon: ShieldCheck,
    title: "Confidential reporting",
    description: "Reports present student feedback without displaying student names.",
    iconBg: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  },
  {
    icon: Workflow,
    title: "Explicit workflows",
    description: "Periods, assignments, questions, and status changes remain visible to administrators.",
    iconBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  {
    icon: BarChart3,
    title: "Useful evidence",
    description: "Completion, trends, comparisons, and comments support academic review.",
    iconBg: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  },
  {
    icon: Accessibility,
    title: "Accessible participation",
    description: "Responsive controls make student evaluation practical across common devices.",
    iconBg: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
];

const phases = [
  {
    title: "Define the workflow",
    description: "Map the responsibilities of students, administrators, department heads, and HR.",
  },
  {
    title: "Design the data and interface",
    description: "Connect academic records, evaluation periods, assignments, questions, and responses.",
  },
  {
    title: "Build the working product",
    description: "Implement authentication, evaluation forms, announcements, analytics, and reports.",
  },
  {
    title: "Test and refine",
    description: "Verify the important workflows, improve usability, and correct behavior as the project evolves.",
  },
];

export default function AboutPage() {
  return (
    <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicPageHero
        eyebrow="Purpose, principles, and process"
        title="About WBTE"
        statement="Built around the people doing the evaluation work."
        description="WBTE brings question preparation, student evaluation, announcements, monitoring, and academic reporting into one connected experience."
        nextHref="#purpose"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/features" className="btn w-fit bg-slate-950 px-6 py-3 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50">
            Explore features <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/contact" className="btn w-fit bg-slate-100 px-6 py-3 text-slate-900 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
            Contact WBTE
          </Link>
        </div>
      </PublicPageHero>

      <section id="purpose" className="scroll-mt-20 bg-white py-24 dark:bg-slate-950 sm:py-28 lg:py-32">
        <div className="container-tight">
          <div className="grid gap-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
            <PublicReveal>
              <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Project purpose</p>
              <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                A clearer path from evaluation setup to evidence that academic teams can use.
              </p>
            </PublicReveal>
            <PublicReveal>
              <h2 className="max-w-5xl font-display text-4xl font-medium leading-[1.02] tracking-normal text-slate-950 dark:text-white sm:text-5xl lg:text-7xl">
                Replace fragmented evaluation work with one clear cycle.
              </h2>
            </PublicReveal>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-3 lg:ml-[284px] lg:mt-24">
            {[
              {
                icon: Target,
                label: "The problem",
                text: "Questions, schedules, response tracking, and reports are difficult to coordinate when they live in separate manual processes.",
              },
              {
                icon: Workflow,
                label: "The approach",
                text: "WBTE connects the academic structure to explicit periods, assignments, student forms, announcements, and result views.",
              },
              {
                icon: CheckCircle2,
                label: "The outcome",
                text: "Each role receives a focused workspace, while evaluation activity remains organized for review across semesters.",
              },
            ].map(({ icon: Icon, label, text }, index) => (
              <PublicReveal key={label} delay={index * 0.07}>
                <article className="min-h-[260px] rounded-lg bg-slate-100 p-6 dark:bg-slate-900/70 sm:p-7">
                  <Icon className="h-5 w-5 text-brand-700 dark:text-blue-300" />
                  <h3 className="mt-10 font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                    {label}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
                </article>
              </PublicReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-24 dark:bg-slate-900/35 sm:py-28 lg:py-32">
        <div className="container-tight">
          <div className="grid gap-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
            <PublicReveal>
              <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Design principles</p>
              <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                The choices behind WBTE follow the real evaluation workflow.
              </p>
            </PublicReveal>
            <PublicReveal>
              <h2 className="max-w-4xl font-display text-4xl font-medium leading-[0.98] tracking-normal text-slate-950 dark:text-white sm:text-5xl lg:text-7xl">
                Practical by design. Accountable by default.
              </h2>
            </PublicReveal>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:ml-[284px] lg:mt-24">
            {principles.map((principle, index) => (
              <PublicReveal key={principle.title} delay={(index % 2) * 0.07}>
                <article className="relative min-h-[230px] overflow-hidden rounded-lg bg-white p-6 shadow-sm dark:bg-slate-900/70 dark:shadow-none sm:p-7">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-md ${principle.iconBg}`}>
                    <principle.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-7 font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                    {principle.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {principle.description}
                  </p>
                </article>
              </PublicReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-24 dark:bg-slate-950 sm:py-28 lg:py-32">
        <div className="container-tight">
          <div className="grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16">
            <PublicReveal>
              <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Development path</p>
              <h2 className="mt-4 font-display text-4xl font-medium leading-tight tracking-normal text-slate-950 dark:text-white sm:text-5xl">
                How the project took shape.
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                The work followed the same practical order as the evaluation cycle itself.
              </p>
            </PublicReveal>
            <ol className="grid gap-4">
              {phases.map((phase, index) => (
                <li key={phase.title}>
                  <PublicReveal delay={index * 0.06}>
                    <div className="grid gap-3 rounded-lg bg-slate-100 p-5 dark:bg-slate-900/70 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-start sm:p-6">
                      <h3 className="font-display text-xl font-medium tracking-normal text-slate-950 dark:text-white">
                        {phase.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{phase.description}</p>
                    </div>
                  </PublicReveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-slate-100 py-20 text-slate-950 dark:bg-slate-900 dark:text-white sm:py-24">
        <span
          className="pointer-events-none absolute -bottom-16 right-0 font-display text-[10rem] text-slate-950/[0.025] dark:text-white/[0.025] sm:text-[15rem]"
          aria-hidden="true"
        >
          WBTE
        </span>
        <PublicReveal className="container-tight relative grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Explore WBTE</p>
            <h2 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-[0.98] tracking-normal sm:text-5xl lg:text-6xl">
              Follow the workflow from an account.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Students register directly. Administrators create privileged accounts and assign
              department access from inside WBTE.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn bg-slate-950 px-6 py-3 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50">
              Create student account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn bg-brand-600 px-6 py-3 text-white hover:bg-brand-500">
              Sign in
            </Link>
          </div>
        </PublicReveal>
      </section>
    </div>
  );
}
