import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import {
  asString,
  normalizeEmail,
  optionalString,
} from "@/lib/server/api-response";
import { ApiError } from "@/lib/server/require-admin";
import type { Program } from "@/lib/types";
import { studentIdentityKey, SCHOOL_ID_ALREADY_REGISTERED } from "@/lib/server/student-identities";

export type StudentRegistrationInput = {
  email?: unknown;
  displayName?: unknown;
  studentNumber?: unknown;
  programId?: unknown;
  yearLevel?: unknown;
  section?: unknown;
};

const allowedYearLevels = new Set(["1st", "2nd", "3rd", "4th"]);

export async function validateStudentRegistration(
  input: StudentRegistrationInput,
  options: { requireStudentNumber?: boolean } = {}
) {
  const email = normalizeEmail(input.email);
  // School email assertion removed to allow reuse/existing emails

  const displayName = asString(input.displayName, "Student name", 150);
  if (displayName.length < 2) {
    throw new ApiError(400, "Student name must contain at least 2 characters.");
  }

  const studentNumber = options.requireStudentNumber
    ? asString(input.studentNumber, "Student number", 100)
    : optionalString(input.studentNumber, 100);
  if (typeof input.studentNumber === "string"
    && (input.studentNumber.trim().length > 100 || /[\x00-\x1f\x7f]/.test(input.studentNumber))) {
    throw new ApiError(400, "Enter a valid School ID of up to 100 characters.");
  }
  const programId = asString(input.programId, "Program", 200);
  const yearLevel = asString(input.yearLevel, "Year level", 50);
  const section = asString(input.section, "Section", 100);
  if (!allowedYearLevels.has(yearLevel)) {
    throw new ApiError(400, "Select a valid year level.");
  }

  const programSnapshot = await adminDb.collection("programs").doc(programId).get();
  if (!programSnapshot.exists || programSnapshot.data()?.status === "inactive") {
    throw new ApiError(400, "Select an active academic Program.");
  }
  const program = programSnapshot.data() as Omit<Program, "id">;

  return {
    email,
    emailNormalized: email,
    displayName,
    studentNumber,
    studentNumberNormalized: studentNumber ? studentNumber.trim().toLowerCase() : "",
    programId,
    departmentId: program.departmentId,
    course: program.code,
    yearLevel,
    section,
  };
}

export async function assertStudentNumberAvailable(
  studentNumber: string,
  currentRegistrationId = ""
) {
  if (!studentNumber) return;

  const normalized = studentNumber.trim().toLowerCase();
  const reservation = await adminDb.collection("studentIdentities")
    .doc(studentIdentityKey("school_id", normalized)).get();
  if (reservation.exists && reservation.data()?.registryId !== currentRegistrationId) {
    throw new ApiError(409, SCHOOL_ID_ALREADY_REGISTERED);
  }
  const current = currentRegistrationId
    ? await adminDb.collection("studentRegistry").doc(currentRegistrationId).get()
    : null;
  for (const name of ["studentRegistry", "users"]) {
    const [normalizedMatches, legacyMatches] = await Promise.all([
      adminDb.collection(name).where("studentNumberNormalized", "==", normalized).limit(2).get(),
      adminDb.collection(name).where("studentNumber", "==", studentNumber).limit(2).get(),
    ]);
    const owner = name === "users" ? current?.data()?.claimedUid : currentRegistrationId;
    if ([...normalizedMatches.docs, ...legacyMatches.docs].some((document) => document.id !== owner)) {
      throw new ApiError(409, SCHOOL_ID_ALREADY_REGISTERED);
    }
  }
}
