import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";
import { adminAuth, adminDb, adminReady } from "@/lib/firebase/admin";
import { normalizeEmail } from "@/lib/server/api-response";

export const runtime = "nodejs";

const cooldownMs = 5 * 60_000;

function response() {
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  let email: string;
  try {
    const body = await request.json() as { email?: unknown };
    email = normalizeEmail(body.email);
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!adminReady || !isSmtpConfigured()) {
    return NextResponse.json(
      { error: "Password recovery is temporarily unavailable. Contact an administrator." },
      { status: 503 }
    );
  }

  const requestId = createHash("sha256").update(email).digest("hex");
  const requestRef = adminDb.collection("passwordResetRequests").doc(requestId);
  let claimed = false;

  try {
    const shouldSend = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      if (Number(snapshot.data()?.nextAllowedAt ?? 0) > Date.now()) return false;
      transaction.set(requestRef, { nextAllowedAt: Date.now() + cooldownMs });
      return true;
    });
    if (!shouldSend) return response();
    claimed = true;

    try {
      await adminAuth.getUserByEmail(email);
    } catch (error) {
      if ((error as { code?: string }).code === "auth/user-not-found") {
        return response();
      }
      throw error;
    }

    const resetLink = await adminAuth.generatePasswordResetLink(email);
    await sendSmtpEmail({
      to: email,
      subject: "Reset your WBTE password",
      text: [
        "A password reset was requested for your WBTE account.",
        "",
        "Open this secure link to choose a new password:",
        resetLink,
        "",
        "The link can be opened on any device. After resetting your password, return to the WBTE sign-in page.",
        "If you did not request this, you can ignore this message. Your password will not change.",
      ].join("\n"),
    });
    return response();
  } catch (error) {
    console.error("Password reset delivery failed:", error);
    if (claimed) {
      try {
        await requestRef.delete();
      } catch (cleanupError) {
        console.warn("Password reset cooldown cleanup failed:", cleanupError);
      }
    }
    return NextResponse.json(
      { error: "Could not send the reset email right now. Please try again later." },
      { status: 503 }
    );
  }
}
