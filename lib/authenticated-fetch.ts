"use client";

import { auth } from "@/lib/firebase/client";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again before using this action.");
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "The request could not be completed.");
  }
  return data;
}

export async function recordActivity(
  action: string,
  metadata: Record<string, string | number | boolean> = {}
) {
  try {
    const response = await authenticatedFetch("/api/activity", {
      method: "POST",
      body: JSON.stringify({ action, metadata }),
    });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error ?? "Activity log request failed.");
    }
  } catch (error) {
    console.warn("Activity log failed:", error);
  }
}
