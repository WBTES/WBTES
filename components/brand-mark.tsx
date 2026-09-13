import { GraduationCap } from "lucide-react";
import { schoolLogoUrl, schoolName } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900",
        className
      )}
    >
      {schoolLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={schoolLogoUrl}
          alt={`${schoolName} logo`}
          className="h-full w-full object-contain"
        />
      ) : (
        <GraduationCap className={cn("h-5 w-5", iconClassName)} />
      )}
    </span>
  );
}
