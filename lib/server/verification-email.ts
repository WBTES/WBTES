import "server-only";

import { randomUUID } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmail, SmtpSendingLimitError } from "@/lib/email/smtp";
import { isSmtpSendingPaused, pauseSmtpSending } from "@/lib/server/email-delivery-status";

export type VerificationDelivery =
  | "sent"
  | "recent"
  | "processing"
  | "rate_limited"
  | "link_unavailable"
  | "smtp_rate_limited"
  | "smtp_unavailable";

type VerificationContext = "student" | "staff";

export function verificationSignInUrl() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
    ?.trim()
    .replace(/\/$/, "");
  if (!configuredOrigin) return null;

  try {
    const url = new URL(configuredOrigin);
    const hostname = url.hostname.toLowerCase();
    const isLoopback = hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname.endsWith(".localhost");
    if (!["http:", "https:"].includes(url.protocol) || isLoopback) return null;
    return `${configuredOrigin}/login?verified=1`;
  } catch {
    return null;
  }
}

export async function generateWbtesVerificationLink(
  email: string,
  context: VerificationContext = "student"
) {
  const signInUrl = verificationSignInUrl();
  let firebaseLink: string;
  try {
    firebaseLink = signInUrl
      ? await adminAuth.generateEmailVerificationLink(email, { url: signInUrl })
      : await adminAuth.generateEmailVerificationLink(email);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (!signInUrl || !["auth/invalid-continue-uri", "auth/unauthorized-continue-uri"].includes(code ?? "")) {
      throw error;
    }
    console.warn("Verification return URL was rejected by Firebase; using its hosted confirmation page.");
    firebaseLink = await adminAuth.generateEmailVerificationLink(email);
  }
  return buildHostedVerificationLink(firebaseLink, context);
}

export function isVerificationRateLimited(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  return code === "auth/too-many-requests"
    || code === "auth/quota-exceeded"
    || /too.many.attempts|quota.exceeded|rate.limit/i.test(message);
}

export async function deliverVerificationEmail(
  input: {
    uid: string;
    email: string;
    displayName: string;
    username?: string;
    context?: VerificationContext;
  }
): Promise<VerificationDelivery> {
  if (!isSmtpConfigured()) return "smtp_unavailable";
  if (await isSmtpSendingPaused()) return "smtp_rate_limited";

  const deliveryRef = adminDb
    .collection("verificationDeliveries")
    .doc(input.uid);
  const attemptId = randomUUID();
  const now = Date.now();
  try {
    const existing = await adminDb.runTransaction(async (transaction) => {
      const delivery = await transaction.get(deliveryRef);
      const data = delivery.data();
      const nextAllowedAt = Number(data?.nextAllowedAt ?? Number(data?.lastSentAt ?? 0) + 5 * 60_000);
      if (nextAllowedAt > now) {
        return (data?.lastResult as VerificationDelivery | undefined) ?? "recent";
      }
      transaction.set(deliveryRef, {
        email: input.email,
        attemptId,
        lastResult: "processing",
        nextAllowedAt: now + 2 * 60_000,
        updatedAt: now,
      }, { merge: true });
      return null;
    });
    if (existing) return existing;
  } catch (error) {
    console.warn("Verification delivery cooldown could not be checked:", error);
    return "link_unavailable";
  }

  async function finish(result: VerificationDelivery, cooldownMs: number, errorCode: string | null = null) {
    try {
      await adminDb.runTransaction(async (transaction) => {
        const delivery = await transaction.get(deliveryRef);
        if (delivery.data()?.attemptId !== attemptId) return;
        transaction.set(deliveryRef, {
          lastResult: result,
          lastErrorCode: errorCode,
          nextAllowedAt: Date.now() + cooldownMs,
          ...(result === "sent" ? { lastSentAt: Date.now() } : {}),
          updatedAt: Date.now(),
        }, { merge: true });
      });
    } catch (error) {
      console.warn("Verification delivery result could not be saved:", error);
    }
    return result;
  }

  const signInUrl = verificationSignInUrl();
  let verificationLink: string;
  try {
    verificationLink = await generateWbtesVerificationLink(
      input.email,
      input.context ?? "staff"
    );
  } catch (error) {
    console.warn("Verification link generation failed:", error);
    const rawCode = (error as { code?: unknown } | null)?.code;
    const errorCode = typeof rawCode === "string" && /^auth\/[a-z-]+$/.test(rawCode)
      ? rawCode
      : "unknown";
    return isVerificationRateLimited(error)
      ? finish("rate_limited", 60 * 60_000, errorCode)
      : finish("link_unavailable", 5 * 60_000, errorCode);
  }

  try {
    await sendSmtpEmail({
      to: input.email,
      subject: "Verify your WBTE email address",
      text: [
        `Hello ${input.displayName},`,
        "",
        "Verify your email address before signing in to WBTE.",
        ...(input.username ? [`Username: ${input.username}`] : []),
        "Open the secure page below, then select Verify email.",
        `Verification page: ${verificationLink}`,
        "",
        ...(signInUrl
          ? [`After verification, sign in at: ${signInUrl}`]
          : ["After verification, return to the WBTE sign-in page on the computer running the local server."]),
        "If you did not request this verification, you can ignore this message.",
      ].join("\n"),
    });
  } catch (error) {
    console.warn("Verification SMTP delivery failed:", error);
    if (error instanceof SmtpSendingLimitError) {
      await pauseSmtpSending();
      return finish("smtp_rate_limited", 60 * 60_000);
    }
    return finish("smtp_unavailable", 10 * 60_000);
  }

  return finish("sent", 5 * 60_000);
}

function buildHostedVerificationLink(
  firebaseLink: string,
  context: VerificationContext
) {
  const configuredHandler = process.env.FIREBASE_EMAIL_ACTION_URL?.trim();
  if (!configuredHandler) return firebaseLink;

  try {
    const source = new URL(firebaseLink);
    const target = new URL(configuredHandler);
    if (target.protocol !== "https:") return firebaseLink;
    source.searchParams.forEach((value, key) => {
      target.searchParams.set(key, value);
    });
    target.searchParams.set("context", context);
    return target.toString();
  } catch {
    return firebaseLink;
  }
}
