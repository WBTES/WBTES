"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, UserRound, ShieldCheck } from "lucide-react";
import { AuthAside } from "@/components/auth-aside";
import { useAuth } from "@/lib/firebase/auth-context";
import { getAuthErrorMessage } from "@/lib/firebase/auth-error";
import toast from "react-hot-toast";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600";

export default function LoginPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { signIn, user, profile, loading } = useAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [kind, setKind] = React.useState<"student" | "staff">("student");
  const [form, setForm] = React.useState({ identifier: "", password: "" });
  const noticeShown = React.useRef(false);

  React.useEffect(() => {
    if (noticeShown.current) return;
    noticeShown.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      toast.success("Staff email verified. You can sign in now.");
    } else if (params.get("pending") === "1") {
      toast.error("Verify your staff email before signing in.");
    } else if (params.get("disabled") === "1") {
      toast.error("This account has been deactivated. Contact an administrator.");
    }
    if ([...params.keys()].length > 0) {
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  React.useEffect(() => {
    if (user && profile) router.push("/dashboard");
  }, [user, profile, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signIn(form.identifier.trim(), form.password, kind);
      toast.success("Welcome back");
      router.push("/dashboard");
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error, "Sign in failed."));
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="overflow-x-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="container-tight grid min-h-[calc(100svh-4rem)] gap-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:py-8">
        <AuthAside
          eyebrow="Welcome back"
          title="Continue your evaluation work"
          description="Sign in once and WBTE opens the dashboard, tasks, and reports available to your assigned role."
          points={[
            "Students see only their assigned evaluations",
            "Administrators manage the complete evaluation cycle",
            "Department heads review privacy-protected summaries",
            "HR reviews detailed school-wide results",
          ]}
        />

        <main className="flex items-center justify-center py-6 lg:py-10">
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-lg bg-slate-50 p-6 shadow-xl shadow-slate-200/60 dark:bg-slate-900/80 dark:shadow-black/10 sm:p-8"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 dark:text-blue-300">
              <ShieldCheck className="h-4 w-4" />
              Secure account access
            </div>
            <h1 className="mt-4 font-display text-3xl font-medium tracking-normal text-slate-950 dark:text-white sm:text-4xl">
              Sign in to WBTE
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Students sign in with their School ID. Staff use their administrator-issued username or email.
            </p>

            <div className="my-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-950" role="group" aria-label="Account type">
              {(["student", "staff"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} disabled={submitting} onClick={() => { setKind(value); setForm({ identifier: "", password: "" }); }} className={`rounded-md px-4 py-2 text-sm font-semibold ${kind === value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>{value === "student" ? "Student" : "Staff"}</button>)}
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-identifier" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {kind === "student" ? "School ID" : "Username or email"}
                </label>
                <div className="relative mt-2">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={form.identifier}
                    onChange={(event) => setForm({ ...form, identifier: event.target.value })}
                    placeholder={kind === "student" ? "Your School ID" : "username or you@school.edu"}
                    maxLength={kind === "student" ? 100 : 254}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Password
                  </label>
                  <Link
                    href={`/forgot-password?role=${kind}`}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-2">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="Enter your password"
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || loading}
                className="btn-primary w-full py-3 text-sm"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Need a student account?{" "}
                <Link href="/signup" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-blue-300 dark:hover:text-blue-200">
                  Create account
                </Link>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Administrator, HR, and department-head accounts are issued by an administrator.
              </p>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
