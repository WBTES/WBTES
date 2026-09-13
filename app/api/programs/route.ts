import { NextResponse } from "next/server";
import { adminDb, adminReady } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

type ProgramInput = {
  id?: string;
  name?: string;
  code?: string;
  departmentId?: string;
  status?: string;
};

export async function GET() {
  try {
    if (!adminReady) {
      throw new ApiError(
        503,
        "Firebase Admin credentials are not configured on the server."
      );
    }
    const snapshot = await adminDb.collection("programs").orderBy("code").get();
    return NextResponse.json({
      programs: snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })),
    });
  } catch (error) {
    return errorResponse(error, "Programs could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const input = await readProgramInput(request);
    const now = Date.now();
    const reference = await adminDb.collection("programs").add({
      name: input.name,
      code: input.code,
      departmentId: input.departmentId,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });
    const linked = await synchronizeStudents(
      reference.id,
      input.code,
      input.name,
      input.departmentId
    );
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "program_created",
      metadata: { programId: reference.id, code: input.code },
    });
    return NextResponse.json({
      ok: true,
      id: reference.id,
      linked,
    });
  } catch (error) {
    return errorResponse(error, "Program creation failed.");
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const input = await readProgramInput(request, true);
    const reference = adminDb.collection("programs").doc(input.id);
    if (!(await reference.get()).exists) {
      throw new ApiError(404, "Program was not found.");
    }
    await reference.update({
      name: input.name,
      code: input.code,
      departmentId: input.departmentId,
      status: input.status,
      updatedAt: Date.now(),
    });
    const linked = await synchronizeStudents(
      input.id,
      input.code,
      input.name,
      input.departmentId
    );
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "program_updated",
      metadata: { programId: input.id, code: input.code },
    });
    return NextResponse.json({ ok: true, id: input.id, linked });
  } catch (error) {
    return errorResponse(error, "Program update failed.");
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { id?: string };
    const id = body.id?.trim() ?? "";
    if (!id) throw new ApiError(400, "Program ID is required.");

    const [
      students,
      registrations,
      questions,
      announcements,
      teachers,
      assignments,
    ] = await Promise.all([
      adminDb.collection("users").where("programId", "==", id).get(),
      adminDb.collection("studentRegistry").where("programId", "==", id).get(),
      adminDb.collection("evaluationQuestions").where(
        "programIds",
        "array-contains",
        id
      ).get(),
      adminDb.collection("announcements").where(
        "target.programId",
        "==",
        id
      ).get(),
      adminDb.collection("teachers").where(
        "programIds",
        "array-contains",
        id
      ).get(),
      adminDb.collection("teacherAssignments").where(
        "programIds",
        "array-contains",
        id
      ).get(),
    ]);
    if (
      !students.empty
      || !registrations.empty
      || !questions.empty
      || !announcements.empty
      || !teachers.empty
      || !assignments.empty
    ) {
      throw new ApiError(
        409,
        "Cannot delete this Program while students, questions, announcements, teachers, or assignments still use it."
      );
    }

    await adminDb.collection("programs").doc(id).delete();
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "program_deleted",
      metadata: { programId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Program deletion failed.");
  }
}

async function readProgramInput(
  request: Request,
  requireId = false
) {
  const body = await request.json() as ProgramInput;
  const input = {
    id: body.id?.trim() ?? "",
    name: body.name?.trim() ?? "",
    code: body.code?.trim().toUpperCase() ?? "",
    departmentId: body.departmentId?.trim() ?? "",
    status: body.status === "inactive" ? "inactive" as const : "active" as const,
  };
  if (requireId && !input.id) throw new ApiError(400, "Program ID is required.");
  if (!input.name || !input.code || !input.departmentId) {
    throw new ApiError(400, "Program name, code, and department are required.");
  }

  const department = await adminDb.collection("departments").doc(
    input.departmentId
  ).get();
  if (!department.exists) throw new ApiError(400, "Select a valid department.");

  const programs = await adminDb.collection("programs").get();
  const duplicate = programs.docs.some((program) =>
    program.id !== input.id
    && String(program.data().code ?? "").trim().toLowerCase()
      === input.code.toLowerCase()
  );
  if (duplicate) {
    throw new ApiError(409, `Program code ${input.code} already exists.`);
  }
  return input;
}

async function synchronizeStudents(
  programId: string,
  code: string,
  name: string,
  departmentId: string
) {
  const [snapshot, registrySnapshot] = await Promise.all([
    adminDb.collection("users").where("role", "==", "student").get(),
    adminDb.collection("studentRegistry").get(),
  ]);
  const legacyLabels = new Set([
    code.trim().toLowerCase(),
    name.trim().toLowerCase(),
  ]);
  const students = snapshot.docs.filter((student) => {
    const data = student.data();
    const legacyCourse = String(data.course ?? "").trim().toLowerCase();
    return data.programId === programId
      || (!data.programId && legacyLabels.has(legacyCourse));
  });
  const registrations = registrySnapshot.docs.filter((student) => {
    const data = student.data();
    const legacyCourse = String(data.course ?? "").trim().toLowerCase();
    return data.programId === programId
      || (!data.programId && legacyLabels.has(legacyCourse));
  });

  const records = [
    ...students.map((student) => student.ref),
    ...registrations.map((student) => student.ref),
  ];
  for (let index = 0; index < records.length; index += 450) {
    const batch = adminDb.batch();
    records.slice(index, index + 450).forEach((reference) => {
      batch.update(reference, {
        programId,
        departmentId,
        course: code,
        updatedAt: Date.now(),
      });
    });
    await batch.commit();
  }
  return Math.max(students.length, registrations.length);
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}
