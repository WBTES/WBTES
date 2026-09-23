"use client";

import * as React from "react";
import { Pencil, Trash2, Plus, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  onEdit,
  onDelete,
  empty = "No records yet",
  searchKeys = [],
  getId,
}: {
  rows: T[];
  columns: Column<T>[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  empty?: string;
  searchKeys?: (keyof T)[];
  getId?: (row: T) => string;
}) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    if (!q || searchKeys.length === 0) return rows;
    const ql = q.toLowerCase();
    return rows.filter((r) =>
      searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(ql))
    );
  }, [q, rows, searchKeys]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {searchKeys.length > 0 && (
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-max min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500", c.className)}
                >
                  {c.label}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={getId ? getId(row) : ((row as Record<string, unknown>).id as string) ?? idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  {columns.map((c) => (
                    <td key={String(c.key)} className={cn("px-4 py-3", c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key as string] ?? "")}
                    </td>
                  ))}
                  {(onEdit || onDelete) && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                            title="Edit"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                            title="Delete"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {action && <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  contentClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  contentClassName?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={cn(
              "fixed inset-x-3 top-[3dvh] z-50 mx-auto flex max-h-[94dvh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:inset-x-4 sm:top-[5dvh] sm:max-h-[90dvh]",
              size === "sm" && "sm:max-w-sm",
              size === "md" && "sm:max-w-lg",
              size === "lg" && "sm:max-w-3xl"
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
              <h2 className="min-w-0 text-base font-semibold sm:text-lg">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6", contentClassName)}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900";
