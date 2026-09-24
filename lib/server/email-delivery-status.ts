import "server-only";

import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";

function senderStatusRef() {
  const sender = [
    process.env.SMTP_HOST?.trim().toLowerCase() ?? "",
    process.env.SMTP_USER?.trim().toLowerCase() ?? "",
    (process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim() || "").toLowerCase(),
  ].join("|");
  const id = createHash("sha256").update(sender).digest("hex");
  return adminDb.collection("emailDeliveryStatus").doc(id);
}

export async function isSmtpSendingPaused() {
  try {
    const status = await senderStatusRef().get();
    return Number(status.data()?.blockedUntil ?? 0) > Date.now();
  } catch (error) {
    console.warn("SMTP sending status could not be read:", error);
    return false;
  }
}

export async function pauseSmtpSending() {
  try {
    const now = Date.now();
    await senderStatusRef().set({
      blockedUntil: now + 60 * 60_000,
      updatedAt: now,
    });
  } catch (error) {
    console.warn("SMTP sending status could not be saved:", error);
  }
}
