"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  UserRound,
} from "lucide-react";
import { AuthAside } from "@/components/auth-aside";
import { useAuth } from "@/lib/firebase/auth-context";
import { usePrograms } from "@/lib/use-programs";
import toast from "react-hot-toast";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600 dark:disabled:bg-slate-800";

const initialForm = {
  displayName: "",
  studentNumber: "",
  email: "",
  programId: "",
  yearLevel: "",
  section: "",
  password: "",
  confirmPassword: "",
  website: "",
};

export default function SignupPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { user, profile, loading, completeStudentRegistration } = useAuth();
  const {
    programs,
    loading: programsLoading,
    error: programsError,
  } = usePrograms();
  const [form, setForm] = React.useState(initialForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    if (user && profile) router.push("/dashboard");
  }, [user, profile, router]);

  React.useEffect(() => {
    if (!form.programId) {
      const firstProgram = programs.find((program) => program.status === "active");
      if (firstProgram) {
        setForm((current) => ({ ...current, programId: firstProgram.id }));
      }
    }
  }, [form.programId, programs]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.password.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Password confirmation does not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          studentNumber: form.studentNumber,
          email: form.email,
          programId: form.programId,
          yearLevel: form.yearLevel,
          section: form.section,
          password: form.password,
          website: form.website,
        }),
      });
      const result = await response.json() as {
        customToken?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Student registration failed.");
      }
      if (!result.customToken) {
        throw new Error("The account was created, but automatic sign-in could not start. Sign in using your new password.");
      }
      await completeStudentRegistration(result.customToken);
      toast.success("Account created. Welcome to WBTE.");
      router.replace("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Student registration failed."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="overflow-x-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="container-tight grid min-h-[calc(100svh-4rem)] gap-6 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(540px,1.1fr)] lg:py-8">
        <AuthAside
          eyebrow="Student self-registration"
          title="Create your student account"
          description="Submit your school identity and academic information to open your student dashboard immediately."
          points={[
            "Students create their own account here",
            "Program and department access are validated",
            "Access starts automatically after registration",
          ]}
        />

        <main className="flex min-w-0 items-center justify-center py-4 lg:py-8">
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-2xl rounded-lg bg-slate-50 p-6 shadow-xl shadow-slate-200/60 sm:p-8 dark:bg-slate-900/80 dark:shadow-black/10"
          >
            <>
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 dark:text-blue-300">
                  <GraduationCap className="h-4 w-4" />
                  Students only
                </div>
                <h1 className="mt-4 font-display text-3xl font-medium tracking-normal text-slate-950 dark:text-white sm:text-4xl">
                  Create your WBTE account
                </h1>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Already registered?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-brand-700 hover:text-brand-600 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    Sign in
                  </Link>
                </p>

                <form onSubmit={submit} className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full name" htmlFor="signup-name">
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="signup-name"
                          required
                          minLength={2}
                          autoComplete="name"
                          value={form.displayName}
                          onChange={(event) => setForm({
                            ...form,
                            displayName: event.target.value,
                          })}
                          placeholder="Student full name"
                          className={`${inputClass} pl-10`}
                        />
                      </div>
                    </Field>
                    <Field label="Student number" htmlFor="signup-student-number">
                      <input
                        id="signup-student-number"
                        required
                        value={form.studentNumber}
                        onChange={(event) => setForm({
                          ...form,
                          studentNumber: event.target.value,
                        })}
                        placeholder="Official student ID"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field label="School email" htmlFor="signup-email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="signup-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={form.email}
                        onChange={(event) => setForm({
                          ...form,
                          email: event.target.value,
                        })}
                        placeholder="you@school.edu"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-[1.35fr_0.8fr_0.85fr]">
                    <Field label="Program" htmlFor="signup-program">
                      <select
                        id="signup-program"
                        required
                        value={form.programId}
                        onChange={(event) => setForm({
                          ...form,
                          programId: event.target.value,
                        })}
                        disabled={programsLoading}
                        className={inputClass}
                      >
                        <option value="">
                          {programsLoading ? "Loading Programs..." : "Select Program"}
                        </option>
                        {programs
                          .filter((program) => program.status === "active")
                          .map((program) => (
                            <option key={program.id} value={program.id}>
                              {program.code} - {program.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Year level" htmlFor="signup-year">
                      <select
                        id="signup-year"
                        required
                        value={form.yearLevel}
                        onChange={(event) => setForm({
                          ...form,
                          yearLevel: event.target.value,
                        })}
                        className={inputClass}
                      >
                        <option value="">Select</option>
                        {["1st", "2nd", "3rd", "4th"].map((year) => (
                          <option key={year} value={year}>{year} year</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Section" htmlFor="signup-section">
                      <input
                        id="signup-section"
                        required
                        value={form.section}
                        onChange={(event) => setForm({
                          ...form,
                          section: event.target.value,
                        })}
                        placeholder="A"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  {programsError && (
                    <p className="text-sm text-rose-600">{programsError}</p>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <PasswordField
                      id="signup-password"
                      label="Create password"
                      value={form.password}
                      visible={showPassword}
                      onChange={(password) => setForm({ ...form, password })}
                      onToggle={() => setShowPassword((visible) => !visible)}
                    />
                    <PasswordField
                      id="signup-confirm-password"
                      label="Confirm password"
                      value={form.confirmPassword}
                      visible={showPassword}
                      onChange={(confirmPassword) => setForm({
                        ...form,
                        confirmPassword,
                      })}
                      onToggle={() => setShowPassword((visible) => !visible)}
                    />
                  </div>

                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="signup-website">Website</label>
                    <input
                      id="signup-website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(event) => setForm({
                        ...form,
                        website: event.target.value,
                      })}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submitting
                      || loading
                      || programsLoading
                      || Boolean(programsError)
                    }
                    className="btn-primary w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Submitting registration..." : (
                      <>
                        Create student account
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
                  Your account opens the student dashboard after registration.
                </p>
              </>
          </motion.section>
        </main>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-slate-800 dark:text-slate-200"
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  visible,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="At least 8 characters"
          className={`${inputClass} pl-10 pr-11`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible
            ? <EyeOff className="h-4 w-4" />
            : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
}
