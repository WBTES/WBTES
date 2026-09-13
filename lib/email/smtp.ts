import "server-only";

import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

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

export async function sendSmtpEmail(message: EmailMessage) {
  return sendSmtpEmails([message]);
}

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
        valid.slice(i, i + 20).map((message) => transporter.sendMail({
          from: { name: config.fromName, address: config.fromEmail },
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
        }))
      );
      const failures = results.filter((result) => result.status === "rejected").length;
      sent += results.length - failures;
      failed += failures;
    }
  } finally {
    transporter.close();
  }
  if (failed > 0) throw new Error(`${failed} email message${failed === 1 ? " was" : "s were"} rejected by the SMTP server.`);
  return { sent, failed };
}
