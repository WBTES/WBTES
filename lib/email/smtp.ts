"server-only";

import nodemailer from "nodemailer";

// ==========================================
// 1. TYPES & CUSTOM ERRORS
// ==========================================
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export class SmtpSendingLimitError extends Error {
  constructor() {
    super("Email provider sending limit reached.");
    this.name = "SmtpSendingLimitError";
  }
}

// ==========================================
// 2. SMTP CONFIGURATION HELPER
// ==========================================
function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || user;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "WBTE";
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === "true"
    : port === 465;
  const configured = Boolean(host && user && pass && fromEmail && Number.isFinite(port));
  return { host, port, user, pass, fromEmail, fromName, secure, configured };
}

export function isSmtpConfigured() {
  return smtpConfig().configured;
}

// ==========================================
// 3. CORE SENDING LOGIC (BATCHED)
// ==========================================
export async function sendSmtpEmails(messages: EmailMessage[]) {
  const config = smtpConfig();
  if (!config.configured) {
    throw new Error("SMTP is not configured in the project root .env. Restart the Next.js server after adding it.");
  }
  const valid = messages.filter((message) => message.to.includes("@"));
  if (valid.length === 0) return { sent: 0, failed: 0 };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15000,
    socketTimeout: 30000,
  });

  let sent = 0;
  let failed = 0;
  try {
    for (let i = 0; i < valid.length; i += 20) {
      const results = await Promise.allSettled(
        valid.slice(i, i + 20).map((message) =>
          transporter.sendMail({
            from: { name: config.fromName, address: config.fromEmail },
            to: message.to,
            replyTo: message.replyTo,
            subject: message.subject,
            text: message.text,
          })
        )
      );
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      sent += results.length - failures.length;
      failed += failures.length;
      
      if (
        failures.some((failure) => {
          const response = (failure.reason as { response?: unknown } | null)?.response;
          return typeof response === "string" && /daily user sending limit exceeded/i.test(response);
        })
      ) {
        throw new SmtpSendingLimitError();
      }
    }
  } finally {
    transporter.close();
  }

  if (failed > 0) {
    throw new Error(`${failed} email message${failed === 1 ? " was" : "s were"} rejected by the SMTP server.`);
  }
  return { sent, failed };
}

// ==========================================
// 4. ALL-IN-ONE ANNOUNCEMENT HELPER
// ==========================================
/**
 * Call this single function to broadcast an announcement to a list of email addresses.
 */
export async function sendAnnouncementBroadcast({
  recipients,
  subject,
  messageText,
}: {
  recipients: string[];
  subject: string;
  messageText: string;
}) {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured in environment variables.");
  }

  const cleanRecipients = recipients
    .map((email) => email.trim())
    .filter((email) => email.includes("@"));

  if (cleanRecipients.length === 0) {
    throw new Error("No valid recipient email addresses provided.");
  }

  const emailMessages: EmailMessage[] = cleanRecipients.map((to) => ({
    to,
    subject,
    text: messageText,
  }));

  const result = await sendSmtpEmails(emailMessages);
  return result;
}