import "server-only";

import { adminAuth, adminDb, adminReady } from "@/lib/firebase/admin";
import type { AppUser, UserRole } from "@/lib/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAuthenticatedUser(request: Request) {
  if (!adminReady) throw new ApiError(503, "Firebase Admin credentials are not configured on the server.");
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new ApiError(401, "Sign in again before using this action.");

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    throw new ApiError(401, "Your session is invalid or expired. Sign in again.");
  }
}

export async function requireAuthenticatedAppUser(request: Request) {
  const decoded = await requireAuthenticatedUser(request);
  const snapshot = await adminDb.collection("users").doc(decoded.uid).get();
  if (!snapshot.exists) throw new ApiError(403, "This account is not registered in WBTE.");
  const profile = {
    uid: decoded.uid,
    ...(snapshot.data() as Omit<AppUser, "uid">),
  };
  if (profile.status === "pending") {
    if (profile.role !== "student") {
      throw new ApiError(403, "This staff account is not active. Contact an administrator.");
    }
    const now = Date.now();
    const email = String(profile.email ?? decoded.email ?? "");
    const registryRef = adminDb
      .collection("studentRegistry")
      .doc(encodeURIComponent(email.toLowerCase()));
    const registry = await registryRef.get();
    const batch = adminDb.batch();
    batch.set(snapshot.ref, {
      status: "active",
      emailVerified: true,
      updatedAt: now,
    }, { merge: true });
    if (registry.exists) {
      batch.set(registryRef, { status: "active", updatedAt: now }, { merge: true });
    }
    await batch.commit();
    await adminAuth.setCustomUserClaims(decoded.uid, {
      role: "student",
      status: "active",
      departmentId: profile.departmentId ?? null,
    });
    profile.status = "active";
    profile.emailVerified = true;
    profile.updatedAt = now;
  }
  if (profile.status === "disabled") {
    throw new ApiError(403, "This account has been deactivated. Contact an administrator.");
  }
  if ((profile.role === "hr" || profile.role === "department_head") && !decoded.email_verified) {
    throw new ApiError(403, "Verify your staff email before using WBTE.");
  }
  if (
    (profile.role === "student" || profile.role === "admin")
    && (!profile.emailVerified || !decoded.email_verified)
  ) {
    await adminAuth.updateUser(decoded.uid, { emailVerified: true });
    await snapshot.ref.set({
      emailVerified: true,
      updatedAt: Date.now(),
    }, { merge: true });
    profile.emailVerified = true;
  }
  return { decoded, profile };
}

export async function requireRole(request: Request, roles: UserRole[]) {
  const user = await requireAuthenticatedAppUser(request);
  if (!roles.includes(user.profile.role)) {
    throw new ApiError(403, "You do not have permission to use this action.");
  }
  return user;
}

export async function requireAdmin(request: Request) {
  const { decoded, profile } = await requireRole(request, ["admin"]);
  return {
    uid: decoded.uid,
    email: String(profile.email ?? decoded.email ?? ""),
    profile,
  };
}

export async function requireAdminOrDepartmentHead(request: Request) {
  return requireRole(request, ["admin", "department_head"]);
}

export async function requireDepartmentStaff(request: Request) {
  return requireRole(request, ["admin", "hr", "department_head"]);
}
