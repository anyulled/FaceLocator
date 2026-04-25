import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractRequestId as extractAuthRequestId, resolveAdminIdentity } from "@/lib/admin/auth";
import { sendMatchedPhotoNotificationViaBackend } from "@/lib/admin/events/backend";
import { buildAdminErrorResponse } from "@/lib/admin/events/route-utils";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventSlug: string }> },
) {
  const actor = await resolveAdminIdentity(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const attendeeId =
    payload && typeof payload === "object" && "attendeeId" in payload
      ? String((payload as { attendeeId?: unknown }).attendeeId ?? "").trim()
      : "";

  if (!attendeeId) {
    return NextResponse.json({ error: "attendeeId is required" }, { status: 400 });
  }

  const { eventSlug } = await context.params;

  try {
    const summary = await sendMatchedPhotoNotificationViaBackend({
      eventSlug,
      attendeeId,
      forceResend: true,
    });

    if (summary.sent > 0) {
      return NextResponse.json({
        ...summary,
        message: "Notification email sent",
      });
    }

    if (summary.scanned === 0 || summary.reason === "candidate_not_found") {
      return NextResponse.json(
        {
          ...summary,
          error: "No matched face candidate found for this attendee in this event",
        },
        { status: 404 },
      );
    }

    if (summary.scanned > 0 && summary.sent === 0 && summary.failed > 0) {
      return NextResponse.json(
        {
          ...summary,
          error: "Internal error sending notifications",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ...summary,
        error: "Notification could not be sent",
      },
      { status: 409 },
    );
  } catch (error) {
    return buildAdminErrorResponse({
      error,
      scope: "admin-photos-notify-api",
      requestPath: request.nextUrl.pathname,
      requestId: extractAuthRequestId(request.headers) ?? null,
      defaultMessage: "Failed to send notification",
      defaultStatus: 500,
      context: { eventSlug, attendeeId, actorSub: actor.sub },
    });
  }
}
