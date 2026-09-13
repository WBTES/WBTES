"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { schoolName } from "@/lib/branding";
import { cn } from "@/lib/utils";

const sections = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/#workflow", label: "Workflow" },
      { href: "/#faq", label: "Common questions" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: "/about", label: "About WBTE" },
      { href: "/contact", label: "Contact" },
      { href: "/#roles", label: "Access roles" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create account" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
];

export function Footer() {
  const pathname = usePathname();
  const isCinematic = ["/", "/features", "/about", "/contact", "/login", "/signup"].includes(pathname);

  return (
    <div className={isCinematic ? "bg-white dark:bg-slate-950" : undefined}>
      <footer
        className={cn(
          "border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
          isCinematic && "border-t-0"
        )}
      >
        <div className="site-frame py-12 text-left">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(320px,1.7fr)_repeat(3,minmax(140px,0.7fr))] lg:gap-12 xl:gap-16">
            <div className="sm:col-span-2 lg:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2.5">
                <BrandMark />
                <span className="font-display text-xl font-medium tracking-normal text-slate-950 dark:text-white">
                  WBTE
                </span>
              </Link>
              {schoolName !== "WBTE" && (
                <p className="mt-3 text-xs font-semibold uppercase text-slate-500">{schoolName}</p>
              )}
              <p className="mt-4 max-w-sm text-sm font-semibold text-slate-800 dark:text-slate-200">
                Web-Based Teacher Evaluation
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                A role-based capstone project for managing teacher evaluation periods, student
                feedback, announcements, analytics, and reports.
              </p>
            </div>

            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{section.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-slate-600 transition-colors hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            className={cn(
              "mt-10 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between",
              isCinematic ? "pt-0" : "border-t border-slate-200 pt-5 dark:border-slate-800"
            )}
          >
            <p>&copy; {new Date().getFullYear()} WBTE. All rights reserved.</p>
            <p>Designed for students, administrators, department heads, and HR.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
