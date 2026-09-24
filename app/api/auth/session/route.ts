import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";
import {
  apiErrorResponse,
  emailDocumentId,
  normalizeEmail,
  optionalString,
} from "@/lib/server/api-response";
import {
  ApiError,
  requireAuthenticatedUser,
} from "@/lib/server/require-admin";
import { assertAllowedSchoolEmail } from "@/lib/server/school-email";
import { deliverVerificationEmail } from "@/lib/server/verification-email";
import type { AppUser } from "@/lib/types";

export const runtime = "nodejs";

type SessionBody = {
  method?: "password" | "google" | "resume";
  mode?: "login" | "claim";
  eventId?: string;
};

export async function POST(request: Request) {
  try {
    const decoded = await requireAuthenticatedUser(request);
    const body = await request.json() as SessionBody;
    const method = body.method ?? "resume";
    const mode = body.mode ?? "login";
    const email = normalizeEmail(decoded.email);
    const userRef = adminDb.collection("users").doc(decoded.uid);
    let userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      const registryRef = adminDb
        .collection("studentRegistry")
        .doc(emailDocumentId(email));
      const registrySnapshot = await registryRef.get();
      if (!registrySnapshot.exists || registrySnapshot.data()?.status === "disabled") {
        throw new ApiError(
          403,
          "This email has no WBTE student registration. Use Create account before signing in."
        );
      }
      const registry = registrySnapshot.data()!;
      const now = Date.now();
      const registryStatus = registry.status === "pending"
        ? "pending"
        : "active";
      const profile: Omit<AppUser, "uid"> = {
        email,
        emailNormalized: email,
        displayName: String(registry.displayName ?? decoded.name ?? email),
        role: "student",
        studentNumber: String(registry.studentNumber ?? ""),
        programId: String(registry.programId ?? "") || null,
        departmentId: String(registry.departmentId ?? "") || null,
        course: String(registry.course ?? ""),
        yearLevel: String(registry.yearLevel ?? ""),
        section: String(registry.section ?? ""),
        photoURL: optionalString(decoded.picture) || null,
        status: registryStatus,
        emailVerified: Boolean(decoded.email_verified),
        createdAt: now,
        updatedAt: now,
      };
      const batch = adminDb.batch();
      batch.set(userRef, profile);
      batch.set(registryRef, {
        claimedUid: decoded.uid,
        updatedAt: now,
      }, { merge: true });
      await batch.commit();
      userSnapshot = await userRef.get();
    }

    let profile = userSnapshot.data() as Omit<AppUser, "uid">;
    let profileStatus = profile.status ?? "active";
    if (profile.status === "disabled") {
      await adminAuth.revokeRefreshTokens(decoded.uid);
      throw new ApiError(403, "This account has been deactivated. Contact an administrator.");
    }
    if (profileStatus === "pending") {
      if (profile.role !== "student") {
        throw new ApiError(403, "This staff account is not active. Contact an administrator.");
      }
      const registryRef = adminDb
        .collection("studentRegistry")
        .doc(emailDocumentId(email));
      const registrySnapshot = await registryRef.get();
      const now = Date.now();
      const batch = adminDb.batch();
      batch.set(userRef, {
        status: "active",
        emailVerified: true,
        updatedAt: now,
      }, { merge: true });
      if (registrySnapshot.exists) {
        batch.set(registryRef, { status: "active", updatedAt: now }, { merge: true });
      }
      await batch.commit();
      profile = {
        ...profile,
        status: "active",
        emailVerified: true,
        updatedAt: now,
      };
      profileStatus = "active";
    }
    if (method === "google" && profile.role !== "student") {
      throw new ApiError(403, "Google school login is available to students only.");
    }
    if (
      mode !== "claim"
      && (profile.role === "hr" || profile.role === "department_head")
      && !decoded.email_verified
    ) {
      const delivery = mode === "login" && method === "password"
        ? await deliverVerificationEmail(request, {
            uid: decoded.uid,
            email,
            displayName: profile.displayName,
            context: "staff",
          })
        : "not_attempted";
      const instruction = delivery === "sent"
        ? "A new verification link was sent to your inbox."
        : delivery === "recent"
          ? "A verification link was sent recently; check your inbox and spam folder."
          : delivery === "rate_limited"
            ? "Firebase temporarily blocked new verification links. Wait before trying again or use a link already in your inbox."
          : "Open the verification email issued for your account or contact an administrator.";
      throw new ApiError(
        403,
        `Verify your staff email before signing in. ${instruction}`
      );
    }

    if (profile.role === "student") {
      assertAllowedSchoolEmail(email);
      await ensureStudentRegistry(decoded.uid, profile, email);
    }
    if (
      (profile.role === "student" || profile.role === "admin")
      && !decoded.email_verified
    ) {
      await adminAuth.updateUser(decoded.uid, { emailVerified: true });
    }

    const now = Date.now();
    const emailVerified = profile.role === "student"
      || profile.role === "admin"
      || Boolean(decoded.email_verified);
    await userRef.set({
      email,
      emailNormalized: email,
      emailVerified,
      lastLoginAt: mode === "login" ? now : profile.lastLoginAt ?? null,
      updatedAt: now,
    }, { merge: true });
    await adminAuth.setCustomUserClaims(decoded.uid, {
      role: profile.role,
      status: profileStatus,
      departmentId: profile.departmentId ?? null,
    });

    if (mode === "login" && method !== "resume") {
      await recordSuccessfulLogin(request, {
        uid: decoded.uid,
        email,
        displayName: profile.displayName,
        role: profile.role,
        method,
        eventId: optionalString(body.eventId, 100),
      });
    }

    return NextResponse.json({
      profile: {
        uid: decoded.uid,
        ...profile,
        email,
        emailNormalized: email,
        emailVerified,
        lastLoginAt: mode === "login" ? now : profile.lastLoginAt,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Account verification failed.");
  }
}

async function ensureStudentRegistry(
  uid: string,
  profile: Omit<AppUser, "uid">,
  email: string
) {
  const registryRef = adminDb
    .collection("studentRegistry")
    .doc(emailDocumentId(email));
  const registry = await registryRef.get();
  if (registry.exists) {
    if (registry.data()?.status === "disabled") {
      throw new ApiError(403, "This student registration has been deactivated.");
    }
    if (
      registry.data()?.claimedUid
      && registry.data()?.claimedUid !== uid
    ) {
      throw new ApiError(409, "This school email is already linked to another account.");
    }
    await registryRef.set({ claimedUid: uid, updatedAt: Date.now() }, { merge: true });
    return;
  }

  // Existing student profiles are migrated into the registry once.
  if (!profile.programId || !profile.departmentId) {
    throw new ApiError(
      403,
      "Your student record is incomplete. Ask an administrator to assign your Program."
    );
  }
  await registryRef.set({
    email,
    emailNormalized: email,
    displayName: profile.displayName,
    studentNumber: profile.studentNumber ?? "",
    programId: profile.programId,
    departmentId: profile.departmentId,
    course: profile.course ?? "",
    yearLevel: profile.yearLevel ?? "",
    section: profile.section ?? "",
    status: "active",
    claimedUid: uid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function recordSuccessfulLogin(
  request: Request,
  input: {
    uid: string;
    email: string;
    displayName: string;
    role: string;
    method: string;
    eventId: string;
  }
) {
  const eventId = input.eventId || `${input.uid}_${Date.now()}`;
  const eventRef = adminDb.collection("loginEvents").doc(eventId);
  const created = await adminDb.runTransaction(async (transaction) => {
    const event = await transaction.get(eventRef);
    if (event.exists) return false;
    transaction.create(eventRef, {
      userId: input.uid,
      method: input.method,
      createdAt: Date.now(),
    });
    return true;
  });
  if (!created) return;

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "Unavailable";
  const userAgent = request.headers.get("user-agent") ?? "Unavailable";
  const createdAt = Date.now();
  await adminDb.collection("activityLogs").add({
    userId: input.uid,
    userEmail: input.email,
    userRole: input.role,
    action: "login",
    metadata: {
      method: input.method,
      ipAddress,
      userAgent: userAgent.slice(0, 300),
    },
    ipAddress,
    createdAt,
  });
  await adminDb.collection("notifications").doc(`login_${eventId}`).set({
    userId: input.uid,
    type: "login",
    title: "Successful sign-in",
    body: `Your account was accessed using ${input.method} sign-in.`,
    read: false,
    createdAt,
    link: "/profile",
  });

  if (!isSmtpConfigured()) return;
  try {
    await sendSmtpEmail({
      to: input.email,
      subject: "WBTE successful sign-in",
      text: [
        `Hello ${input.displayName},`,
        "",
        "Your WBTE account was signed in successfully.",
        `Method: ${input.method}`,
        `Time: ${new Date(createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
        `IP address: ${ipAddress}`,
        "",
        "If this was not you, reset your password and contact your administrator.",
      ].join("\n"),
    });
  } catch (error) {
    console.warn("Login email delivery failed:", error);
  }
}
