"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";
import type { UserRole } from "@/lib/types";

export function RoleGuard({
  allow,
  children,
  redirectTo,
}: {
  allow: UserRole[];
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (profile?.status === "pending") {
      router.push("/login?pending=1");
      return;
    }
    if (profile?.status === "disabled") {
      router.push("/login?disabled=1");
      return;
    }
    if (profile && !allow.includes(profile.role)) {
      router.push(redirectTo ?? "/dashboard");
    }
  }, [user, profile, loading, allow, redirectTo, router]);

  if (
    loading
    || !user
    || !profile
    || profile.status === "pending"
    || profile.status === "disabled"
    || !allow.includes(profile.role)
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }
  return <>{children}</>;
}
