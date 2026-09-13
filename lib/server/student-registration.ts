import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import {
  asString,
  normalizeEmail,
  optionalString,
} from "@/lib/server/api-response";
import { ApiError } from "@/lib/server/require-admin";
import { assertAllowedSchoolEmail } from "@/lib/server/school-email";
import type { Program } from "@/lib/types";

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
  assertAllowedSchoolEmail(email);

  const displayName = asString(input.displayName, "Student name", 150);
  if (displayName.length < 2) {
    throw new ApiError(400, "Student name must contain at least 2 characters.");
  }

  const studentNumber = options.requireStudentNumber
    ? asString(input.studentNumber, "Student number", 100)
    : optionalString(input.studentNumber, 100);
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
    studentNumberNormalized: studentNumber.trim().toLowerCase(),
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
  const normalized = studentNumber.trim().toLowerCase();
  const [normalizedMatches, legacyMatches] = await Promise.all([
    adminDb
      .collection("studentRegistry")
      .where("studentNumberNormalized", "==", normalized)
      .limit(2)
      .get(),
    adminDb
      .collection("studentRegistry")
      .where("studentNumber", "==", studentNumber)
      .limit(2)
      .get(),
  ]);
  const duplicate = [...normalizedMatches.docs, ...legacyMatches.docs]
    .some((document) => document.id !== currentRegistrationId);
  if (duplicate) {
    throw new ApiError(
      409,
      "This student number already has a registration. Contact an administrator if it belongs to you."
    );
  }
}
