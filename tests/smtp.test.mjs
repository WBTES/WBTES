import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function fixture({ failure, configured = true } = {}) {
  const messages = [];
  const transports = [];
  let closed = 0;
  const nodemailer = {
    createTransport(options) {
      transports.push(options);
      return {
        async sendMail(message) {
          messages.push(message);
          if (failure) throw failure;
          return { accepted: [message.to] };
        },
        close() { closed++; },
      };
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("../lib/email/smtp.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", compiled)(
    (name) => {
      assert.equal(name, "nodemailer");
      return nodemailer;
    }, module, module.exports, {
      env: configured ? {
        SMTP_HOST: "smtp.example.test", SMTP_PORT: "587",
        SMTP_USER: "sender@example.test", SMTP_PASS: "fixture-only",
        SMTP_FROM_NAME: "WBTE",
      } : {},
    }
  );
  return { ...module.exports, messages, transports, closed: () => closed };
}

const message = {
  to: "student@example.test", subject: "Account link", text: "Fixture content",
  replyTo: "support@example.test",
};

test("single-email export uses the existing pooled sender and preserves message fields", async () => {
  const f = fixture();
  assert.deepEqual(await f.sendSmtpEmail(message), { sent: 1, failed: 0 });
  assert.deepEqual(f.messages, [{ from: { name: "WBTE", address: "sender@example.test" }, ...message }]);
  assert.equal(f.transports[0].pool, true);
  assert.equal(f.transports[0].maxConnections, 3);
  assert.equal(f.closed(), 1);
});

test("single-email export propagates SMTP rejection rather than reporting delivery", async () => {
  const f = fixture({ failure: new Error("SMTP rejected recipient") });
  await assert.rejects(f.sendSmtpEmail(message), /rejected by the SMTP server/);
  assert.equal(f.closed(), 1);
});

test("single-email export preserves the sending-limit error used by recovery and verification", async () => {
  const f = fixture({ failure: { response: "550 Daily user sending limit exceeded" } });
  await assert.rejects(f.sendSmtpEmail(message), (error) => error instanceof f.SmtpSendingLimitError);
  assert.equal(f.closed(), 1);
});

test("single-email export cannot silently succeed when its recipient was filtered out", async () => {
  const f = fixture();
  await assert.rejects(f.sendSmtpEmail({ ...message, to: "" }), /valid recipient/);
  assert.equal(f.messages.length, 0);
});

test("missing SMTP configuration fails without creating a transport", async () => {
  const f = fixture({ configured: false });
  await assert.rejects(f.sendSmtpEmail(message), /SMTP is not configured/);
  assert.equal(f.transports.length, 0);
});

test("existing batch and announcement senders still work without calling real SMTP", async () => {
  const f = fixture();
  const messages = Array.from({ length: 23 }, (_, index) => ({ ...message, to: `student${index}@example.test` }));
  assert.deepEqual(await f.sendSmtpEmails(messages), { sent: 23, failed: 0 });
  assert.equal(f.messages.length, 23);
  assert.equal(f.closed(), 1);
  assert.deepEqual(await f.sendAnnouncementBroadcast({
    recipients: [" one@example.test ", "two@example.test"], subject: "Notice", messageText: "Fixture notice",
  }), { sent: 2, failed: 0 });
  assert.equal(f.messages[23].to, "one@example.test");
  assert.equal(f.messages[24].to, "two@example.test");
  assert.equal(f.closed(), 2);
});
