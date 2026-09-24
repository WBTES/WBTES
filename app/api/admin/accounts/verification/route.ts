import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse, asString } from "@/lib/server/api-response";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";
import { deliverVerificationEmail } from "@/lib/server/verification-email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json() as { uid?: unknown };
    const uid = asString(body.uid, "Staff account", 200);
    const reference = adminDb.collection("users").doc(uid);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new ApiError(404, "Staff account was not found.");

    const profile = snapshot.data()!;
    if (profile.role !== "hr" && profile.role !== "department_head") {
      throw new ApiError(400, "Only HR and department-head accounts require email verification.");
    }
    if (profile.status === "disabled") {
      throw new ApiError(409, "Reactivate this account before sending verification email.");
    }

    const account = await adminAuth.getUser(uid);
    if (account.emailVerified) {
      if (!profile.emailVerified) {
        await reference.update({ emailVerified: true, updatedAt: Date.now() });
      }
      return NextResponse.json({ delivery: "verified" });
    }
    if (!account.email || account.email.toLowerCase() !== String(profile.email ?? "").toLowerCase()) {
      throw new ApiError(409, "The staff email does not match Firebase Authentication.");
    }

    const delivery = await deliverVerificationEmail(request, {
      uid,
      email: account.email,
      displayName: String(profile.displayName ?? account.displayName ?? "Staff member"),
      context: "staff",
    });
    if (delivery === "unavailable") {
      throw new ApiError(503, "Verification email could not be sent. Check SMTP settings and server logs, then retry.");
    }
    return NextResponse.json({ delivery });
  } catch (error) {
    return apiErrorResponse(error, "Verification email could not be sent.");
  }
}
