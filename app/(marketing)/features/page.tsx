import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  FileDown,
  History,
  LockKeyhole,
  Megaphone,
  Search,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { PublicPageHero, PublicReveal } from "@/components/public-page-hero";

type FeatureItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type FeatureGroup = {
  id: string;
  label: string;
  title: string;
  description: string;
  iconBg: string;
  items: FeatureItem[];
};

const groups: FeatureGroup[] = [
  {
    id: "prepare",
    label: "Prepare",
    title: "Build the evaluation cycle",
    description:
      "Administrators establish the academic structure, choose the question set, and connect the correct students to each teacher assignment.",
    iconBg: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    items: [
      {
        icon: UsersRound,
        title: "Academic records",
        description: "Maintain departments, subjects, teacher records, and student profiles.",
      },
      {
        icon: ClipboardList,
        title: "Question bank",
        description: "Create active rating, multiple-choice, and open-text questions in a defined order.",
      },
      {
        icon: CalendarRange,
        title: "Evaluation periods",
        description: "Set semester dates, choose questions, and control draft, scheduled, open, or closed status.",
      },
      {
        icon: UserRoundCheck,
        title: "Targeted assignments",
        description: "Connect a teacher, subject, period, department, and eligible student group.",
      },
    ],
  },
  {
    id: "collect",
    label: "Collect",
    title: "Guide students through clear feedback",
    description:
      "Students see only eligible evaluations and complete each one through a focused form that works across screen sizes.",
    iconBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    items: [
      {
        icon: Smartphone,
        title: "Assigned student workspace",
        description: "Self-register securely, verify your email, then access open, upcoming, completed, and expired evaluations.",
      },
      {
        icon: CheckCircle2,
        title: "Structured responses",
        description: "Use 1-5 agreement controls, choice options, written responses, and optional comments.",
      },
      {
        icon: Megaphone,
        title: "Announcements",
        description: "Publish targeted notices with optional action links inside each recipient's dashboard.",
      },
      {
        icon: BellRing,
        title: "SMTP email delivery",
        description: "Send enabled announcements through the SMTP account configured on the WBTE server.",
      },
    ],
  },
  {
    id: "review",
    label: "Review",
    title: "Turn responses into useful evidence",
    description:
      "Administrators, department heads, and HR can monitor participation, compare outcomes, and prepare role-appropriate reports.",
    iconBg: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    items: [
      {
        icon: BarChart3,
        title: "Completion monitoring",
        description: "Track assigned and completed evaluations by department and active period.",
      },
      {
        icon: Search,
        title: "Focused analysis",
        description: "Filter results by teacher, subject, department, semester, and academic year.",
      },
      {
        icon: History,
        title: "Trend comparison",
        description: "Review performance across stored periods and academic years.",
      },
      {
        icon: FileDown,
        title: "PDF and Excel exports",
        description: "Generate portable reports for administration and department review.",
      },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    title: "Keep access and changes accountable",
    description:
      "Authentication, role boundaries, Firestore rules, and activity history support responsible use of evaluation data.",
    iconBg: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    items: [
      {
        icon: LockKeyhole,
        title: "Role-based access",
        description: "Provide focused screens for students, administrators, department heads, and HR.",
      },
      {
        icon: ShieldCheck,
        title: "Protected data paths",
        description: "Use Firebase Authentication and Firestore rules to restrict reads and writes.",
      },
      {
        icon: History,
        title: "Audit history",
        description: "Record important administrative activity for later review.",
      },
      {
        icon: Search,
        title: "Searchable records",
        description: "Find users, teachers, subjects, reports, and stored evaluation periods efficiently.",
      },
    ],
  },
];

const roleSummaries = [
  {
    title: "Student",
    description: "View announcements and complete only assigned evaluations.",
    icon: Smartphone,
  },
  {
    title: "Administrator",
    description: "Configure records, periods, assignments, questions, and reports.",
    icon: ShieldCheck,
  },
  {
    title: "HR",
    description: "Review school-wide teacher performance and reports.",
    icon: BarChart3,
  },
];

export default function FeaturesPage() {
  return (
    <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicPageHero
        eyebrow="Inside the evaluation cycle"
        title="WBTE Features"
        statement="Everything needed for one clear evaluation cycle."
        description="Prepare the structure, guide student participation, review the evidence, and keep access accountable through one connected workflow."
        nextHref="#prepare"
      >
        <nav aria-label="Feature groups" className="flex flex-wrap gap-x-6 gap-y-3">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`#${group.id}`}
              className="inline-flex items-center text-xs font-semibold text-slate-700 transition-colors hover:text-slate-950 dark:text-slate-200 dark:hover:text-white"
            >
              {group.label}
            </Link>
          ))}
        </nav>
      </PublicPageHero>

      {groups.map((group, groupIndex) => (
        <section
          key={group.id}
          id={group.id}
          className={`scroll-mt-20 py-24 sm:py-28 lg:py-32 ${
            groupIndex % 2 === 1
              ? "bg-slate-50 dark:bg-slate-900/35"
              : "bg-white dark:bg-slate-950"
          }`}
        >
          <div className="container-tight">
            <div className="grid gap-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
              <PublicReveal>
                <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">{group.label}</p>
                <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {group.description}
                </p>
              </PublicReveal>

              <PublicReveal>
                <h2 className="max-w-4xl font-display text-4xl font-medium leading-[0.98] tracking-normal text-slate-950 dark:text-white sm:text-5xl lg:text-7xl">
                  {group.title}
                </h2>
              </PublicReveal>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:ml-[284px] lg:mt-20">
              {group.items.map((item, itemIndex) => (
                <PublicReveal key={item.title} delay={(itemIndex % 2) * 0.07}>
                  <article className="relative min-h-[250px] overflow-hidden rounded-lg bg-slate-100 p-6 dark:bg-slate-900/70 sm:p-7">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-md ${group.iconBg}`}>
                      <item.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-7 font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {item.description}
                    </p>
                  </article>
                </PublicReveal>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="bg-white py-24 dark:bg-slate-950 sm:py-28">
        <div className="container-tight">
          <div className="grid gap-9 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
            <PublicReveal>
              <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Access by role</p>
              <p className="mt-4 max-w-[190px] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Each workspace shows only the responsibilities and records needed by that role.
              </p>
            </PublicReveal>
            <PublicReveal>
              <h2 className="max-w-4xl font-display text-4xl font-medium leading-[0.98] tracking-normal text-slate-950 dark:text-white sm:text-5xl lg:text-7xl">
                Focused access for every participant.
              </h2>
            </PublicReveal>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3 lg:ml-[284px] lg:mt-20">
            {roleSummaries.map(({ title, description, icon: Icon }, index) => (
              <PublicReveal key={title} delay={index * 0.07}>
                <article className="min-h-[220px] rounded-lg bg-slate-100 p-6 dark:bg-slate-900/70">
                  <Icon className="h-5 w-5 text-brand-700 dark:text-blue-300" />
                  <h3 className="mt-9 font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
                </article>
              </PublicReveal>
            ))}
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
        <PublicReveal className="container-tight relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Enter WBTE</p>
            <h2 className="mt-4 max-w-3xl font-display text-4xl font-medium leading-[0.98] tracking-normal sm:text-5xl lg:text-6xl">
              See the workflow from a real account.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Students register directly. Administrator, department-head, and HR accounts are created
              from inside the administrator workspace.
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
