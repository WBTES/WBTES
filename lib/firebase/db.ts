// Convenience helpers for working with Firestore data.

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./client";

export async function getCollection<T = DocumentData>(
  path: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  if (!db.app) return [];
  const q = query(collection(db, path), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

export async function getDocument<T = DocumentData>(path: string, id: string): Promise<T | null> {
  if (!db.app) return null;
  const snap = await getDoc(doc(db, path, id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null;
}

export async function createDocument<T extends DocumentData>(path: string, data: T) {
  if (!db.app) throw new Error("Firebase not configured");
  return addDoc(collection(db, path), { ...data, createdAt: Date.now() });
}

export async function updateDocument(path: string, id: string, data: Partial<DocumentData>) {
  if (!db.app) throw new Error("Firebase not configured");
  return updateDoc(doc(db, path, id), { ...data, updatedAt: Date.now() });
}

export async function deleteDocument(path: string, id: string) {
  if (!db.app) throw new Error("Firebase not configured");
  return deleteDoc(doc(db, path, id));
}

export type { QueryConstraint, QueryDocumentSnapshot };
export { where, orderBy, limit, startAfter };
