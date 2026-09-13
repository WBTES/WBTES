"use client";

import * as React from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  Send,
  Star,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

type SceneId = "prepare" | "assign" | "evaluate" | "report";

type WorkflowStep = {
  icon: LucideIcon;
  title: string;
  description: string;
  scene: SceneId;
};

const steps: WorkflowStep[] = [
  {
    icon: CalendarRange,
    title: "Prepare the period",
    description:
      "Set the semester dates, choose an evaluation form, and confirm which questions belong to the cycle.",
    scene: "prepare",
  },
  {
    icon: UsersRound,
    title: "Create assignments",
    description:
      "Connect each teacher and subject to the students who are eligible to provide feedback.",
    scene: "assign",
  },
  {
    icon: Send,
    title: "Collect one response",
    description:
      "Open the period and let every assigned student complete a clear, mobile-friendly evaluation once.",
    scene: "evaluate",
  },
  {
    icon: BarChart3,
    title: "Review the evidence",
    description:
      "Monitor completion, compare outcomes, read anonymous themes, and export reports for academic review.",
    scene: "report",
  },
];

export function HowItWorks() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const reduceMotion = useReducedMotion();

  return (
    <section id="workflow" className="bg-slate-50 py-24 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-28 lg:py-32">
      <div className="container-tight">
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
          >
            <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Workflow</p>
            <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Four deliberate stages keep every evaluation visible, controlled, and accountable.
            </p>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.65 }}
          >
            <h2 className="max-w-4xl font-display text-4xl font-medium leading-[0.98] tracking-normal sm:text-5xl lg:text-7xl">
              Follow the evaluation from question setup to an actionable report.
            </h2>
          </motion.div>
        </div>

        <div className="mt-16 grid items-start gap-12 lg:mt-24 lg:grid-cols-[minmax(0,0.78fr)_minmax(520px,1.22fr)] lg:gap-16">
          <div>
            {steps.map((step, index) => (
              <WorkflowStepContent
                key={step.scene}
                step={step}
                index={index}
                active={activeIndex === index}
                onActive={setActiveIndex}
              />
            ))}
          </div>

          <div className="relative hidden self-stretch lg:block">
            <div className="sticky top-24 flex min-h-[calc(100vh-8rem)] items-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={steps[activeIndex].scene}
                  initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -14, scale: 0.99 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full"
                >
                  <WorkflowVisual scene={steps[activeIndex].scene} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowStepContent({
  step,
  index,
  active,
  onActive,
}: {
  step: WorkflowStep;
  index: number;
  active: boolean;
  onActive: (index: number) => void;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-32% 0px -45% 0px" });
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  return (
    <article
      ref={ref}
      className="flex min-h-0 flex-col justify-center py-10 transition-opacity duration-300 lg:min-h-[62vh] lg:py-16"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.55 }}
        className={active ? "opacity-100" : "opacity-55"}
      >
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
            active
              ? "bg-brand-600 text-white"
              : "bg-slate-200 text-slate-500 dark:bg-slate-900 dark:text-slate-400"
          }`}
        >
          <step.icon className="h-5 w-5" />
        </span>
        <h3 className="mt-7 font-display text-3xl font-medium tracking-normal text-slate-950 dark:text-white sm:text-4xl">
          {step.title}
        </h3>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
          {step.description}
        </p>
      </motion.div>

      <div className="mt-7 lg:hidden">
        <WorkflowVisual scene={step.scene} />
      </div>
    </article>
  );
}

function WorkflowVisual({ scene }: { scene: SceneId }) {
  return (
    <div className="min-h-[320px] overflow-hidden rounded-lg bg-white text-slate-900 shadow-xl shadow-slate-300/60 dark:bg-slate-900 dark:text-slate-100 dark:shadow-2xl dark:shadow-black/30 sm:min-h-[390px] lg:min-h-[520px]">
      <div className="flex h-11 items-center justify-between bg-slate-100 px-4 dark:bg-slate-800/90">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </div>
        <span className="text-[10px] font-semibold uppercase text-slate-400">
          WBTE / {scene}
        </span>
      </div>
      <div className="p-4 sm:p-6 lg:p-8">
        {scene === "prepare" && <PrepareScene />}
        {scene === "assign" && <AssignmentScene />}
        {scene === "evaluate" && <EvaluationScene />}
        {scene === "report" && <ReportScene />}
      </div>
    </div>
  );
}

function PrepareScene() {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-brand-700 dark:text-blue-300">Evaluation schedule</p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">1st Semester 2026-2027</h4>
        </div>
        <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-semibold text-amber-300">
          Scheduled
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-5 w-5 text-brand-700 dark:text-blue-300" />
            <div>
              <p className="text-[10px] uppercase text-slate-500">Opens</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-white">August 05, 8:00 AM</p>
            </div>
          </div>
        </div>
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-5 w-5 text-brand-700 dark:text-blue-300" />
            <div>
              <p className="text-[10px] uppercase text-slate-500">Closes</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-white">October 28, 5:00 PM</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-slate-100 p-4 dark:bg-slate-950 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-brand-700 dark:text-blue-300" />
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Standard teacher evaluation</p>
              <p className="text-xs text-slate-500">13 active questions selected</p>
            </div>
          </div>
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        </div>
      </div>
    </div>
  );
}

function AssignmentScene() {
  const students = ["BSIT 4-C", "BSCS 3-A", "BSIS 2-B"];

  return (
    <div>
      <p className="text-xs text-brand-700 dark:text-blue-300">Teacher assignment</p>
      <h4 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">Connect the right class</h4>

      <div className="mt-6 rounded-md bg-slate-100 p-4 dark:bg-slate-950 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
            MR
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">Maria Reyes</p>
            <p className="truncate text-xs text-slate-500">Web Development / BSIT</p>
          </div>
          <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-400" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {students.map((student, index) => (
          <div key={student} className="rounded-md bg-slate-100 px-2 py-4 text-center dark:bg-slate-800">
            <UsersRound className="mx-auto h-4 w-4 text-brand-700 dark:text-blue-300" />
            <p className="mt-2 truncate text-[11px] font-semibold text-slate-800 dark:text-slate-200">{student}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{38 + index * 4} students</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvaluationScene() {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-brand-700 dark:text-blue-300">Student evaluation</p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">Teaching effectiveness</h4>
        </div>
        <span className="text-xs font-semibold text-slate-400">4 of 13</span>
      </div>

      <div className="mt-6 rounded-md bg-slate-100 p-4 dark:bg-slate-950 sm:p-6">
        <div className="flex items-start gap-3">
          <Star className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm font-semibold leading-relaxed text-slate-950 dark:text-white sm:text-base">
            Explains course objectives and expectations clearly.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((rating) => (
            <div
              key={rating}
              className={`flex h-11 items-center justify-center rounded-md text-sm font-semibold ${
                rating === 4
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {rating}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[10px] text-slate-500">
          <span>Strongly disagree</span>
          <span>Strongly agree</span>
        </div>
      </div>
    </div>
  );
}

function ReportScene() {
  const bars = [
    { label: "Teaching effectiveness", value: 92 },
    { label: "Communication", value: 86 },
    { label: "Class management", value: 79 },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-brand-700 dark:text-blue-300">Department report</p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">Performance overview</h4>
        </div>
        <BarChart3 className="h-5 w-5 text-brand-700 dark:text-blue-300" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-950">
          <p className="text-[10px] uppercase text-slate-500">Average rating</p>
          <p className="mt-2 font-display text-4xl text-slate-950 dark:text-white">4.6</p>
          <p className="text-xs text-emerald-400">out of 5.0</p>
        </div>
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-950">
          <p className="text-[10px] uppercase text-slate-500">Completion</p>
          <p className="mt-2 font-display text-4xl text-slate-950 dark:text-white">88%</p>
          <p className="text-xs text-brand-700 dark:text-blue-300">164 responses</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300">{bar.label}</span>
              <span className="font-semibold text-slate-950 dark:text-white">{bar.value}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${bar.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
