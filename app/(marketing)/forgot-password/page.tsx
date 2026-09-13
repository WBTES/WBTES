"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { AuthAside } from "@/components/auth-aside";
import { useAuth } from "@/lib/firebase/auth-context";
import { getAuthErrorMessage } from "@/lib/firebase/auth-error";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const { resetPassword, configured } = useAuth();
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setDone(true);
      toast.success("Password reset email requested");
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error, "Password reset failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950">
      <div className="container-tight grid min-h-[calc(100svh-4rem)] gap-6 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)] lg:py-8">
        <AuthAside
          eyebrow="Account recovery"
          title="Return to your WBTE workspace"
          description="Request a secure reset link for the email address connected to your account."
          points={[
            "The reset link is sent through Firebase Authentication",
            "Your assigned role and existing records remain unchanged",
            "Return to sign in after choosing a new password",
          ]}
        />

        <main className="flex items-center justify-center py-6 lg:py-10">
          <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            {done ? (
              <div className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h1 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">Check your inbox</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  A password reset link was requested for <strong>{email}</strong>. Check the spam
                  folder if it does not arrive shortly.
                </p>
                <Link href="/login" className="btn-primary mt-6 w-full py-3 text-sm">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  Secure recovery
                </div>
                <h1 className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">Reset your password</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Enter your account email and Firebase will send the reset link.
                </p>

                {!configured && (
                  <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    Password recovery is not configured in this environment.
                  </p>
                )}

                <form onSubmit={onSubmit} className="mt-6">
                  <label htmlFor="reset-email" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Email address
                  </label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="reset-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@school.edu"
                      className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <button type="submit" disabled={loading || !configured} className="btn-primary mt-5 w-full py-3 text-sm">
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Requesting link...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </button>
                  <Link
                    href="/login"
                    className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </Link>
                </form>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
