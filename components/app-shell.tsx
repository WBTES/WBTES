"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  ListTree,
  BookOpen,
  ClipboardList,
  FileCheck2,
  Calendar,
  Megaphone,
  BarChart3,
  MessageSquareText,
  FileDown,
  GraduationCap,
  UserCog,
  Star,
  CheckCircle2,
  History,
  DatabaseBackup,
  Settings,
  LogOut,
  Menu,
  Bell,
  ChevronDown,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/firebase/auth-context";
import { cn, formatRoleLabel } from "@/lib/utils";
import toast from "react-hot-toast";
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type {
  AdminNavigationStatus,
  Notification,
  UserRole,
} from "@/lib/types";
import {
  authenticatedFetch,
  readApiResponse,
} from "@/lib/authenticated-fetch";
import {
  ADMIN_NAVIGATION_REFRESH_EVENT,
  requestAdminNavigationRefresh,
} from "@/lib/admin-navigation";
import { BrandMark } from "@/components/brand-mark";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: Record<UserRole, NavItem[]> = {
  admin: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/progress", label: "Progress", icon: CheckCircle2 },
    { href: "/admin/teachers", label: "Teachers", icon: GraduationCap },
    { href: "/admin/departments", label: "Departments", icon: Building2 },
    { href: "/admin/programs", label: "Programs", icon: ListTree },
    { href: "/admin/subjects", label: "Subjects", icon: BookOpen },
    { href: "/admin/questions", label: "Questions", icon: ClipboardList },
    { href: "/admin/forms", label: "Forms", icon: FileCheck2 },
    { href: "/admin/periods", label: "Schedules", icon: Calendar },
    { href: "/admin/assignments", label: "Assignments", icon: UserCog },
    { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/reports", label: "Reports", icon: FileDown },
    { href: "/admin/audit", label: "Audit Logs", icon: History },
    { href: "/admin/data", label: "Backup", icon: DatabaseBackup },
  ],
  student: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/student/evaluations", label: "My Evaluations", icon: Star },
    { href: "/student/history", label: "History", icon: History },
    { href: "/student/announcements", label: "Announcements", icon: Megaphone },
  ],
  hr: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/hr/teachers", label: "My Teachers", icon: Users },
    { href: "/hr/comparison", label: "Compare", icon: BarChart3 },
    { href: "/hr/comments", label: "Comments", icon: MessageSquareText },
    { href: "/hr/reports", label: "Reports", icon: FileDown },
    { href: "/hr/announcements", label: "Announcements", icon: Megaphone },
  ],
  department_head: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/department-head/reports", label: "School-wide Reports", icon: BarChart3 },
    { href: "/department-head/announcements", label: "Announcements", icon: Megaphone },
  ],
};

type NavIndicator = {
  kind: "count" | "dot";
  value?: number;
  label: string;
  tone: "amber" | "rose";
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, configured, signOut } = useAuth();
  const userId = user?.uid;
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifs, setNotifs] = React.useState<Notification[]>([]);
  const [adminNavigationStatus, setAdminNavigationStatus] =
    React.useState<AdminNavigationStatus | null>(null);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const notifRef = React.useRef<HTMLDivElement>(null);

  const toggleTheme = React.useCallback(() => {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(nextTheme);
    root.style.colorScheme = nextTheme;
    window.localStorage.setItem("wbtes-theme", nextTheme);
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  // Close menus on outside click
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(t)) setUserMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(t)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  React.useEffect(() => setMounted(true), []);

  // Guard
  React.useEffect(() => {
    if (loading) return;
    if (!configured) {
      toast.error("Firebase is not configured. Check .env.local.");
      return;
    }
    if (!user) {
      router.push("/login");
    }
  }, [user, loading, configured, router]);

  React.useEffect(() => {
    if (!userId || profile?.role !== "admin") {
      setAdminNavigationStatus(null);
      return;
    }

    let active = true;
    let inFlight = false;
    let lastLoadedAt = 0;
    const loadStatus = async () => {
      if (inFlight || Date.now() - lastLoadedAt < 2_000) return;
      inFlight = true;
      try {
        const response = await authenticatedFetch(
          "/api/admin/navigation-status"
        );
        const status = await readApiResponse<AdminNavigationStatus>(response);
        if (active) {
          setAdminNavigationStatus(status);
          lastLoadedAt = Date.now();
        }
      } catch (error) {
        if (active) {
          console.warn(
            "Admin navigation status could not be refreshed:",
            error
          );
        }
      } finally {
        inFlight = false;
      }
    };
    const refresh = () => void loadStatus();

    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener(ADMIN_NAVIGATION_REFRESH_EVENT, refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(ADMIN_NAVIGATION_REFRESH_EVENT, refresh);
    };
  }, [pathname, profile?.role, userId]);

  // Live notifications
  React.useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "notifications"), where("userId", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Notification, "id">) }));
        list.sort((a, b) => b.createdAt - a.createdAt);
        setNotifs(list);
        setUnread(list.filter((n) => !n.read).length);
        if (profile?.role === "admin") {
          requestAdminNavigationRefresh();
        }
      },
      (err) => {
        // Silently ignore — usually means the rule denied the read.
        // We don't want to crash the shell over a notifications glitch.
        console.warn("notifications subscription error:", err.message);
      }
    );
    return () => unsub();
  }, [profile?.role, user]);

  React.useEffect(() => {
    if (
      !user
      || !profile
      || profile.status === "pending"
      || profile.status === "disabled"
    ) return;
    const run = async () => {
      try {
        await authenticatedFetch("/api/maintenance/run", { method: "POST" });
        if (profile.role === "admin") {
          requestAdminNavigationRefresh();
        }
      } catch (error) {
        console.warn("Maintenance heartbeat failed:", error);
      }
    };
    void run();
    const timer = window.setInterval(run, 60_000);
    return () => window.clearInterval(timer);
  }, [profile, user]);

  const openNotification = async (notification: Notification) => {
    try {
      if (!notification.read) {
        await updateDoc(doc(db, "notifications", notification.id), { read: true });
        toast.success("Notification marked as read");
      }
      setNotifOpen(false);
      if (notification.link) router.push(notification.link);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notification could not be updated");
    }
  };

  const markAllNotificationsRead = async () => {
    const pending = notifs.filter((notification) => !notification.read);
    if (pending.length === 0) return;
    try {
      const batch = writeBatch(db);
      pending.forEach((notification) => batch.update(doc(db, "notifications", notification.id), { read: true }));
      await batch.commit();
      toast.success("All notifications marked as read");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notifications could not be updated");
    }
  };

  if (loading || !user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-slate-500">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  const onSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out");
      router.push("/login");
    } catch {
      toast.error("Sign out failed");
    }
  };

  const items = NAV[profile.role] || [];

  return (
    <div className="flex min-h-screen min-w-0 bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[min(18rem,calc(100vw-2rem))] transform border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:relative lg:w-64 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5 dark:border-slate-800">
          <BrandMark className="h-8 w-8" iconClassName="h-4 w-4" />
          <span className="text-lg font-bold text-slate-900 dark:text-white">WBTE</span>
          <span className="ml-auto inline-flex h-5 items-center rounded-full bg-brand-50 px-2 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            {formatRoleLabel(profile.role)}
          </span>
        </div>

        <nav className="flex max-h-[calc(100vh-10.5rem)] flex-col gap-0.5 overflow-y-auto p-3 pb-6">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const indicator = profile.role === "admin"
              ? getAdminNavIndicator(item.href, adminNavigationStatus)
              : null;
            const destination = getAdminNavDestination(
              item.href,
              indicator
            );
            return (
              <Link
                key={item.href}
                href={destination}
                onClick={() => setSidebarOpen(false)}
                aria-label={indicator
                  ? `${item.label}: ${indicator.label}`
                  : item.label}
                title={indicator?.label}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {indicator && <NavigationIndicator indicator={indicator} />}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-slate-200 p-3 dark:border-slate-800">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <button
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            onClick={toggleTheme}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {mounted && (resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
          </button>
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen((v) => !v); setUserMenuOpen(false); }}
              className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 max-h-[min(24rem,calc(100dvh-5rem))] w-[min(20rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notifications</p>
                  {unread > 0 && (
                    <button onClick={markAllNotificationsRead} className="text-xs font-medium text-brand-600 dark:text-brand-400">
                      Mark all read
                    </button>
                  )}
                </div>
                {notifs.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500">No notifications yet</p>
                ) : (
                  notifs.slice(0, 20).map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => openNotification(n)}
                      className={cn(
                        "w-full rounded-xl px-3 py-2.5 text-left text-sm",
                        n.read ? "text-slate-600 dark:text-slate-400" : "bg-brand-50 dark:bg-brand-500/10"
                      )}
                    >
                      <p className="font-medium">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs opacity-80">{n.body}</p>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => { setUserMenuOpen((v) => !v); setNotifOpen(false); }}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-2 py-1 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {profile.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-800">
                  {profile.displayName?.[0]?.toUpperCase() ?? "U"}
                </div>
              )}
              <span className="hidden text-sm font-medium sm:inline">{profile.displayName}</span>
              <ChevronDown className={cn("hidden h-3.5 w-3.5 text-slate-400 transition-transform sm:inline", userMenuOpen && "rotate-180")} />
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                  <p className="truncate text-sm font-semibold">{profile.displayName}</p>
                  <p className="truncate text-xs text-slate-500">{profile.email}</p>
                  <p className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    {formatRoleLabel(profile.role)}
                  </p>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" />
                  Profile settings
                </Link>
                <button
                  onClick={() => { setUserMenuOpen(false); onSignOut(); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function getAdminNavIndicator(
  href: string,
  status: AdminNavigationStatus | null
): NavIndicator | null {
  if (!status) return null;
  if (href === "/admin/users" && status.pendingStudents > 0) {
    return {
      kind: "count",
      value: status.pendingStudents,
      label: `${status.pendingStudents} legacy student account${status.pendingStudents === 1 ? "" : "s"} pending first sign-in`,
      tone: "amber",
    };
  }
  if (href === "/admin/progress" && status.overdueEvaluations > 0) {
    return {
      kind: "count",
      value: status.overdueEvaluations,
      label: `${status.overdueEvaluations} overdue evaluation${status.overdueEvaluations === 1 ? "" : "s"}`,
      tone: "rose",
    };
  }
  if (href === "/admin/periods" && status.scheduleActions > 0) {
    return {
      kind: "dot",
      label: `${status.scheduleActions} evaluation period transition${status.scheduleActions === 1 ? "" : "s"} due`,
      tone: "amber",
    };
  }
  if (href === "/admin/data" && status.backupWarning) {
    const labels: Record<
      Exclude<AdminNavigationStatus["backupIssue"], null>,
      string
    > = {
      missing: "No backup has been created",
      failed: "The latest backup failed",
      stale: "The latest backup is more than 36 hours old",
      stuck: "Backup creation appears to be stuck",
    };
    return {
      kind: "dot",
      label: status.backupIssue
        ? labels[status.backupIssue]
        : "Backup requires attention",
      tone: "rose",
    };
  }
  return null;
}

function getAdminNavDestination(
  href: string,
  indicator: NavIndicator | null
) {
  if (!indicator) return href;
  if (href === "/admin/users") return `${href}?status=pending`;
  if (href === "/admin/progress") return `${href}?status=overdue`;
  return href;
}

function NavigationIndicator({
  indicator,
}: {
  indicator: NavIndicator;
}) {
  const tone = indicator.tone === "rose"
    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
    : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";

  if (indicator.kind === "dot") {
    return (
      <span
        aria-hidden="true"
        className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center"
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            indicator.tone === "rose" ? "bg-rose-500" : "bg-amber-500"
          )}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
        tone
      )}
    >
      {(indicator.value ?? 0) > 99 ? "99+" : indicator.value}
    </span>
  );
}
