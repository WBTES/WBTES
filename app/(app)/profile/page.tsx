"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, Save, Camera, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile as updateAuthProfile } from "firebase/auth";
import { auth, db, firebaseReady } from "@/lib/firebase/client";
import { usePrograms } from "@/lib/use-programs";
import { formatRoleLabel } from "@/lib/utils";
import toast from "react-hot-toast";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB raw upload limit (will be compressed)
const AVATAR_MAX_DIM = 256; // final square size in px

// Resize + compress an image File into a small JPEG data URL.
// Keeps things free: stored straight in the Firestore user doc.
async function fileToCompressedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = dataUrl;
  });

  // Square-crop centered, scale to AVATAR_MAX_DIM
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_MAX_DIM;
  canvas.height = AVATAR_MAX_DIM;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_MAX_DIM, AVATAR_MAX_DIM);

  // Step quality down until result fits under ~120 KB (well below Firestore's 1 MB doc cap)
  const TARGET_BYTES = 120 * 1024;
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= TARGET_BYTES) return out;
  }
  return canvas.toDataURL("image/jpeg", 0.4);
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, refreshProfile, resendVerification } = useAuth();
  const { programs } = usePrograms();
  const [name, setName] = React.useState(profile?.displayName ?? "");
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [sendingVerification, setSendingVerification] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  React.useEffect(() => {
    if (profile?.displayName) setName(profile.displayName);
  }, [profile]);

  if (!profile) return null;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseReady || !user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        displayName: name,
        updatedAt: Date.now(),
      });
      if (auth.currentUser && auth.currentUser.displayName !== name) {
        await updateAuthProfile(auth.currentUser, { displayName: name });
      }
      await refreshProfile();
      toast.success("Profile updated");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Update failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const onPickPhoto = () => fileInputRef.current?.click();

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !firebaseReady || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await updateDoc(doc(db, "users", user.uid), {
        photoURL: dataUrl,
        updatedAt: Date.now(),
      });
      // Firebase Auth limits photoURL to ~2 KB, so we don't sync the data URL there.
      // The Firestore profile is the source of truth for the avatar.
      await refreshProfile();
      toast.success("Photo updated");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const onRemovePhoto = async () => {
    if (!firebaseReady || !user || !profile.photoURL) return;
    setUploading(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        photoURL: null,
        updatedAt: Date.now(),
      });
      await refreshProfile();
      toast.success("Photo removed");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Remove failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const onResendVerification = async () => {
    setSendingVerification(true);
    try {
      const delivery = await resendVerification();
      toast.success(delivery === "sent"
        ? "Verification email sent"
        : delivery === "verified"
          ? "Your email is already verified"
          : "Verification email sent recently; check your inbox");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not send verification email";
      toast.error(msg);
    } finally {
      setSendingVerification(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="relative">
            {profile.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-md dark:ring-slate-900"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-3xl font-bold text-white dark:text-slate-900 ring-2 ring-white shadow-md dark:ring-slate-900">
                {profile.displayName?.[0]?.toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={onPickPhoto}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-md transition-colors hover:bg-brand-700 disabled:opacity-60 dark:border-slate-900"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold">{profile.displayName}</p>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <p className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {formatRoleLabel(profile.role)}
            </p>
            {(profile.role === "department_head" || profile.role === "hr") && (
              <p className={`ml-2 mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                user?.emailVerified
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              }`}>
                {user?.emailVerified ? "Email verified" : "Email unverified"}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPickPhoto}
                disabled={uploading}
                className="btn-secondary text-xs"
              >
                <Camera className="h-3.5 w-3.5" /> {profile.photoURL ? "Change photo" : "Upload photo"}
              </button>
              {profile.photoURL && (
                <button
                  type="button"
                  onClick={onRemovePhoto}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
              {(profile.role === "department_head" || profile.role === "hr") && !user?.emailVerified && (
                <button
                  type="button"
                  onClick={onResendVerification}
                  disabled={sendingVerification}
                  className="btn-secondary text-xs"
                >
                  {sendingVerification ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Resend verification
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              JPG, PNG, or GIF; automatically resized to 256 x 256.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPhotoChange}
          />
        </div>
      </div>

      <form onSubmit={onSave} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">Account information</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Display name</label>
            <div className="relative mt-2">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={profile.email}
                disabled
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <div className="relative mt-2">
              <Shield className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={formatRoleLabel(profile.role)}
                disabled
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm capitalize text-slate-500 dark:border-slate-800 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>
        {profile.role === "student" && (
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Program</label>
              <input
                value={
                  programs.find((program) => program.id === profile.programId)
                    ?.code
                  ?? profile.course
                  ?? "Not assigned"
                }
                disabled
                className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Section</label>
              <input
                value={profile.section || "Not assigned"}
                disabled
                className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Year level</label>
              <input
                value={profile.yearLevel || "Not assigned"}
                disabled
                className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800"
              />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-3">
              Academic details come from your student registration and can be corrected by an administrator.
            </p>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
