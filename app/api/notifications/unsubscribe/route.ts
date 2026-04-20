import { NextResponse } from "next/server";

import { getDatabasePool } from "@/lib/aws/database";
import { verifySignedNotificationToken } from "@/lib/notifications/token";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const eventId = url.searchParams.get("eventId");
  const faceId = url.searchParams.get("faceId");

  if (!token || !eventId || !faceId) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }

  const payload = verifySignedNotificationToken(token, "unsubscribe");
  if (!payload || payload.eventId !== eventId || payload.faceId !== faceId) {
    return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  }

  const pool = await getDatabasePool();
  await pool.query(
    `
      UPDATE event_attendees
      SET photo_notifications_unsubscribed_at = COALESCE(photo_notifications_unsubscribed_at, now()),
          updated_at = now()
      WHERE event_id = $1
        AND attendee_id = $2
    `,
    [payload.eventId, payload.sub],
  );

  return new NextResponse("You have been unsubscribed from this event's match emails.", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
