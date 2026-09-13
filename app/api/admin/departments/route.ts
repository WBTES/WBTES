import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  apiErrorResponse,
  asString,
} from "@/lib/server/api-response";
import { writeAuditLog } from "@/lib/server/audit";
import { ApiError, requireAdmin } from "@/lib/server/require-admin";

export const runtime = "nodejs";

type DepartmentBody = {
  id?: unknown;
  name?: unknown;
  code?: unknown;
};

export async function POST(request: Request) {
  return saveDepartment(request, false);
}

export async function PATCH(request: Request) {
  return saveDepartment(request, true);
}

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const id = asString(
      new URL(request.url).searchParams.get("id"),
      "Department",
      200
    );
    const reference = adminDb.collection("departments").doc(id);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new ApiError(404, "Department was not found.");

    const dependencyCollections = [
      "programs",
      "teachers",
      "subjects",
      "users",
      "studentRegistry",
      "teacherAssignments",
      "evaluations",
      "evaluationCompletions",
      "performanceReports",
    ];
    const dependencies = await Promise.all(
      dependencyCollections.map((collectionName) =>
        adminDb.collection(collectionName)
          .where("departmentId", "==", id)
          .limit(1)
          .get()
      )
    );
    const inUse = dependencyCollections.filter(
      (_, index) => !dependencies[index].empty
    );
    if (inUse.length > 0) {
      throw new ApiError(
        409,
        `Cannot delete this department while it is used by: ${inUse.join(", ")}.`
      );
    }

    await reference.delete();
    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "department_deleted",
      metadata: { departmentId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Department deletion failed.");
  }
}

async function saveDepartment(request: Request, editing: boolean) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as DepartmentBody;
    const id = editing ? asString(body.id, "Department", 200) : "";
    const name = asString(body.name, "Department name", 150);
    const code = asString(body.code, "Department code", 30).toUpperCase();
    const reference = editing
      ? adminDb.collection("departments").doc(id)
      : adminDb.collection("departments").doc();
    const current = editing ? await reference.get() : null;
    if (editing && !current?.exists) {
      throw new ApiError(404, "Department was not found.");
    }

    const allDepartments = await adminDb.collection("departments").get();
    if (allDepartments.docs.some((department) =>
      department.id !== reference.id
      && String(department.data().code ?? "").toLowerCase() === code.toLowerCase()
    )) {
      throw new ApiError(409, `Department code ${code} already exists.`);
    }

    const batch = adminDb.batch();
    batch.set(reference, {
      name,
      code,
      createdAt: current?.data()?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }, { merge: false });
    await batch.commit();

    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: editing ? "department_updated" : "department_created",
      metadata: {
        departmentId: reference.id,
        code,
      },
    });
    return NextResponse.json({ ok: true, id: reference.id });
  } catch (error) {
    return apiErrorResponse(error, "Department save failed.");
  }
}
