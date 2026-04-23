import { NextResponse } from "next/server";

import {
  unsubscribeFromMatchedPhotoNotificationsViaBackend,
} from "@/lib/notifications/backend";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const eventId = url.searchParams.get("eventId");
  const faceId = url.searchParams.get("faceId");

  if (!token || !eventId || !faceId) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }

  const unsubscribed = await unsubscribeFromMatchedPhotoNotificationsViaBackend({
    eventId,
    faceId,
    token,
  });

  if (!unsubscribed) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }

  return new NextResponse("You have been unsubscribed from this event's match emails.", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
