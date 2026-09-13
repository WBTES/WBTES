import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  applyActionCode,
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const actionCode = params.get("oobCode");
const apiKey = params.get("apiKey");
const context = params.get("context");
const continueUrl = safeContinueUrl(params.get("continueUrl"));

const elements = {
  button: document.querySelector("#verify-button"),
  continueLink: document.querySelector("#continue-link"),
  eyebrow: document.querySelector("#eyebrow"),
  message: document.querySelector("#message"),
  note: document.querySelector("#supporting-note"),
  symbol: document.querySelector("#status-symbol"),
  title: document.querySelector("#page-title"),
};

const completionKey = actionCode
  ? `wbtes-email-verified:${await digest(actionCode)}`
  : "";

if (completionKey && window.sessionStorage.getItem(completionKey) === "true") {
  showSuccess();
} else if (mode !== "verifyEmail" || !actionCode || !apiKey) {
  showError(
    "Invalid verification link",
    "This link is incomplete. Open the full verification link from the newest WBTE email."
  );
} else {
  elements.button.addEventListener("click", verifyEmail);
}

async function verifyEmail() {
  setWorking();
  try {
    const app = initializeApp({ apiKey });
    await applyActionCode(getAuth(app), actionCode);
    window.sessionStorage.setItem(completionKey, "true");
    showSuccess();
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (
      code === "auth/expired-action-code"
      || code === "auth/invalid-action-code"
    ) {
      showError(
        "Verification link already completed",
        "This one-time link was already used or has expired. If you already selected Verify email, return to WBTE and sign in."
      );
      return;
    }
    showError(
      "Email could not be verified",
      "Check your internet connection and open the newest WBTE verification email again."
    );
  }
}

function setWorking() {
  elements.button.disabled = true;
  elements.button.textContent = "Verifying...";
  elements.eyebrow.textContent = "Verification in progress";
  elements.symbol.className = "status-symbol status-symbol-working";
  elements.symbol.querySelector("span").textContent = "...";
}

function showSuccess() {
  elements.eyebrow.textContent = "Verification complete";
  elements.title.textContent = "Email verified";
  elements.message.textContent = context === "staff"
    ? "Your WBTE email address is confirmed. You can return to the sign-in page."
    : "Your WBTE email address is confirmed. You can now return to WBTE and sign in.";
  elements.note.textContent = "You may safely close this page.";
  elements.symbol.className = "status-symbol status-symbol-success";
  elements.symbol.querySelector("span").textContent = "OK";
  elements.button.classList.add("hidden");
  showContinueLink();
}

function showError(title, message) {
  elements.eyebrow.textContent = "Verification status";
  elements.title.textContent = title;
  elements.message.textContent = message;
  elements.note.textContent = "Use the newest verification email or return to WBTE to request another link.";
  elements.symbol.className = "status-symbol status-symbol-error";
  elements.symbol.querySelector("span").textContent = "!";
  elements.button.classList.add("hidden");
  showContinueLink();
}

function showContinueLink() {
  if (!continueUrl) return;
  elements.continueLink.href = continueUrl;
  elements.continueLink.classList.remove("hidden");
}

function safeContinueUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (
      url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "::1"
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const result = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
