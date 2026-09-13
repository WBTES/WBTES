import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/server/require-admin";
import type { BackupMetadata } from "@/lib/types";

const BACKUP_COLLECTIONS = [
  "users",
  "studentRegistry",
  "teachers",
  "departments",
  "programs",
  "subjects",
  "evaluationQuestions",
  "evaluationForms",
  "evaluationPeriods",
  "teacherAssignments",
  "evaluations",
  "evaluationCompletions",
  "announcements",
  "performanceReports",
  "notifications",
  "systemSettings",
] as const;

export async function createLogicalBackup(
  createdBy: string,
  automatic = false
) {
  const id = automatic
    ? `automatic_${dateKey(Date.now())}`
    : `manual_${Date.now()}`;
  const reference = adminDb.collection("systemBackups").doc(id);
  const shouldCreate = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists && existing.data()?.status === "ready") return false;
    transaction.set(reference, {
      createdAt: Date.now(),
      createdBy,
      automatic,
      collectionCount: BACKUP_COLLECTIONS.length,
      documentCount: 0,
      status: "creating",
    }, { merge: true });
    return true;
  });
  if (!shouldCreate) {
    return { id, created: false };
  }

  try {
    const writer = adminDb.bulkWriter();
    let documentCount = 0;
    for (const collectionName of BACKUP_COLLECTIONS) {
      const snapshot = await adminDb.collection(collectionName).get();
      snapshot.docs.forEach((document) => {
        const backupDocumentId = Buffer
          .from(`${collectionName}/${document.id}`)
          .toString("base64url");
        writer.set(reference.collection("documents").doc(backupDocumentId), {
          collectionName,
          documentId: document.id,
          data: document.data(),
        });
        documentCount += 1;
      });
    }
    await writer.close();
    await reference.update({
      documentCount,
      status: "ready",
      completedAt: Date.now(),
    });
    return { id, created: true, documentCount };
  } catch (error) {
    await reference.set({
      status: "failed",
      error: error instanceof Error ? error.message : "Backup failed.",
      completedAt: Date.now(),
    }, { merge: true });
    throw error;
  }
}

export async function listLogicalBackups() {
  const snapshot = await adminDb
    .collection("systemBackups")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() as Omit<BackupMetadata, "id">),
  }));
}

export async function exportLogicalBackup(backupId: string) {
  const reference = adminDb.collection("systemBackups").doc(backupId);
  const [metadata, documents] = await Promise.all([
    reference.get(),
    reference.collection("documents").get(),
  ]);
  if (!metadata.exists || metadata.data()?.status !== "ready") {
    throw new ApiError(404, "Ready backup was not found.");
  }
  const collections: Record<string, Record<string, unknown>> = {};
  let anonymousEvaluationIndex = 0;
  documents.docs.forEach((document) => {
    const data = document.data();
    const collectionName = String(data.collectionName ?? "");
    const documentId = collectionName === "evaluations"
      ? `anonymous_${String(++anonymousEvaluationIndex).padStart(6, "0")}`
      : String(data.documentId ?? "");
    if (!collections[collectionName]) collections[collectionName] = {};
    collections[collectionName][documentId] = serializeFirestoreValue(
      collectionName === "evaluations"
        ? sanitizeAnonymousEvaluation(data.data)
        : data.data
    );
  });
  return {
    version: 1,
    product: "WBTE",
    backupId,
    metadata: serializeFirestoreValue(metadata.data()),
    collections,
  };
}

export async function restoreLogicalBackup(
  backupId: string,
  restoredBy: string
) {
  const reference = adminDb.collection("systemBackups").doc(backupId);
  const metadata = await reference.get();
  if (!metadata.exists || metadata.data()?.status !== "ready") {
    throw new ApiError(404, "Ready backup was not found.");
  }
  const documents = await reference.collection("documents").get();
  const deleteWriter = adminDb.bulkWriter();
  for (const collectionName of BACKUP_COLLECTIONS) {
    const current = await adminDb.collection(collectionName).get();
    current.docs.forEach((document) => deleteWriter.delete(document.ref));
  }
  await deleteWriter.close();

  const writer = adminDb.bulkWriter();
  documents.docs.forEach((document) => {
    const data = document.data();
    const collectionName = String(data.collectionName ?? "");
    const documentId = String(data.documentId ?? "");
    if (!BACKUP_COLLECTIONS.includes(collectionName as typeof BACKUP_COLLECTIONS[number])) {
      return;
    }
    const destination = collectionName === "evaluations"
      ? adminDb.collection(collectionName).doc()
      : adminDb.collection(collectionName).doc(documentId);
    writer.set(
      destination,
      collectionName === "evaluations"
        ? sanitizeAnonymousEvaluation(data.data)
        : data.data ?? {},
      { merge: false }
    );
  });
  await writer.close();
  await reference.set({
    lastRestoredAt: Date.now(),
    lastRestoredBy: restoredBy,
  }, { merge: true });
  return { restored: documents.size };
}

export async function deleteLogicalBackup(backupId: string) {
  const reference = adminDb.collection("systemBackups").doc(backupId);
  const documents = await reference.collection("documents").get();
  const writer = adminDb.bulkWriter();
  documents.docs.forEach((document) => writer.delete(document.ref));
  writer.delete(reference);
  await writer.close();
}

function dateKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value !== "object") return value;
  const maybeTimestamp = value as { toMillis?: () => number };
  if (typeof maybeTimestamp.toMillis === "function") {
    return { __firestoreTimestamp: maybeTimestamp.toMillis() };
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, serializeFirestoreValue(item)])
  );
}

function sanitizeAnonymousEvaluation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const data: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
    anonymous: true,
  };
  delete data.studentId;
  delete data.submissionHash;
  delete data.assignmentId;
  delete data.submittedAt;
  delete data.section;
  return data;
}
