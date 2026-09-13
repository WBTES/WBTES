import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  isAnnouncementVisible,
  sortAnnouncements,
} from "@/lib/announcements";
import { apiErrorResponse } from "@/lib/server/api-response";
import { requireAuthenticatedAppUser } from "@/lib/server/require-admin";
import type { Announcement, AppUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { profile } = await requireAuthenticatedAppUser(request);
    const snapshot = await adminDb.collection("announcements").get();
    const appUser: AppUser = profile;
    const announcements = snapshot.docs
      .map((document) => ({
        id: document.id,
        ...(document.data() as Omit<Announcement, "id">),
      }))
      .filter((announcement) => isAnnouncementVisible(announcement, appUser))
      .sort(sortAnnouncements)
      .slice(0, 100);

    return NextResponse.json(
      { announcements },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return apiErrorResponse(error, "Announcements could not be loaded.");
  }
}
