"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { schoolName } from "@/lib/branding";

const links = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const pathname = usePathname();
  const isCinematic = ["/", "/features", "/about", "/contact", "/login", "/signup"].includes(pathname);
  const hasOverlayHero = ["/", "/features", "/about", "/contact"].includes(pathname);
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const toggleTheme = React.useCallback(() => {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(nextTheme);
    root.style.colorScheme = nextTheme;
    window.localStorage.setItem("wbtes-theme", nextTheme);
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "top-0 z-50 w-full transition-all duration-300",
        hasOverlayHero ? "fixed" : "sticky",
        scrolled
          ? hasOverlayHero
            ? "bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:bg-slate-950/90 dark:shadow-black/10"
            : isCinematic
              ? "bg-white/95 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:bg-slate-950/95 dark:shadow-black/10"
              : "border-b border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/80"
          : hasOverlayHero
            ? "bg-white/55 backdrop-blur-md dark:bg-slate-950/55"
            : isCinematic
              ? "bg-white dark:bg-slate-950"
              : "bg-transparent"
      )}
    >
      <div className="site-frame flex h-16 items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="group flex items-center gap-2.5 md:justify-self-start" onClick={() => setOpen(false)}>
          <BrandMark className="transition-transform group-hover:scale-105" />
          <div>
            <span className="text-lg font-bold tracking-normal text-slate-900 dark:text-white">
              WBTE
            </span>
            <span className="hidden text-[10px] font-medium text-slate-500 dark:text-slate-400 xl:block">
              {schoolName === "WBTE" ? "Web-Based Teacher Evaluation" : schoolName}
            </span>
          </div>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex md:justify-self-center">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                )}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className={cn(
                      "absolute inset-0 -z-10 rounded-full",
                      isCinematic
                        ? "bg-slate-100 dark:bg-white/10"
                        : "border border-slate-200/80 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                    )}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 md:justify-self-end">
          <button
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            onClick={toggleTheme}
            className={cn(
              "hidden h-9 w-9 items-center justify-center rounded-full transition-colors md:flex",
              "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            {mounted && (resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
          </button>
          <Link
            href="/login"
            className="hidden btn-ghost md:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signup" className="hidden btn-primary md:inline-flex">
            Create account
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full md:hidden",
              "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            )}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "backdrop-blur-xl md:hidden",
              isCinematic
                ? "bg-white/95 dark:bg-slate-950/95"
                : "border-t border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950/95"
            )}
          >
            <div className="site-frame flex flex-col gap-1 py-4">
              {links.map((l) => {
                const active = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-md px-4 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-slate-100 font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-300"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <div className="mt-2 flex items-center gap-2 px-1">
                <button
                  onClick={toggleTheme}
                  className="btn-secondary flex-1"
                >
                  {mounted && resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {mounted && resolvedTheme === "dark" ? "Light" : "Dark"} mode
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 px-1">
                <Link href="/login" onClick={() => setOpen(false)} className="btn-secondary flex-1">
                  Sign in
                </Link>
                <Link href="/signup" onClick={() => setOpen(false)} className="btn-primary flex-1">
                  Create account
                </Link>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
