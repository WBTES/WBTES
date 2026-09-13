"use client";

import * as React from "react";
import { Check, Clipboard, Mail, MessageSquareText, Send } from "lucide-react";
import toast from "react-hot-toast";
import { PublicPageHero, PublicReveal } from "@/components/public-page-hero";

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "feedback.wbtes@gmail.com";
const topics = ["General", "Feedback", "Bug report", "Research"] as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600";

export default function ContactPage() {
  const [copied, setCopied] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    topic: "General",
    subject: "",
    message: "",
  });

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      toast.success("Email address copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the email address");
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Message could not be sent.");
      toast.success("Message sent");
      setForm({
        name: "",
        email: "",
        topic: "General",
        subject: "",
        message: "",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicPageHero
        eyebrow="Questions, issues, and project feedback"
        title="Contact WBTE"
        statement="Good evaluation work starts with clear communication."
        description="Share a workflow question, usability observation, bug report, or research note with the WBTE project."
        nextHref="#message"
      >
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="btn w-fit bg-slate-950 px-6 py-3 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-50"
        >
          <Mail className="h-4 w-4" />
          Email WBTE
        </a>
      </PublicPageHero>

      <section id="message" className="scroll-mt-20 bg-white py-24 dark:bg-slate-950 sm:py-28 lg:py-32">
        <div className="container-tight grid items-start gap-12 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16">
          <PublicReveal>
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-100 text-brand-700 dark:bg-slate-900 dark:text-blue-300">
              <Mail className="h-5 w-5" />
            </div>
            <p className="mt-7 text-xs font-semibold uppercase text-brand-700 dark:text-blue-300">Direct contact</p>
            <h2 className="mt-3 font-display text-4xl font-medium leading-tight tracking-normal text-slate-950 dark:text-white">
              Tell us what you found.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Use email for feature questions, bug details, usability feedback, or research
              discussion.
            </p>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-7 block break-all font-display text-xl tracking-normal text-slate-950 hover:text-brand-700 dark:text-white dark:hover:text-blue-200"
            >
              {CONTACT_EMAIL}
            </a>
            <button
              type="button"
              onClick={copyEmail}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-950 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy address"}
            </button>

            <div className="mt-10">
              <p className="text-xs font-semibold uppercase text-slate-500">Helpful details</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                {[
                  "The page or workflow involved",
                  "What you expected to happen",
                  "What happened instead",
                  "A screenshot when reporting a visual issue",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-blue-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </PublicReveal>

          <PublicReveal delay={0.08}>
            <form
              onSubmit={onSubmit}
              className="rounded-lg bg-slate-50 p-6 shadow-xl shadow-slate-200/60 dark:bg-slate-900/80 dark:shadow-black/10 sm:p-8"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-blue-300">
                  <MessageSquareText className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-medium tracking-normal text-slate-950 dark:text-white">
                    Send a message
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Your message is delivered securely to the WBTE contact address.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <Field
                  id="contact-name"
                  label="Full name"
                  value={form.name}
                  onChange={(value) => setForm({ ...form, name: value })}
                  autoComplete="name"
                  placeholder="Jane Doe"
                />
                <Field
                  id="contact-email"
                  label="Reply email"
                  type="email"
                  value={form.email}
                  onChange={(value) => setForm({ ...form, email: value })}
                  autoComplete="email"
                  placeholder="you@school.edu"
                />
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">Topic</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-200 p-1 dark:bg-slate-950 sm:grid-cols-4">
                  {topics.map((topic) => {
                    const selected = form.topic === topic;
                    return (
                      <button
                        type="button"
                        key={topic}
                        aria-pressed={selected}
                        onClick={() => setForm({ ...form, topic })}
                        className={`min-h-10 rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
                          selected
                            ? "bg-brand-600 text-white"
                            : "text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-5">
                <Field
                  id="contact-subject"
                  label="Subject"
                  value={form.subject}
                  onChange={(value) => setForm({ ...form, subject: value })}
                  placeholder="Short summary"
                />
              </div>

              <div className="mt-5">
                <label htmlFor="contact-message" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  required
                  value={form.message}
                  onChange={(event) => setForm({ ...form, message: event.target.value })}
                  rows={7}
                  placeholder="Describe your question, observation, or suggestion..."
                  className={`mt-2 resize-y ${inputClass}`}
                />
              </div>

              <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500">Replies are sent to the email address above.</p>
                <button type="submit" disabled={submitting} className="btn-primary px-6 py-3 text-sm disabled:opacity-60">
                  {submitting ? "Sending..." : "Send message"} <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </PublicReveal>
        </div>
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`mt-2 ${inputClass}`}
      />
    </div>
  );
}
