import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";
import {
  apiErrorResponse,
  asString,
  normalizeEmail,
  optionalString,
} from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";
import {
  generateWbtesVerificationLink,
  verificationSignInUrl,
} from "@/lib/server/verification-email";
import type { AppUser, UserRole } from "@/lib/types";

type StaffRole = Extract<UserRole, "admin" | "hr" | "department_head">;

export const runtime = "nodejs";

type AccountBody = {
  uid?: unknown;
  email?: unknown;
  displayName?: unknown;
  username?: unknown;
  password?: unknown;
  role?: unknown;
  departmentId?: unknown;
  employeeId?: unknown;
  status?: unknown;
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const snapshot = await adminDb.collection("users").orderBy("displayName").get();
    const accounts = snapshot.docs
      .map((item) => ({ uid: item.id, ...item.data() }) as AppUser)
      .filter((item) => ["admin", "hr", "department_head"].includes(item.role));
    return NextResponse.json({ accounts });
  } catch (error) {
    return apiErrorResponse(error, "Staff accounts could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as AccountBody;
    const input = await validateAccountInput(body);
    const password = asString(body.password, "Temporary password", 200);
    if (password.length < 8) {
      throw new ApiError(400, "Temporary password must contain at least 8 characters.");
    }
    await ensureUsernameAvailable(input.usernameNormalized);
    const requiresVerification = input.role === "hr" || input.role === "department_head";

    const created = await adminAuth.createUser({
      email: input.email,
      password,
      displayName: input.displayName,
      disabled: false,
      emailVerified: !requiresVerification,
    });
    try {
      await adminDb.collection("users").doc(created.uid).set({
        ...input,
        status: "active",
        photoURL: null,
        emailVerified: !requiresVerification,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await syncDepartmentStaff(null, input.role, null, input.departmentId, created.uid);
      await adminAuth.setCustomUserClaims(created.uid, {
        role: input.role,
        status: "active",
        departmentId: input.departmentId || null,
      });
    } catch (error) {
      await adminAuth.deleteUser(created.uid);
      throw error;
    }

    let emailed = false;
    let warning = "";
    if (requiresVerification && isSmtpConfigured()) {
      try {
        const verificationLink = await generateWbtesVerificationLink(
          input.email,
          "staff"
        );
        const signInUrl = verificationSignInUrl();
        await sendSmtpEmail({
          to: input.email,
          subject: `Verify your WBTE ${staffRoleLabel(input.role)} account`,
          text: [
            `Hello ${input.displayName},`,
            "",
            `Your ${staffRoleLabel(input.role)} account is ready.`,
            `Username: ${input.username}`,
            `Verify your email: ${verificationLink}`,
            ...(signInUrl
              ? [`Sign in: ${signInUrl}`]
              : ["After verification, return to the WBTE sign-in page on the computer running the local server."]),
          ].join("\n"),
        });
        emailed = true;
      } catch (error) {
        warning = error instanceof Error ? error.message : "Verification email failed.";
      }
    } else if (requiresVerification) {
      warning = "Staff account created, but SMTP is not configured for the verification email.";
    }
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "staff_account_created",
      metadata: {
        targetUid: created.uid,
        role: input.role,
        departmentId: input.departmentId || null,
      },
    });
    return NextResponse.json({ uid: created.uid, emailed, warning: warning || undefined });
  } catch (error) {
    return apiErrorResponse(error, "Staff account creation failed.");
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as AccountBody;
    const uid = asString(body.uid, "Account", 200);
    const existingRef = adminDb.collection("users").doc(uid);
    const existingSnapshot = await existingRef.get();
    if (!existingSnapshot.exists) throw new ApiError(404, "Staff account was not found.");
    const existing = existingSnapshot.data()!;
    const input = await validateAccountInput({
      ...body,
      email: existing.email,
    });
    const status = body.status === "disabled" ? "disabled" : "active";
    if (
      input.usernameNormalized !== existing.usernameNormalized
    ) {
      await ensureUsernameAvailable(input.usernameNormalized, uid);
    }
    if (uid === admin.uid && (status === "disabled" || input.role !== "admin")) {
      throw new ApiError(409, "You cannot deactivate or remove your own administrator role.");
    }
    const existingAuth = await adminAuth.getUser(uid);
    const becameVerifiedStaff = !["hr", "department_head"].includes(existing.role)
      && ["hr", "department_head"].includes(input.role);
    const emailVerified = ["hr", "department_head"].includes(input.role)
      ? (becameVerifiedStaff ? false : existingAuth.emailVerified)
      : true;

    await existingRef.update({
      ...input,
      status,
      emailVerified,
      updatedAt: Date.now(),
    });
    await adminAuth.updateUser(uid, {
      displayName: input.displayName,
      disabled: status === "disabled",
      emailVerified,
    });
    await adminAuth.setCustomUserClaims(uid, {
      role: input.role,
      status,
      departmentId: input.departmentId || null,
    });
    if (status === "disabled") await adminAuth.revokeRefreshTokens(uid);
    await syncDepartmentStaff(
      existing.role as UserRole,
      input.role,
      optionalString(existing.departmentId, 200),
      input.departmentId,
      uid
    );
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: status === "disabled" ? "staff_account_deactivated" : "staff_account_updated",
      metadata: { targetUid: uid, role: input.role, status },
    });
    let warning = "";
    if (becameVerifiedStaff) {
      if (isSmtpConfigured()) {
        try {
          const verificationLink = await generateWbtesVerificationLink(
            input.email,
            "staff"
          );
          const signInUrl = verificationSignInUrl();
          await sendSmtpEmail({
            to: input.email,
            subject: `Verify your WBTE ${staffRoleLabel(input.role)} account`,
            text: [
              `Hello ${input.displayName},`,
              "",
              `Your account role was changed to ${staffRoleLabel(input.role)}.`,
              `Verify your email: ${verificationLink}`,
              ...(signInUrl ? [`Sign in: ${signInUrl}`] : []),
            ].join("\n"),
          });
        } catch (error) {
          warning = error instanceof Error ? error.message : "Staff verification email failed.";
        }
      } else {
        warning = "The staff role changed, but SMTP is not configured for the verification email.";
      }
    }
    return NextResponse.json({ ok: true, warning: warning || undefined });
  } catch (error) {
    return apiErrorResponse(error, "Staff account update failed.");
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const uid = asString(new URL(request.url).searchParams.get("uid"), "Account", 200);
    if (uid === admin.uid) throw new ApiError(409, "You cannot delete your own account.");
    const reference = adminDb.collection("users").doc(uid);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new ApiError(404, "Staff account was not found.");
    const data = snapshot.data()!;
    if (data.role === "student") {
      throw new ApiError(400, "Delete students from Student Management.");
    }
    if (data.role === "admin") {
      throw new ApiError(409, "Administrator accounts cannot be deleted from WBTE.");
    }
    await syncDepartmentStaff(
      data.role as UserRole,
      "admin",
      optionalString(data.departmentId, 200),
      "",
      uid
    );
    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      if (!String(error).includes("user-not-found")) throw error;
    }
    await reference.delete();
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "staff_account_deleted",
      metadata: { targetUid: uid, role: String(data.role ?? "") },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Staff account deletion failed.");
  }
}

async function validateAccountInput(body: AccountBody) {
  const email = normalizeEmail(body.email);
  const displayName = asString(body.displayName, "Full name", 150);
  const username = asString(body.username, "Username", 100).toLowerCase();
  if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
    throw new ApiError(
      400,
      "Username must contain at least 3 letters, numbers, dots, underscores, or hyphens."
    );
  }
  const role: StaffRole | null = body.role === "admin" || body.role === "hr" || body.role === "department_head"
    ? body.role
    : null;
  if (!role) throw new ApiError(400, "Select administrator, HR, or department head.");
  const departmentId = "";
  return {
    email,
    emailNormalized: email,
    displayName,
    username,
    usernameNormalized: username,
    role,
    departmentId: departmentId || null,
    employeeId: optionalString(body.employeeId, 100),
  };
}

async function ensureUsernameAvailable(username: string, currentUid = "") {
  const snapshot = await adminDb
    .collection("users")
    .where("usernameNormalized", "==", username)
    .limit(2)
    .get();
  if (snapshot.docs.some((item) => item.id !== currentUid)) {
    throw new ApiError(409, "That username is already in use.");
  }
}

async function syncDepartmentStaff(
  previousRole: UserRole | null,
  nextRole: UserRole,
  previousDepartmentId: string | null,
  nextDepartmentId: string | null,
  uid: string
) {
  const batch = adminDb.batch();
  let changed = false;
  const previousField = departmentRoleField(previousRole);
  const nextField = departmentRoleField(nextRole);
  if (previousField && previousDepartmentId) {
    const oldReference = adminDb.collection("departments").doc(previousDepartmentId);
    const oldSnapshot = await oldReference.get();
    if (oldSnapshot.data()?.[previousField] === uid) {
      batch.update(oldReference, { [previousField]: null, updatedAt: Date.now() });
      changed = true;
    }
  }
  if (nextField && nextDepartmentId) {
    batch.update(adminDb.collection("departments").doc(nextDepartmentId), {
      [nextField]: uid,
      updatedAt: Date.now(),
    });
    changed = true;
  }
  if (changed) await batch.commit();
}

function departmentRoleField(role: UserRole | null) {
  if (role === "hr") return "hrId" as const;
  if (role === "department_head") return "headId" as const;
  return null;
}

function staffRoleLabel(role: StaffRole) {
  if (role === "hr") return "HR";
  if (role === "department_head") return "Department Head";
  return "Administrator";
}
