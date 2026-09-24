import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { apiErrorResponse } from "@/lib/server/api-response";
import { ApiError, requireAuthenticatedUser } from "@/lib/server/require-admin";
import { deliverVerificationEmail } from "@/lib/server/verification-email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const decoded = await requireAuthenticatedUser(request);
    const profile = await adminDb.collection("users").doc(decoded.uid).get();
    if (!profile.exists) throw new ApiError(403, "This account is not registered in WBTE.");
    const data = profile.data()!;
    if (data.role !== "hr" && data.role !== "department_head") {
      throw new ApiError(400, "Only HR and department-head accounts require email verification.");
    }
    if (data.status === "disabled") {
      throw new ApiError(403, "This account has been deactivated.");
    }

    const account = await adminAuth.getUser(decoded.uid);
    if (account.emailVerified) return NextResponse.json({ delivery: "verified" });
    if (!account.email || account.email.toLowerCase() !== String(data.email ?? "").toLowerCase()) {
      throw new ApiError(409, "The account email does not match Firebase Authentication.");
    }

    const delivery = await deliverVerificationEmail({
      uid: decoded.uid,
      email: account.email,
      displayName: String(data.displayName ?? account.displayName ?? "Staff member"),
      username: String(data.username ?? ""),
      context: "staff",
    });
    if (delivery === "rate_limited") {
      throw new ApiError(429, "Firebase temporarily blocked verification links. Wait before trying again.");
    }
    if (delivery === "processing") {
      throw new ApiError(429, "A verification request is already in progress. Wait a moment before trying again.");
    }
    if (delivery === "link_unavailable") {
      throw new ApiError(503, "Firebase could not create a verification link. Try again later.");
    }
    if (delivery === "smtp_unavailable") {
      throw new ApiError(503, "The email provider could not deliver the verification email. Contact an administrator.");
    }
    if (delivery === "smtp_rate_limited") {
      throw new ApiError(503, "The email provider's daily sending limit was reached. Contact an administrator or try again later.");
    }
    return NextResponse.json({ delivery });
  } catch (error) {
    return apiErrorResponse(error, "Verification email could not be sent.");
  }
}
