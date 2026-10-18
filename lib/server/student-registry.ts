import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/server/require-admin";
import { emailDocumentId } from "@/lib/server/api-response";

export function studentRegistryId(uid: string) {
  return `student_${uid}`;
}

export async function findStudentRegistryReference(uid: string, profile: {
  email: string;
  studentRegistryId?: string;
  studentLogin?: "school_id";
  studentNumber?: string;
}) {
  if (profile.studentRegistryId) return adminDb.collection("studentRegistry").doc(profile.studentRegistryId);
  const linked = await adminDb.collection("studentRegistry").where("claimedUid", "==", uid).limit(2).get();
  if (linked.docs.length > 1) throw new ApiError(409, "Multiple student records are linked to this account. Contact an administrator.");
  if (linked.docs.length === 1) return linked.docs[0].ref;
  if (profile.studentLogin !== "school_id") {
    const legacy = adminDb.collection("studentRegistry").doc(emailDocumentId(profile.email));
    const snapshot = await legacy.get();
    const owner = snapshot.data()?.claimedUid;
    const schoolId = profile.studentNumber?.trim().toLowerCase();
    const matchesKnownProfile = !owner && schoolId
      && schoolId === String(snapshot.data()?.studentNumber ?? "").trim().toLowerCase();
    if (snapshot.exists && (owner === uid || matchesKnownProfile)) return legacy;
  }
  return adminDb.collection("studentRegistry").doc(studentRegistryId(uid));
}
