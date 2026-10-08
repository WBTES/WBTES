import "server-only";

import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/server/require-admin";

export const EMAIL_ALREADY_REGISTERED = "This email is already registered. Sign in or use Forgot password.";
export const SCHOOL_ID_ALREADY_REGISTERED = "This School ID is already registered. Contact an administrator if it belongs to you.";

export function studentIdentityKey(type: "email" | "school_id", value: string) {
  return `${type}_${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
}

export async function claimStudentIdentities(
  transaction: FirebaseFirestore.Transaction,
  registration: { email: string; studentNumber?: string },
  registryId: string,
  uid: string,
  allowExistingOwner = false
) {
  const identities = [{ type: "email" as const, value: registration.email, fields: ["emailNormalized", "email"], message: EMAIL_ALREADY_REGISTERED }];
  const schoolId = registration.studentNumber?.trim();
  const keys: Array<{ type: "email" | "school_id"; value: string; fields: string[]; message: string }> = [...identities];
  if (schoolId) keys.push({ type: "school_id", value: schoolId, fields: ["studentNumberNormalized", "studentNumber"], message: SCHOOL_ID_ALREADY_REGISTERED });
  const reservations: Array<{ reference: FirebaseFirestore.DocumentReference; exists: boolean; type: string; value: string; needsOwner: boolean }> = [];

  for (const key of keys) {
    const normalized = key.value.trim().toLowerCase();
    const reference = adminDb.collection("studentIdentities").doc(studentIdentityKey(key.type, normalized));
    const existing = await transaction.get(reference);
    if (existing.exists) {
      const owner = existing.data()!;
      if (!allowExistingOwner || owner.registryId !== registryId || (owner.claimedUid && owner.claimedUid !== uid)) {
        throw new ApiError(409, key.message);
      }
      reservations.push({ reference, exists: true, type: key.type, value: normalized, needsOwner: !owner.claimedUid && Boolean(uid) });
      continue;
    }

    // Indexed lookups protect registrations made before identity reservations existed.
    for (const collection of ["studentRegistry", "users"]) {
      for (const field of key.fields) {
        const value = field.endsWith("Normalized") ? normalized : key.value.trim();
        const matches = await transaction.get(adminDb.collection(collection).where(field, "==", value).limit(2));
        if (matches.docs.some((document) => !allowExistingOwner || document.id !== (collection === "users" ? uid : registryId))) {
          throw new ApiError(409, key.message);
        }
      }
    }
    reservations.push({ reference, exists: false, type: key.type, value: normalized, needsOwner: false });
  }

  // All reads precede writes; both identifiers commit with the student profile.
  for (const reservation of reservations) {
    if (!reservation.exists) transaction.create(reservation.reference, {
      type: reservation.type,
      normalized: reservation.value,
      registryId,
      claimedUid: uid,
      createdAt: Date.now(),
    });
    else if (reservation.needsOwner) transaction.update(reservation.reference, { claimedUid: uid });
  }
}
