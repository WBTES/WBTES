import {
  BarChart3,
  CalendarRange,
  ClipboardList,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

const workflow: Array<{ icon: LucideIcon; title: string; detail: string }> = [
  { icon: ClipboardList, title: "Question bank", detail: "Rating, choice, and text" },
  { icon: CalendarRange, title: "Evaluation periods", detail: "Dates and question sets" },
  { icon: UsersRound, title: "Student assignments", detail: "Teacher and subject matching" },
  { icon: BarChart3, title: "Reports and analysis", detail: "Trends, PDF, and Excel" },
];

function WorkflowGroup({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-10 pr-10 sm:gap-14 sm:pr-14 lg:gap-20 lg:pr-20"
      aria-hidden={hidden || undefined}
    >
      {workflow.map(({ icon: Icon, title, detail }) => (
        <div key={title} className="flex min-w-max items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-brand-700 dark:bg-slate-900 dark:text-blue-200">
            <Icon className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-xs font-semibold text-slate-950 dark:text-white sm:text-sm">{title}</span>
            <span className="block text-[11px] text-slate-500 sm:text-xs">{detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrustBar() {
  return (
    <section className="overflow-hidden bg-white py-6 text-slate-950 dark:bg-slate-950 dark:text-white" aria-label="WBTE core workflow">
      <div className="flex w-max animate-marquee motion-reduce:animate-none">
        <WorkflowGroup />
        <WorkflowGroup hidden />
      </div>
    </section>
  );
}
