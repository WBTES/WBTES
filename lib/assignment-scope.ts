import type { AppUser, Teacher } from "@/lib/types";

type StudentScope = Pick<
  AppUser,
  "role" | "status" | "departmentId" | "programId" | "yearLevel" | "section"
>;

type TeacherScope = Pick<
  Teacher,
  "status" | "departmentId" | "programIds" | "yearLevels" | "sections"
>;

export function studentMatchesTeacherScope(
  student: StudentScope,
  teacher: TeacherScope,
  activeProgramIds?: ReadonlySet<string>
) {
  if (student.role !== "student" || (student.status ?? "active") !== "active") return false;
  if (teacher.status === "inactive" || student.departmentId !== teacher.departmentId) return false;
  if (!student.programId) return false;
  if (activeProgramIds && !activeProgramIds.has(student.programId)) return false;
  if (teacher.programIds?.length && !teacher.programIds.includes(student.programId)) return false;
  if (teacher.yearLevels?.length && !teacher.yearLevels.includes(student.yearLevel ?? "")) return false;
  if (
    teacher.sections?.length
    && !teacher.sections.some(
      (section) => section.toLowerCase() === student.section?.toLowerCase()
    )
  ) return false;
  return true;
}
