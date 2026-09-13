import { NextResponse } from "next/server";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";
import {
  apiErrorResponse,
  asString,
  normalizeEmail,
  optionalString,
} from "@/lib/server/api-response";
import { ApiError } from "@/lib/server/require-admin";

export const runtime = "nodejs";

const attempts = new Map<string, number[]>();
const allowedTopics = new Set(["General", "Feedback", "Bug report", "Research"]);

type ContactBody = {
  name?: unknown;
  email?: unknown;
  topic?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

export async function POST(request: Request) {
  try {
    if (!isSmtpConfigured()) {
      throw new ApiError(503, "Contact email is not configured yet.");
    }
    enforceRateLimit(
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "local"
    );
    const body = await request.json() as ContactBody;
    if (optionalString(body.website, 200)) {
      return NextResponse.json({ ok: true });
    }
    const name = asString(body.name, "Full name", 120);
    const email = normalizeEmail(body.email);
    const topic = asString(body.topic, "Topic", 30);
    const subject = asString(body.subject, "Subject", 160);
    const message = asString(body.message, "Message", 5000);
    if (!allowedTopics.has(topic)) throw new ApiError(400, "Select a valid topic.");

    const recipient =
      process.env.CONTACT_EMAIL?.trim()
      || process.env.SMTP_FROM_EMAIL?.trim()
      || process.env.SMTP_USER?.trim()
      || "";
    if (!recipient) throw new ApiError(503, "Contact recipient is not configured.");
    await sendSmtpEmail({
      to: recipient,
      replyTo: email,
      subject: `[WBTE ${topic}] ${subject}`,
      text: [
        `Name: ${name}`,
        `Reply email: ${email}`,
        `Topic: ${topic}`,
        "",
        message,
      ].join("\n"),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Your message could not be sent.");
  }
}

function enforceRateLimit(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < 60 * 60 * 1000
  );
  if (recent.length >= 5) {
    throw new ApiError(429, "Too many messages were sent. Please try again later.");
  }
  recent.push(now);
  attempts.set(key, recent);
}
