import { NextResponse } from "next/server";
import { sendSmtpEmails } from "@/lib/email/smtp";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.email.includes("@")) throw new ApiError(400, "Your administrator profile has no valid email address.");
    await sendSmtpEmails([{
      to: admin.email,
      subject: "WBTE SMTP test",
      text: "Your WBTE SMTP email configuration is working correctly.",
    }]);
    return NextResponse.json({ ok: true, sentTo: admin.email });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Test email failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
