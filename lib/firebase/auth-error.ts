export function getAuthErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const message = raw.replace(/^Firebase:\s*/i, "").trim();

  if (/invalid-credential|wrong-password|user-not-found/i.test(message)) {
    return "The email or password is incorrect.";
  }
  if (/email-already-in-use/i.test(message)) {
    return "An account already uses this email address.";
  }
  if (/invalid-email/i.test(message)) {
    return "Enter a valid email address.";
  }
  if (/weak-password/i.test(message)) {
    return "Use a password with at least 8 characters.";
  }
  if (/too-many-requests/i.test(message)) {
    return "Too many attempts. Wait a little before trying again.";
  }
  if (/network-request-failed/i.test(message)) {
    return "WBTE could not connect. Check your internet connection and try again.";
  }
  if (/popup-closed-by-user|cancelled-popup-request/i.test(message)) {
    return "Google sign-in was cancelled.";
  }
  if (/permission|insufficient/i.test(message)) {
    return "Your profile could not be prepared. Contact a WBTE administrator.";
  }

  return message || fallback;
}
