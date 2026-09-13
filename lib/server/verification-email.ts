import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isSmtpConfigured, sendSmtpEmail } from "@/lib/email/smtp";

export type VerificationDelivery =
  | "sent"
  | "recent"
  | "unavailable";

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
  const firebaseLink = signInUrl
    ? adminAuth.generateEmailVerificationLink(email, { url: signInUrl })
    : adminAuth.generateEmailVerificationLink(email);
  return buildHostedVerificationLink(await firebaseLink, context);
}

export async function deliverVerificationEmail(
  _request: Request,
  input: {
    uid: string;
    email: string;
    displayName: string;
    context?: VerificationContext;
  }
): Promise<VerificationDelivery> {
  if (!isSmtpConfigured()) return "unavailable";

  const deliveryRef = adminDb
    .collection("verificationDeliveries")
    .doc(input.uid);
  const delivery = await deliveryRef.get();
  const lastSentAt = Number(delivery.data()?.lastSentAt ?? 0);
  if (lastSentAt > Date.now() - 5 * 60_000) {
    return "recent";
  }

  try {
    const signInUrl = verificationSignInUrl();
    const verificationLink = await generateWbtesVerificationLink(
      input.email,
      input.context ?? "staff"
    );

    await sendSmtpEmail({
      to: input.email,
      subject: "Verify your WBTE email address",
      text: [
        `Hello ${input.displayName},`,
        "",
        "Verify your email address before signing in to WBTE.",
        "Open the secure page below, then select Verify email.",
        `Verification page: ${verificationLink}`,
        "",
        ...(signInUrl
          ? [`After verification, sign in at: ${signInUrl}`]
          : ["After verification, return to the WBTE sign-in page on the computer running the local server."]),
        "If you did not request this verification, you can ignore this message.",
      ].join("\n"),
    });
    await deliveryRef.set({
      email: input.email,
      lastSentAt: Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });
    return "sent";
  } catch (error) {
    console.warn("Verification email delivery failed:", error);
    return "unavailable";
  }
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
