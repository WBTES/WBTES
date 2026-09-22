import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { studentMatchesTeacherScope } from "@/lib/assignment-scope";
import { effectivePeriodStatus } from "@/lib/periods";
import type {
  AppUser,
  EvaluationPeriod,
  Teacher,
  TeacherAssignment,
} from "@/lib/types";

export async function synchronizeTeacherAssignments(teacherId: string) {
  const teacherSnapshot = await adminDb.collection("teachers").doc(teacherId).get();
  if (!teacherSnapshot.exists) return null;

  const teacher = { id: teacherSnapshot.id, ...teacherSnapshot.data() } as Teacher;
  const [assignmentSnapshot, studentSnapshot, programSnapshot, periodSnapshot] = await Promise.all([
    adminDb.collection("teacherAssignments").where("teacherId", "==", teacherId).get(),
    adminDb.collection("users").where("role", "==", "student").get(),
    adminDb.collection("programs").where("status", "==", "active").get(),
    adminDb.collection("evaluationPeriods").get(),
  ]);
  const students = studentSnapshot.docs.map((item) => ({
    uid: item.id,
    ...item.data(),
  })) as AppUser[];
  const activeProgramIds = new Set(programSnapshot.docs.map((item) => item.id));
  const periods = periodMap(periodSnapshot.docs);
  const eligibleStudentIds = students
    .filter((student) => studentMatchesTeacherScope(student, teacher, activeProgramIds))
    .map((student) => student.uid);

  let assignmentsUpdated = 0;
  let studentLinks = 0;
  const writer = adminDb.bulkWriter();
  for (const assignmentDocument of assignmentSnapshot.docs) {
    const assignment = assignmentDocument.data() as TeacherAssignment;
    if (!isMutablePeriod(periods.get(assignment.periodId))) continue;

    const completionSnapshot = await adminDb
      .collection("evaluationCompletions")
      .where("assignmentId", "==", assignmentDocument.id)
      .get();
    const completedStudentIds = completionSnapshot.docs
      .map((item) => String(item.data().studentId ?? ""))
      .filter(Boolean);
    const subjectIsAssigned = teacher.subjectIds?.includes(assignment.subjectId) === true;
    const studentIds = [...new Set([
      ...(subjectIsAssigned ? eligibleStudentIds : []),
      ...completedStudentIds,
    ])];

    writer.update(assignmentDocument.ref, {
      departmentId: teacher.departmentId,
      programIds: teacher.programIds ?? [],
      yearLevels: teacher.yearLevels ?? [],
      sections: teacher.sections ?? [],
      studentIds,
      updatedAt: Date.now(),
    });
    assignmentsUpdated += 1;
    studentLinks += studentIds.length;
  }
  await writer.close();
  return { assignmentsUpdated, studentLinks };
}

export async function synchronizeStudentAssignments(student: AppUser) {
  const [assignmentSnapshot, teacherSnapshot, programSnapshot, periodSnapshot, completionSnapshot] = await Promise.all([
    adminDb.collection("teacherAssignments").get(),
    adminDb.collection("teachers").get(),
    adminDb.collection("programs").where("status", "==", "active").get(),
    adminDb.collection("evaluationPeriods").get(),
    adminDb.collection("evaluationCompletions").where("studentId", "==", student.uid).get(),
  ]);
  const teachers = new Map(teacherSnapshot.docs.map((item) => [
    item.id,
    { id: item.id, ...item.data() } as Teacher,
  ]));
  const activeProgramIds = new Set(programSnapshot.docs.map((item) => item.id));
  const periods = periodMap(periodSnapshot.docs);
  const completedAssignmentIds = new Set(
    completionSnapshot.docs.map((item) => String(item.data().assignmentId ?? ""))
  );

  let assignmentsUpdated = 0;
  let assignmentsAdded = 0;
  let assignmentsRemoved = 0;
  const writer = adminDb.bulkWriter();
  assignmentSnapshot.docs.forEach((assignmentDocument) => {
    const assignment = assignmentDocument.data() as TeacherAssignment;
    if (!isMutablePeriod(periods.get(assignment.periodId))) return;
    const teacher = teachers.get(assignment.teacherId);
    if (!teacher) return;
    const subjectIsAssigned = teacher.subjectIds?.includes(assignment.subjectId) === true;
    const eligible = subjectIsAssigned
      && studentMatchesTeacherScope(student, teacher, activeProgramIds);
    const studentIds = Array.isArray(assignment.studentIds) ? assignment.studentIds : [];
    const included = studentIds.includes(student.uid);
    const completed = completedAssignmentIds.has(assignmentDocument.id);
    if ((eligible && included) || (!eligible && (!included || completed))) return;

    writer.update(assignmentDocument.ref, {
      studentIds: eligible
        ? [...new Set([...studentIds, student.uid])]
        : studentIds.filter((studentId) => studentId !== student.uid),
      updatedAt: Date.now(),
    });
    assignmentsUpdated += 1;
    if (eligible) assignmentsAdded += 1;
    else assignmentsRemoved += 1;
  });
  await writer.close();
  return { assignmentsUpdated, assignmentsAdded, assignmentsRemoved };
}

function periodMap(documents: FirebaseFirestore.QueryDocumentSnapshot[]) {
  return new Map(documents.map((item) => [
    item.id,
    { id: item.id, ...item.data() } as EvaluationPeriod,
  ]));
}

function isMutablePeriod(period?: EvaluationPeriod) {
  return Boolean(period && effectivePeriodStatus(period) !== "closed");
}
