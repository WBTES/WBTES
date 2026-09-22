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
  sourceId?: unknown;
  targetId?: unknown;
};

export async function POST(request: Request) {
  return saveDepartment(request, false);
}

export async function PATCH(request: Request) {
  return saveDepartment(request, true);
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as DepartmentBody;
    const sourceId = asString(body.sourceId, "Source department", 200);
    const targetId = asString(body.targetId, "Destination department", 200);
    if (sourceId === targetId) {
      throw new ApiError(400, "Choose a different destination department.");
    }

    const [source, target] = await Promise.all([
      adminDb.collection("departments").doc(sourceId).get(),
      adminDb.collection("departments").doc(targetId).get(),
    ]);
    if (!source.exists) throw new ApiError(404, "Source department was not found.");
    if (!target.exists) throw new ApiError(404, "Destination department was not found.");

    const directCollections = [
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
    const directSnapshots = await Promise.all(directCollections.map((collectionName) =>
      adminDb.collection(collectionName).where("departmentId", "==", sourceId).get()
    ));
    const announcementSnapshot = await adminDb.collection("announcements")
      .where("target.departmentId", "==", sourceId)
      .get();

    const writer = adminDb.bulkWriter();
    let migratedRecords = 0;
    directSnapshots.forEach((snapshot) => {
      snapshot.docs.forEach((document) => {
        writer.update(document.ref, { departmentId: targetId, updatedAt: Date.now() });
        migratedRecords += 1;
      });
    });
    announcementSnapshot.docs.forEach((document) => {
      writer.update(document.ref, { "target.departmentId": targetId, updatedAt: Date.now() });
      migratedRecords += 1;
    });
    await writer.close();
    await source.ref.delete();

    await writeAuditLog({
      userId: admin.uid,
      userEmail: admin.email,
      userRole: "admin",
      action: "department_merged",
      metadata: {
        sourceDepartmentId: sourceId,
        sourceDepartmentCode: source.data()?.code ?? "",
        targetDepartmentId: targetId,
        targetDepartmentCode: target.data()?.code ?? "",
        migratedRecords,
      },
    });
    return NextResponse.json({ ok: true, migratedRecords });
  } catch (error) {
    return apiErrorResponse(error, "Department merge failed.");
  }
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

    const dependencyQueries = [
      { collection: "programs", field: "departmentId" },
      { collection: "teachers", field: "departmentId" },
      { collection: "subjects", field: "departmentId" },
      { collection: "users", field: "departmentId" },
      { collection: "studentRegistry", field: "departmentId" },
      { collection: "teacherAssignments", field: "departmentId" },
      { collection: "evaluations", field: "departmentId" },
      { collection: "evaluationCompletions", field: "departmentId" },
      { collection: "performanceReports", field: "departmentId" },
      { collection: "announcements", field: "target.departmentId" },
    ];
    const dependencies = await Promise.all(
      dependencyQueries.map((dependency) =>
        adminDb.collection(dependency.collection)
          .where(dependency.field, "==", id)
          .limit(1)
          .get()
      )
    );
    const inUse = dependencyQueries.filter(
      (_, index) => !dependencies[index].empty
    ).map((dependency) => dependency.collection);
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
