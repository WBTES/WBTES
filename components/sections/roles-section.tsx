"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  GraduationCap,
  Megaphone,
  Settings,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/section";
import { cn } from "@/lib/utils";

type RoleId = "student" | "administrator" | "department_head" | "hr";

type Role = {
  id: RoleId;
  tabLabel: string;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

const roles: Role[] = [
  {
    id: "department_head",
    tabLabel: "Dept. Head",
    label: "Department Head workspace",
    icon: BarChart3,
    title: "Track department outcomes without exposing raw feedback",
    description:
      "Department heads see school-wide released ratings, completion trends, and grouped anonymous feedback.",
    bullets: [
      "Privacy-protected department dashboards",
      "Category, teacher, and period comparisons",
      "Grouped comment counts and themes",
      "PDF and Excel aggregate exports",
    ],
  },
  {
    id: "student",
    tabLabel: "Student",
    label: "Student workspace",
    icon: GraduationCap,
    title: "Complete only the evaluations assigned to you",
    description:
      "Students get a focused list of open, upcoming, completed, and expired evaluations without seeing administrative data.",
    bullets: [
      "Self-registration with immediate access",
      "Mobile-friendly 1-5, choice, and text questions",
      "One submission for each teacher assignment",
      "Dashboard announcements and completion receipts",
    ],
  },
  {
    id: "administrator",
    tabLabel: "Admin",
    label: "Administrator workspace",
    icon: Settings,
    title: "Run the full evaluation cycle from one place",
    description:
      "Administrators maintain academic records, prepare periods, connect teachers and subjects, and monitor participation.",
    bullets: [
      "Users, teachers, departments, and subjects",
      "Questions, schedules, assignments, and announcements",
      "Analytics, reports, and audit history",
    ],
  },
  {
    id: "hr",
    tabLabel: "HR",
    label: "HR workspace",
    icon: Users,
    title: "Review department results without admin clutter",
    description:
      "HR can monitor school-wide results, compare teachers, and export the information needed for review meetings.",
    bullets: [
      "Department-level performance summaries",
      "Teacher and semester comparisons",
      "PDF and Excel report exports",
    ],
  },
];

export function RolesSection() {
  const [activeId, setActiveId] = React.useState<RoleId>("student");
  const activeRole = roles.find((role) => role.id === activeId) ?? roles[0];

  return (
    <Section id="roles" className="bg-slate-50 py-24 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-28 lg:py-32">
      <SectionHeader
        eyebrow="Access roles"
        title={<>One system. Four distinct points of view.</>}
        description="Each role sees the information and actions it needs, without the noise and permissions it does not."
      />

      <div className="mx-auto mt-16 grid max-w-6xl items-stretch gap-10 lg:mt-20 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-14">
        <div>
          <div
            role="tablist"
            aria-label="WBTE role previews"
            className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-900 sm:grid-cols-4 lg:grid-cols-1"
          >
            {roles.map((role) => {
              const Icon = role.icon;
              const active = role.id === activeId;
              return (
                <button
                  key={role.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="role-preview"
                  onClick={() => setActiveId(role.id)}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs font-semibold transition-colors lg:justify-start lg:px-3 lg:text-sm",
                    active
                      ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 leading-tight">{role.tabLabel}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeRole.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-7"
            >
              <p className="text-xs font-bold uppercase text-brand-700 dark:text-brand-300">
                {activeRole.label}
              </p>
              <h3 className="mt-3 font-display text-3xl font-medium leading-[1.02] tracking-normal text-slate-950 dark:text-white">
                {activeRole.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {activeRole.description}
              </p>
              <ul className="mt-5 space-y-3">
                {activeRole.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>

        <div
          id="role-preview"
          role="tabpanel"
          className="min-h-[420px] overflow-hidden rounded-lg bg-white text-slate-900 shadow-xl shadow-slate-300/60 dark:bg-slate-900 dark:text-slate-100 dark:shadow-2xl dark:shadow-black/30"
        >
          <div className="flex h-11 items-center justify-between bg-slate-100 px-4 dark:bg-slate-800/90">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <ClipboardCheck className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-bold">WBTE</span>
            </div>
            <span className="text-[10px] font-semibold uppercase text-slate-500">Sample workspace</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeId}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <RolePreview role={activeId} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}

function RolePreview({ role }: { role: RoleId }) {
  if (role === "student") return <StudentPreview />;
  if (role === "administrator") return <AdminPreview />;
  return <DepartmentPreview />;
}

function StudentPreview() {
  const evaluations = [
    { subject: "Research Methods", teacher: "Prof. Santos", status: "Open", tone: "emerald" },
    { subject: "Web Development", teacher: "Ms. Reyes", status: "Upcoming", tone: "amber" },
    { subject: "Data Structures", teacher: "Mr. Cruz", status: "Completed", tone: "slate" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Welcome back</p>
          <h4 className="text-lg font-bold text-slate-950 dark:text-white">My Evaluations</h4>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          1 pending
        </span>
      </div>
      <div className="mt-5 space-y-2">
        {evaluations.map((evaluation) => (
          <div
            key={evaluation.subject}
            className="flex items-center gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <Star className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{evaluation.subject}</p>
              <p className="truncate text-xs text-slate-500">{evaluation.teacher}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[10px] font-semibold",
                evaluation.tone === "emerald" &&
                "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                evaluation.tone === "amber" &&
                "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                evaluation.tone === "slate" &&
                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              {evaluation.status}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        Submitted responses are shown as completed and cannot be sent twice.
      </div>
    </div>
  );
}

function AdminPreview() {
  const tasks = [
    { icon: ClipboardCheck, label: "Question bank", value: "24 active" },
    { icon: Users, label: "Teacher assignments", value: "18 groups" },
    { icon: Megaphone, label: "Announcements", value: "2 published" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <p className="text-xs text-slate-500">Administration</p>
      <h4 className="text-lg font-bold text-slate-950 dark:text-white">Evaluation operations</h4>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Students", value: "186" },
          { label: "Teachers", value: "24" },
          { label: "Completion", value: "68.8%" },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-[10px] uppercase text-slate-500">{item.label}</p>
            <p className="mt-1 text-xl font-bold">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {tasks.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-3 py-3">
            <Icon className="h-4 w-4 text-brand-600 dark:text-brand-300" />
            <span className="flex-1 text-sm font-medium">{label}</span>
            <span className="text-xs text-slate-500">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentPreview() {
  const teachers = [
    { name: "Prof. Santos", score: 4.7, width: "94%" },
    { name: "Ms. Reyes", score: 4.4, width: "88%" },
    { name: "Mr. Cruz", score: 4.1, width: "82%" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Computer Studies</p>
          <h4 className="text-lg font-bold text-slate-950 dark:text-white">Department results</h4>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
          <BarChart3 className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {teachers.map((teacher) => (
          <div key={teacher.name}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold">{teacher.name}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{teacher.score} / 5</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-cyan-600" style={{ width: teacher.width }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-2 text-xs font-semibold dark:border-slate-800">
          <FileDown className="h-3.5 w-3.5" /> Export PDF
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-2 text-xs font-semibold dark:border-slate-800">
          <FileDown className="h-3.5 w-3.5" /> Export Excel
        </span>
      </div>
    </div>
  );
}
