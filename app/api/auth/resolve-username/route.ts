import { NextResponse } from "next/server";
import { adminDb, adminReady } from "@/lib/firebase/admin";
import { apiErrorResponse } from "@/lib/server/api-response";
import { ApiError } from "@/lib/server/require-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!adminReady) {
      throw new ApiError(503, "Firebase Admin credentials are not configured.");
    }
    const username = (new URL(request.url).searchParams.get("username") ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
      throw new ApiError(400, "Enter a valid username or email.");
    }
    const snapshot = await adminDb
      .collection("users")
      .where("usernameNormalized", "==", username)
      .limit(1)
      .get();
    if (snapshot.empty || snapshot.docs[0].data().status === "disabled") {
      throw new ApiError(404, "Username was not found.");
    }
    return NextResponse.json({
      email: String(snapshot.docs[0].data().email ?? ""),
    });
  } catch (error) {
    return apiErrorResponse(error, "Username lookup failed.");
  }
}
