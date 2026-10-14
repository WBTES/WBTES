"use client";

import * as React from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { KeyRound } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { getAuthErrorMessage } from "@/lib/firebase/auth-error";
import { FormField, inputCls } from "@/components/data-table";
import toast from "react-hot-toast";

export function StudentPasswordForm() {
  const [current, setCurrent] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { toast.error("Password confirmation does not match."); return; }
    const user = auth.currentUser;
    if (!user?.email) { toast.error("Sign in again before changing your password."); return; }
    setSaving(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, password);
      setCurrent(""); setPassword(""); setConfirmation("");
      toast.success("Password updated");
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "Password could not be changed."));
    } finally { setSaving(false); }
  };
  return <section className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4" />Change password</h2>
    <form onSubmit={submit} className="max-w-md space-y-4">
      <FormField label="Current password"><input type="password" required autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} className={inputCls} /></FormField>
      <FormField label="New password"><input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputCls} /></FormField>
      <FormField label="Confirm new password"><input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={inputCls} /></FormField>
      <div className="flex justify-end"><button type="submit" disabled={saving} className="btn-primary"><KeyRound className="h-4 w-4" />{saving ? "Updating..." : "Update password"}</button></div>
    </form>
  </section>;
}
