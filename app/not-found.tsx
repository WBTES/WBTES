"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-brand-300/30 via-fuchsia-300/20 to-transparent blur-3xl" />
      </div>
      <div className="container-tight flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-16 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="badge"
        >
          404 — Not found
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6 text-5xl font-extrabold tracking-tight sm:text-7xl"
        >
          <span className="text-gradient">Lost?</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 max-w-md text-slate-600 dark:text-slate-400"
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Link href="/" className="btn-primary px-6 py-3 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <Link href="/features" className="btn-secondary px-6 py-3 text-sm">
            <Search className="h-4 w-4" /> Browse features
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
